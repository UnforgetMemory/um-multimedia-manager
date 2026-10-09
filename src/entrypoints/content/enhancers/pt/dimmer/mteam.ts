import { throttle } from '@/libraries/utils';
import { runChunked, type ChunkOptions, type ChunkedRun } from '@/libraries/utils/dom-chunk';
import { getMTeamSets, applyCacheFallback } from './cache';
import { getMTeamRowOutcome } from './mteam-match';
import { memoRowIds } from './row-id-memo';
import type { CachedIdSets, HandlerContext, ListPageHandler } from '../types';
import { dimElement, undimElement } from '../utils';

/** Rows written per animation frame on the browse list (~100 rows typical). */
const MTEAM_CHUNK_SIZE = 20;

export class MTeamHandler implements ListPageHandler {
  readonly id = 'mteam';

  match(_url: string): boolean {
    const href = location.href;
    return href.includes('m-team.cc') && (href.includes('/browse') || href.includes('#/browse'));
  }

  getSelector(): string {
    return '#root, #app-content, body';
  }

  contentCheck(el: Element): boolean {
    return el.childElementCount > 0 && el.querySelector('a[href]') !== null;
  }

  private debug: (...args: unknown[]) => void = () => {};
  private observer: MutationObserver | null = null;

  /** Watched IDs cache (avoids repeated DB fetches on pollTimer cycles) */
  private movieDoubanIds: Set<string> | null = null;
  private musicDoubanIds: Set<string> | null = null;
  private imdbIds: Set<string> | null = null;
  private setsExpiry = 0;

  constructor() {}

  /**
   * 使 30s 的 ID 集合 TTL 缓存立即过期。record:updated/deleted 事件触发时由
   * PTDimmer.onRecordChange 调用，确保重跑 process() 会重新从 DB 拉取已看集合。
   */
  invalidateCache(): void {
    this.setsExpiry = 0;
  }

  private getCachedSets(): {
    movieDoubanIds: Set<string>;
    musicDoubanIds: Set<string>;
    imdbIds: Set<string>;
  } | null {
    if (
      this.movieDoubanIds &&
      this.musicDoubanIds &&
      this.imdbIds &&
      Date.now() < this.setsExpiry
    ) {
      return {
        movieDoubanIds: this.movieDoubanIds,
        musicDoubanIds: this.musicDoubanIds,
        imdbIds: this.imdbIds,
      };
    }
    return null;
  }

  extractMTeamIds(row: Element): {
    movieDoubanId: string | null;
    musicDoubanId: string | null;
    imdbId: string | null;
  } {
    const el = row as HTMLElement;
    const cached = el.dataset.ummIds;
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        /* fall through */
      }
    }

    const result = {
      movieDoubanId: null as string | null,
      musicDoubanId: null as string | null,
      imdbId: null as string | null,
    };
    let scannedLinks = 0;

    for (const link of Array.from(row.querySelectorAll('a[href]'))) {
      scannedLinks++;
      let href = link.getAttribute('href') || '';
      try {
        href = new URL(href, location.origin).href;
      } catch {
        // ignore
      }

      // Direct href match first — the broad douban.com/subject regex also catches
      // music.douban.com links (subdomain not excluded); the music check below then
      // re-classifies the same ID when the link is music-specific.
      if (!result.movieDoubanId) {
        const subjectId = href.match(/douban\.com\/subject\/(\d+)/)?.[1];
        if (subjectId) result.movieDoubanId = subjectId;
      }

      if (!result.musicDoubanId) {
        const subjectId = href.match(/music\.douban\.com\/subject\/(\d+)/)?.[1];
        if (subjectId) result.musicDoubanId = subjectId;
      }

      if (!result.imdbId) {
        const id = href.match(/imdb\.com\/title\/((?:tt)?\d+)/)?.[1];
        if (id) result.imdbId = id.startsWith('tt') ? id : `tt${id}`;
      }

      // Query-param fallback: M-Team wraps douban/imdb links as ?douban= / ?imdb=
      // redirect params on some rows (e.g. movie detail pages), so also scan the URL
      // query when no ID was found in plain hrefs.
      if (!result.movieDoubanId || !result.musicDoubanId || !result.imdbId) {
        try {
          const parsed = new URL(href, location.origin);
          const doubanHref = parsed.searchParams.get('douban') || '';
          const imdbHref = parsed.searchParams.get('imdb') || '';

          if (!result.movieDoubanId) {
            const subjectId = doubanHref.match(/douban\.com\/subject\/(\d+)/)?.[1];
            if (subjectId) result.movieDoubanId = subjectId;
          }

          if (!result.musicDoubanId) {
            const subjectId = doubanHref.match(/music\.douban\.com\/subject\/(\d+)/)?.[1];
            if (subjectId) result.musicDoubanId = subjectId;
          }

          if (!result.imdbId && imdbHref) {
            const id = imdbHref.match(/\/title\/((?:tt)?\d+)/)?.[1];
            if (id) result.imdbId = id.startsWith('tt') ? id : `tt${id}`;
          }
        } catch {
          // ignore
        }
      }

      // Early exit if any ID found (matches legacy script behavior)
      if (result.movieDoubanId || result.musicDoubanId || result.imdbId) {
        break;
      }
    }

    try {
      el.dataset.ummIds = JSON.stringify(result);
    } catch {
      /* ignore quota errors */
    }
    return result;
  }

  getMTeamRows(root: Document | HTMLElement = document): Element[] {
    return Array.from(root.querySelectorAll("tr, [role='row'], .ant-table-row")).filter((row) => {
      if (!(row instanceof HTMLElement)) return false;
      if (row.querySelector('th')) return false;
      if (row.querySelector('td.colhead')) return false;
      return Boolean(
        row.querySelector('a[href*="/detail/"]') ||
        row.querySelector('a[href*="/mdb/title"]') ||
        row.querySelector('.torrent-list__thumbnail'),
      );
    });
  }

  private getMTeamRowSignature(
    row: Element,
    ids: { movieDoubanId: string | null; musicDoubanId: string | null; imdbId: string | null },
  ): string {
    const detailLink = row.querySelector('a[href*="/detail/"]') as HTMLAnchorElement | null;
    const detailHref = detailLink?.getAttribute('href') || detailLink?.href || '';

    const scoreLinks = Array.from(row.querySelectorAll('a[href*="/mdb/title"]'))
      .map((link) => {
        const anchor = link as HTMLAnchorElement;
        return anchor.getAttribute('href') || anchor.href || '';
      })
      .join('|');

    return [
      detailHref,
      ids.movieDoubanId || '',
      ids.musicDoubanId || '',
      ids.imdbId || '',
      scoreLinks,
    ].join('::');
  }

  /** In-flight chunked row pass — a new pass cancels it so passes never interleave writes. */
  private rowRun: ChunkedRun | null = null;

  /**
   * Chunked per-row pass (X9-B): ~100 browse rows × 3-4 attribute writes would be
   * a synchronous long task right after the DB fetch. runChunked spreads writes over
   * animation frames; the returned promise resolves once the whole pass has run, so
   * callers (process → unresolved filter → cache fallback) still see final markers.
   * Dedup on re-runs: the previous in-flight pass is cancelled first — rows it
   * already stamped are skipped by the signature check, rows it never reached are
   * simply written by the new pass.
   */
  processMTeamRows(
    rows: Element[],
    movieDoubanIds: Set<string>,
    musicDoubanIds: Set<string>,
    imdbIds: Set<string>,
    options: ChunkOptions = {},
  ): Promise<void> {
    this.rowRun?.cancel();
    let skipped = 0,
      dimmed = 0,
      notMatched = 0;
    const run = runChunked(
      rows,
      (row) => {
        const ids = this.extractMTeamIds(row);
        const signature = this.getMTeamRowSignature(row, ids);
        if (
          row.getAttribute('data-umm-mteam-signature') === signature &&
          row.getAttribute('data-umm-mteam-resolved') === 'true'
        ) {
          skipped++;
          return;
        }

        row.setAttribute('data-umm-mteam-signature', signature);

        const outcome = getMTeamRowOutcome(ids, movieDoubanIds, musicDoubanIds, imdbIds);

        if (outcome.matched) {
          this.debug('[M-Team] DIMMED ✓ row:', JSON.stringify(ids));
        }

        // 修复（audit M3）：仅 matched 行标记 resolved。未匹配行保持 unresolved，
        // 使 process() 的 unresolved 过滤非空 → applyCacheFallback 得以执行并消费 pt_id_cache。
        if (outcome.resolved) {
          // Extracted (not DOM-guessed) ids: keep the memo aligned with the
          // resolved marker this write creates.
          memoRowIds(row, {
            doubanId: ids.movieDoubanId ?? ids.musicDoubanId ?? undefined,
            imdbId: ids.imdbId ?? undefined,
          });
          row.setAttribute('data-umm-mteam-resolved', 'true');
        }
        row.setAttribute('data-umm-mteam-matched', outcome.matched ? 'true' : 'false');

        if (outcome.matched) {
          dimElement(row as HTMLElement);
          dimmed++;
        } else {
          // Rows carrying at least one direct ID got a fresh "not watched"
          // verdict here — un-dim (D1). ID-less rows are only "unknown" at
          // this pass (verdict belongs to applyCacheFallback), so their class
          // stays untouched to avoid flickering cache-resolved rows.
          const hasDirectId = !!(ids.movieDoubanId || ids.musicDoubanId || ids.imdbId);
          if (hasDirectId) undimElement(row as HTMLElement);
          notMatched++;
        }
      },
      { chunkSize: MTEAM_CHUNK_SIZE, ...options },
    );
    this.rowRun = run;
    return run.promise.finally(() => {
      if (this.rowRun === run) this.rowRun = null;
      this.debug(
        '[M-Team] processMTeamRows done — total:',
        rows.length,
        '| dimmed:',
        dimmed,
        '| no match:',
        notMatched,
        '| dedup skipped:',
        skipped,
      );
    });
  }

  private active = false;
  private processing = false;
  private processQueued = false;

  private safeProcess(process: () => Promise<void>): void {
    if (this.processing) {
      this.processQueued = true;
      return;
    }
    this.processing = true;
    void process()
      .catch((err) => {
        console.warn('[PT Dimmer] process error:', err);
      })
      .finally(() => {
        this.processing = false;
        if (this.processQueued && this.active) {
          this.processQueued = false;
          this.safeProcess(process);
        }
      });
  }

  private pollTimer: number | null = null;

  setupMTeamWatcher(process: () => Promise<void>): void {
    this.debug('[M-Team] Setting up MTeam watcher');
    this.active = true;

    const wrappedProcess = async () => {
      await process();
      if (!this.observer) {
        this.attachMTeamObserver(process);
      }
      // Observer attached and initial run complete — poll timer is no longer needed
      if (this.observer) {
        this.stopPollTimer();
        this.debug('[M-Team] Observer active, poll timer stopped');
      }
    };

    this.safeProcess(wrappedProcess);

    // Safety net: only runs until observer is attached (typically < 3s)
    this.pollTimer = window.setInterval(() => {
      this.safeProcess(process);
    }, 1400);
    this.debug('[M-Team] Poll timer started (safety net until observer attaches)');
  }

  private stopPollTimer(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private attachMTeamObserver(process: () => Promise<void>): void {
    const root = document.getElementById('root');
    if (!root) return;

    this.debug('[M-Team] Observer target: #root (subtree)');
    this.observer = new MutationObserver(
      this.throttle(() => {
        this.debug('[M-Team] Mutation detected, re-processing...');
        this.safeProcess(process);
      }, 180),
    );
    this.observer.observe(root, { childList: true, subtree: true });
  }

  teardown(): void {
    this.active = false;
    this.processing = false;
    this.processQueued = false;
    // Stop any in-flight chunked pass — its remaining writes target a dead page.
    this.rowRun?.cancel();
    this.rowRun = null;
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private throttle<T extends (...args: unknown[]) => void>(
    fn: T,
    delay: number,
  ): (...args: Parameters<T>) => void {
    return throttle(fn, delay);
  }

  async process(context: HandlerContext): Promise<void> {
    const { debug, idCache, cacheTimestamp } = context;
    this.debug = debug;

    // Use internal TTL cache to avoid repeated DB fetches on pollTimer cycles
    const cached = this.getCachedSets();
    let sets: CachedIdSets;
    if (cached) {
      sets = cached;
      this.debug('[M-Team] Using cached ID sets');
    } else {
      const result = await getMTeamSets(debug, idCache, cacheTimestamp);
      sets = result;
      this.movieDoubanIds = new Set(result.movieDoubanIds);
      this.musicDoubanIds = new Set(result.musicDoubanIds);
      this.imdbIds = new Set(result.imdbIds);
      this.setsExpiry = Date.now() + 30000;
    }
    const rows = this.getMTeamRows(document);
    this.debug('[M-Team] Found', rows.length, 'rows');
    // Await the frame-spread pass: the unresolved filter below must see final markers.
    await this.processMTeamRows(rows, sets.movieDoubanIds, sets.musicDoubanIds, sets.imdbIds);

    // Cache fallback: for unresolved rows, check pt_id_cache by detail URL
    const unresolved = rows.filter((r) => r.getAttribute('data-umm-mteam-resolved') !== 'true');
    if (unresolved.length > 0) {
      this.debug('[M-Team] Cache fallback for', unresolved.length, 'unresolved rows');
      await applyCacheFallback(
        debug,
        unresolved,
        (row) => {
          const link = row.querySelector('a[href*="/detail/"]') as HTMLAnchorElement | null;
          return link?.href ?? null;
        },
        sets.movieDoubanIds,
        sets.musicDoubanIds,
        sets.imdbIds,
        dimElement,
      );
    }

    // NOTE: We do NOT stop the reactive loop here — focused observer on row container
    // is event-driven (no polling), fires only when Ant Design swaps rows.
  }

  setup(_target: HTMLElement, process: () => Promise<void>): void {
    if (this.active) return;
    this.setupMTeamWatcher(process);
  }

  isActive(): boolean {
    return this.active;
  }

  isMTeamDomPresent(): boolean {
    return document.querySelectorAll('[role="row"]').length > 3;
  }
}
