/**
 * NexusPHP 站点通用处理器（配置驱动，支持后台扫描）
 */

import { Store } from '@/engine/database';
import { runChunked, type ChunkOptions } from '@/libraries/utils/dom-chunk';
import { getScanner, type ScanTask } from '../scanner';
import { getListPageConfig } from '../config';
import { getMovieSets } from './cache';
import { memoRowIds } from './row-id-memo';
import type { HandlerContext, ListPageHandler } from '../types';
import { dimElement, undimElement } from '../utils';
import { buildRowByUrl } from './nexusphp-rowmap';

/** Rows processed per animation frame (host tables can hold ~100+ rows). */
const NEXUSPHP_CHUNK_SIZE = 20;

export class NexusPHPHandler implements ListPageHandler {
  readonly id = 'nexusphp';

  constructor() {}

  match(url: string): boolean {
    return getListPageConfig(url) !== null;
  }

  getSelector(): string {
    const config = getListPageConfig(location.href);
    return config?.rowSelector ?? 'table.torrents > tbody > tr';
  }

  /**
   * 处理页面
   *
   * `chunkOptions` is the test seam for runChunked (injectable schedule);
   * production callers omit it.
   */
  async process(context: HandlerContext, chunkOptions: ChunkOptions = {}): Promise<void> {
    const { debug } = context;
    const config = getListPageConfig(location.href);
    if (!config) return;

    // Lazily load or use cached ID sets
    if (!context.idCache || Date.now() - context.cacheTimestamp > 30_000) {
      const { doubanIds, imdbIds } = await getMovieSets(
        debug,
        context.idCache,
        context.cacheTimestamp,
      );
      context.idCache = { movieDoubanIds: doubanIds, musicDoubanIds: new Set<string>(), imdbIds };
      context.cacheTimestamp = Date.now();
    }

    const { movieDoubanIds: doubanIds, imdbIds } = context.idCache;
    debug(`[${config.domain}] ID sets — douban:`, doubanIds.size, 'imdb:', imdbIds.size);

    const rows = document.querySelectorAll(config.rowSelector);
    if (rows.length === 0) {
      debug(`[${config.domain}] No rows found`);
      return;
    }

    debug(`[${config.domain}] Found`, rows.length, 'rows');
    const chunkRun = { chunkSize: NEXUSPHP_CHUNK_SIZE, ...chunkOptions };
    let dimmed = 0,
      notMatched = 0,
      needScan = 0;

    // Collect URLs for scanning
    const scanTasks: ScanTask[] = [];
    // Rows backing scanTasks, in the same order — reused by buildRowByUrl below
    const scanRows: Element[] = [];

    // Rows that need a cache lookup (no direct ID match yet)
    const toResolve: { row: Element; url: string }[] = [];

    const rowList = Array.from(rows);

    // X9-B: direct-ID pass is frame-chunked (~100 rows × dim writes in one task
    // was a host-page long task); writes stay sequential, so ordering is identical.
    await runChunked(
      rowList,
      (row) => {
        // Skip already-resolved rows — they were either dimmed or confirmed no-match
        if (row.getAttribute('data-umm-resolved') === 'true') return;

        if (config.skipRowSelector && row.querySelector(config.skipRowSelector)) {
          notMatched++;
          return;
        }

        let hasDirectLink = false;

        if (config.extractIdsFromRow) {
          const ids = config.extractIdsFromRow(row);
          memoRowIds(row, ids);
          const matched =
            (ids.doubanId && doubanIds.has(ids.doubanId)) ||
            (ids.imdbId && imdbIds.has(ids.imdbId));
          if (matched) {
            dimElement(row as HTMLElement);
            dimmed++;
            hasDirectLink = true;
          } else if (ids.doubanId || ids.imdbId) {
            // Fresh "not watched" verdict on a row that carries IDs — un-dim (D1).
            // ID-less rows keep their class: their verdict belongs to the
            // cache/scan pass, un-diming here would flicker cache-resolved rows.
            undimElement(row as HTMLElement);
          }
        }

        if (hasDirectLink) return;

        // Skip IndexedDB lookup when background scanning is disabled
        if (!config.enableBackgroundScan) {
          notMatched++;
          return;
        }

        // Check cache
        const detailUrl = config.extractDetailUrl(row);
        if (!detailUrl) {
          notMatched++;
          return;
        }

        // Normalize URL
        let normalizedUrl: string;
        try {
          const u = new URL(detailUrl, location.origin);
          normalizedUrl = `${u.origin}${u.pathname}${u.search}`;
        } catch {
          normalizedUrl = detailUrl;
        }

        toResolve.push({ row, url: normalizedUrl });
      },
      chunkRun,
    ).promise;

    // Batch cache lookup — one message round-trip for all unresolved rows
    if (toResolve.length > 0) {
      const cacheMap = await Store.ptIdCacheGetBulk(toResolve.map((t) => t.url));

      // X9-B: resolved-marker/dim writes are frame-chunked for the same reason.
      await runChunked(
        toResolve,
        ({ row, url }) => {
          const cached = cacheMap[url];
          if (cached) {
            // pt_id_cache stores keys with a 'movie::' type prefix (pt-detail.ts); strip it
            // so bare IDs match the watched-id sets below (which are prefix-free).
            const cachedDouban = cached.doubanId?.replace('movie::', '');
            const cachedImdb = cached.imdbId?.replace('movie::', '');
            // Resolved marker is written for matched AND no-match rows below —
            // memoize the ids in both cases so a single-key event can clear it.
            memoRowIds(row, { doubanId: cachedDouban, imdbId: cachedImdb });
            const matched =
              (cachedDouban && doubanIds.has(cachedDouban)) ||
              (cachedImdb && imdbIds.has(cachedImdb));

            if (matched) {
              dimElement(row as HTMLElement);
              dimmed++;
            } else {
              // Cache entry found but no watched hit = fresh "not watched"
              // verdict — un-dim (D1).
              undimElement(row as HTMLElement);
              notMatched++;
            }
            row.setAttribute('data-umm-resolved', 'true');
            return;
          }

          // Enqueue for background scan — URLs already bulk-checked as cache misses above
          scanTasks.push({
            url,
            config,
            priority: 1,
            skipCacheCheck: true,
          });
          scanRows.push(row);
          needScan++;
        },
        chunkRun,
      ).promise;
    }

    debug(
      `[${config.domain}] Done — rows:`,
      rows.length,
      '| dimmed:',
      dimmed,
      '| no match:',
      notMatched,
      '| need scan:',
      needScan,
    );

    if (scanTasks.length > 0) {
      debug(`[${config.domain}] Starting background scan for`, scanTasks.length, 'urls');

      // O(1) URL → row 索引：扫描回调按 result.url 直接命中。X9-B：只对被扫描的行
      // （scanRows，与 scanTasks 同序）建图，不再重扫全表——逐行调用 buildRowByUrl
      // 复用其归一化/协议守卫契约；scanRows 只含扫描任务行，同 URL 时命中的必然是
      // 任务对应的行本身。
      const rowByUrl = new Map<string, HTMLElement>();
      for (const scanRow of scanRows) {
        for (const [scanUrl, matchedRow] of buildRowByUrl(scanRow, config)) {
          rowByUrl.set(scanUrl, matchedRow);
        }
      }

      const scanner = getScanner(config.scanConcurrency, config.scanDelayRange);

      scanner
        .scanBatch(scanTasks, (result) => {
          if (!result.success || (!result.entry.doubanId && !result.entry.imdbId)) return;

          // Same 'movie::' prefix strip as the cache-hit path above — pt_id_cache keys are type-prefixed
          const cachedDouban = result.entry.doubanId?.replace('movie::', '');
          const cachedImdb = result.entry.imdbId?.replace('movie::', '');
          const { movieDoubanIds: mIds, imdbIds: iIds } = context.idCache ?? {
            movieDoubanIds: new Set<string>(),
            imdbIds: new Set<string>(),
          };
          const matched =
            (cachedDouban && mIds.has(cachedDouban)) || (cachedImdb && iIds.has(cachedImdb));
          if (!matched) return;

          const row = rowByUrl.get(result.url);
          if (
            row &&
            !row.classList.contains('umm-dimmed') &&
            row.getAttribute('data-umm-resolved') !== 'true'
          ) {
            memoRowIds(row, { doubanId: cachedDouban, imdbId: cachedImdb });
            dimElement(row);
            row.setAttribute('data-umm-resolved', 'true');
          }
        })
        .then(async (results) => {
          const successCount = results.filter((r) => r.success).length;
          debug(
            `[${config.domain}] Background scan complete — success:`,
            successCount,
            '| failed:',
            results.length - successCount,
          );
        })
        .catch((err) => {
          console.warn(`[${config.domain}] Background scan error:`, err);
        });
    }
  }

  /**
   * NexusPHP 使用通用 MutationObserver，无需自定义 setup
   */
  setup(): void {
    // No custom setup — uses generic MutationObserver
  }

  teardown(): void {}
}
