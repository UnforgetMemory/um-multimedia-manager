// ─── Mukaku 处理器类 ──────────────────────────────────
// Orchestration only. Collaborators extracted for the ≤600-line gate with honest
// seams: ./queue (RequestQueue construction + progress-toast wiring) and
// ./detail (detail-page status-chip rendering, deps injected).

import { RequestQueue } from '@/libraries/utils/request-queue';
import type { ChunkedRun } from '@/libraries/utils/dom-chunk';
import { initEventBus, onEvent } from '@/libraries/utils/event-bus';
import { FloatingToast } from '../../utils/toast';
import { waitForElement } from '../../utils/dom';
import { t } from '../../i18n';
import { warnLog, infoLog, errorLog, debugLog } from '@/libraries/utils/logger';
import { MUKAKU_CONFIG, NETWORK_CONFIG } from './config';
import { MukakuToastController } from './toast';
import { createMukakuQueue } from './queue';
import { renderMukakuDetailState } from './detail';
import { extractMvId, imageFileName, collectVisibleCards, PROCESSED_ATTR } from './dom';
import {
  getApiUrl,
  extractLinkedIdsFromPayload,
  shouldPersistProbe,
  extractListEntries,
  getListApiUrl,
} from './api';
import {
  probeCacheSet,
  probeCacheGet,
  probeCacheGetBulk,
  getWatchedIdSets,
  cleanupLegacyMukakuCaches,
} from './cache';
import {
  clearProcessedMarkers,
  createDebouncedScheduler,
  isDetailContextStale,
  shouldRefreshForEvent,
} from './refresh';
import { createSerialRunner } from './processing';
import { resolveCardState, type CardAction } from './resolve';
import { applyCardActions, type CardApplyInput } from './apply';
import { MukakuListObserver } from './list-observer';

/** List-API fail cooldown: no retry for 30s after a failed fetch (prevents scan-storm request floods). */
const LIST_API_FAIL_COOLDOWN_MS = 30_000;
/** Probe-failure retry cooldown: a card whose probe failed is retried only after 30s (and its processed marker is cleared so it is re-collected). */
const PROBE_FAIL_COOLDOWN_MS = 30_000;
/** Per-scan card cap (hostile pages must not drive unbounded probes/state growth). */
const MAX_CARDS_PER_SCAN = 500;
/** Session-cooldown set cap (beyond this, new no-association entries are dropped). */
const MAX_SESSION_NO_ASSOCIATION = 2000;

class MukakuHandler {
  private queue: RequestQueue | null = null;
  /** In-memory probe cache: mvId → linked IDs. LRU-limited via MUKAKU_CONFIG.PROBE_CACHE_MAX. */
  private probeCache = new Map<string, { doubanId: string | null; imdbId: string | null }>();
  /** Handler-level watched ID cache: provider → { movieDoubanIds, imdbIds, ts }. 30s TTL reduces dbGetAll calls. */
  private watchedIdCache: { movieDoubanIds: Set<string>; imdbIds: Set<string>; ts: number } | null =
    null;
  /** Session-scoped cooldown: mvIds confirmed to have no douban/imdb association this page session. Cleared on resetForPage/cleanup. */
  private sessionNoAssociation = new Set<string>();
  /** Per-card probe-failure cooldown: mvId → ts; failed probes are retried only after the cooldown expires (and the processed marker is cleared so the card is re-collected). */
  private probeFailCooldown = new Map<string, number>();
  /** Generation counter for the watched-id cache: bumped by onRecordChange/resetForPage so an in-flight scan never resurrects an invalidated cache (R3). */
  private watchedCacheEpoch = 0;
  /** List-API mapping cache: image filename → linked ids (keyed by sb:page, page-session scoped; failed fetches cool down 30s to prevent request storms). */
  private listMappingCache: {
    sb: string;
    map: Map<string, { doubanId: string; imdbId: string | null }>;
  } | null = null;
  /** Per-key (sb:page) list-API fail timestamps — one term's failure must not block another (O3). */
  private listMappingFailTs: Record<string, number> = {};
  /** Serial runner: coalesces re-entrant scans (route change during in-flight scan is re-run, not dropped). */
  private runner = createSerialRunner();
  /**
   * In-flight chunked marker-clear pass. Cancelled before a newer pass starts so a
   * record-event storm never runs N concurrent frame-chunked clears (same idiom as
   * PTDimmer.clearResolvedMarkers / MTeamHandler.processMTeamRows).
   */
  private pendingClear: ChunkedRun | null = null;
  /** Lazy-load observer + debounce lifecycle (owns the Intersection/Mutation observers). */
  private observers = new MukakuListObserver(() =>
    this.runner.run(() => this.processVisibleCards()),
  );
  /** 300ms trailing-edge debounce — coalesces record event storms (bulk import). */
  private refreshScheduler = createDebouncedScheduler(300, {
    setTimeout: (cb, ms) => window.setTimeout(cb, ms),
    clearTimeout: (handle) => window.clearTimeout(handle),
  });
  /** Event-bus unsubscribe fns (record:updated / record:deleted). */
  private eventBusUnsubscribers: Array<() => void> = [];
  /** Guards activate() against double subscription. */
  private activated = false;

  /**
   * 确保请求队列存在（始终复用同一个队列实例；构造见 ./queue）
   */
  private ensureQueue(): RequestQueue {
    if (!this.queue) {
      this.queue = createMukakuQueue();
    }

    return this.queue;
  }

  /**
   * Probe linked IDs (cached).
   *
   * Failure semantics (GOAL 1): network error / timeout / non-200 / invalid
   * payload all THROW — no memory write, no IDB write, no session cooldown;
   * the card is re-probed on the next scan.
   * Persistence semantics (GOAL 2): persist only on a successful fetch with
   * >=1 valid id (gated by shouldPersistProbe). Confirmed no association
   * (both ids null) enters the session cooldown set only — never persisted.
   */
  private async probeLinkedIds(
    mvId: string,
  ): Promise<{ doubanId: string | null; imdbId: string | null }> {
    if (!mvId) {
      return { doubanId: null, imdbId: null };
    }

    // 1. Session cooldown: confirmed no association this page session — skip network
    if (this.sessionNoAssociation.has(mvId)) {
      debugLog('[Mukaku] probe cooldown hit:', mvId);
      return { doubanId: null, imdbId: null };
    }

    // 1a. Failure cooldown: a recent failed probe is not retried within the window
    const failTs = this.probeFailCooldown.get(mvId);
    if (failTs !== undefined && Date.now() - failTs < PROBE_FAIL_COOLDOWN_MS) {
      return { doubanId: null, imdbId: null };
    }

    // 2. In-memory cache (fastest)
    if (this.probeCache.has(mvId)) {
      debugLog('[Mukaku] probe memory hit:', mvId);
      return this.probeCache.get(mvId)!;
    }

    // 3. Persistent IDB cache (null-null entries are filtered as miss at the cache layer)
    const cached = await probeCacheGet(mvId);
    if (cached) {
      debugLog('[Mukaku] probe IDB hit:', mvId);
      const result = { doubanId: cached.doubanId, imdbId: cached.imdbId };
      this.probeCache.set(mvId, result);
      return result;
    }

    // LRU eviction before write: drop the oldest entry when at capacity
    if (this.probeCache.size >= MUKAKU_CONFIG.PROBE_CACHE_MAX) {
      const oldestKey = this.probeCache.keys().next().value;
      if (oldestKey !== undefined) this.probeCache.delete(oldestKey);
    }

    // 4. Queue the network request
    const extraction = await this.ensureQueue().enqueue(mvId, async () => {
      const response = await fetch(getApiUrl(mvId), {
        method: 'GET',
        signal: AbortSignal.timeout(NETWORK_CONFIG.TIMEOUT_MS),
      });

      if (!response.ok) {
        throw new Error(t('mukaku.probe_failed', { status: response.status }));
      }

      const payload = await response.json();
      return extractLinkedIdsFromPayload(payload);
    });

    // 5. Dispatch by result semantics
    if (extraction.status === 'invalid') {
      // Unusable response = failure: no memory/IDB/cooldown write — re-probed next scan
      throw new Error('invalid payload');
    }
    if (shouldPersistProbe(extraction)) {
      this.probeCache.set(mvId, { doubanId: extraction.doubanId, imdbId: extraction.imdbId });
      await probeCacheSet(mvId, {
        doubanId: extraction.doubanId,
        imdbId: extraction.imdbId,
        ts: Date.now(),
      });
    } else {
      // Confirmed no association: session cooldown only (cleared on navigation/cleanup), never persisted
      if (this.sessionNoAssociation.size < MAX_SESSION_NO_ASSOCIATION) {
        this.sessionNoAssociation.add(mvId);
      }
    }
    // A successful probe clears any failure cooldown for this card
    this.probeFailCooldown.delete(mvId);
    return { doubanId: extraction.doubanId, imdbId: extraction.imdbId };
  }

  /**
   * List-API mapping (image-match fallback for linkless cards).
   *
   * Fetches getVideoList?sb=xxx → data.data[] (image/doub_id/IMDB_number) →
   * image-filename → linked-ids map. Cached per sb:page session; failed
   * fetches cool down for 30s; returns null when the page has no sb param.
   */
  private async getListMapping(): Promise<Map<
    string,
    { doubanId: string; imdbId: string | null }
  > | null> {
    const params = new URLSearchParams(location.search);
    const sb = params.get('sb');
    if (!sb) return null;
    const page = params.get('page') || '1';
    const cacheKey = `${sb}:${page}`;

    if (this.listMappingCache?.sb === cacheKey) return this.listMappingCache.map;
    const failTs = this.listMappingFailTs[cacheKey];
    if (failTs !== undefined && Date.now() - failTs < LIST_API_FAIL_COOLDOWN_MS) return null;

    try {
      const entries = await this.ensureQueue().enqueue(`list:${cacheKey}`, async () => {
        const response = await fetch(getListApiUrl(sb, page), {
          signal: AbortSignal.timeout(NETWORK_CONFIG.TIMEOUT_MS),
        });
        if (!response.ok) {
          throw new Error(t('mukaku.probe_failed', { status: response.status }));
        }
        const payload = await response.json();
        return extractListEntries(payload);
      });
      const map = new Map<string, { doubanId: string; imdbId: string | null }>();
      for (const entry of entries) {
        const key = imageFileName(entry.image);
        if (key) map.set(key, { doubanId: entry.doubanId, imdbId: entry.imdbId });
      }
      this.listMappingCache = { sb: cacheKey, map };
      infoLog('[Mukaku] list mapping:', map.size, 'entries for', sb);
      return map;
    } catch (error: unknown) {
      this.listMappingFailTs[cacheKey] = Date.now();
      warnLog('[Mukaku] list API failed:', error);
      return null;
    }
  }

  /**
   * Subscribe to background record events (idempotent). record:updated/deleted are
   * broadcast after every IndexedDB write (background/handlers/db.ts etc.) — the only
   * data source for Mukaku's real-time dimming.
   */
  public activate(): void {
    if (this.activated) return;
    this.activated = true;
    initEventBus();
    this.eventBusUnsubscribers = [
      onEvent('record:updated', (data) => this.onRecordChange(data)),
      onEvent('record:deleted', (data) => this.onRecordChange(data)),
    ];
    // Best-effort one-shot cleanup of the legacy judgment-cache keys (idempotent, fire-and-forget)
    void cleanupLegacyMukakuCaches().catch(() => {});
  }

  /**
   * record event callback: the 300ms debounce coalesces storms (a bulk import emits
   * one event per record), so the whole-document marker clear is NOT run here — it
   * would pay one synchronous full-page pass per event. Only the cache invalidation
   * (pure memory work) and the scheduled round happen on the event.
   */
  private onRecordChange(data: unknown): void {
    if (!shouldRefreshForEvent(data)) return;
    // Bump the epoch so any in-flight scan does not resurrect the cache we are about
    // to invalidate (R3); the field itself is also nulled for immediate reads.
    this.watchedCacheEpoch++;
    this.watchedIdCache = null;
    // NOTE: sessionNoAssociation is intentionally NOT cleared here — a record event
    // (e.g. user added a douban record for a card previously confirmed no-association)
    // must not re-trigger probing; the cooldown only expires on page navigation.
    this.refreshScheduler.schedule(() => this.runRefresh());
  }

  /**
   * Event-triggered rescan (serialized via the runner so it never interleaves with a
   * page scan). Processed markers must go first — a card still marked processed is
   * skipped by collectVisibleCards, making the round a no-op — and the frame-chunked
   * clear pass is awaited (it always settles, even when a newer round cancels it).
   */
  private runRefresh(): void {
    this.runner.run(async () => {
      this.pendingClear?.cancel();
      this.pendingClear = clearProcessedMarkers(document);
      await this.pendingClear.promise;
      await this.processVisibleCards();
    });
  }

  /**
   * Handle the detail page.
   */
  public async handleDetailPage(): Promise<void> {
    this.resetForPage();
    this.activate();
    const mvId = extractMvId(location.href);
    if (!mvId) return;

    // Wait for the detail info area (shared impl in utils/dom)
    try {
      const infoRoot = (await waitForElement('.media-details-area .info', 12000)) as HTMLElement;
      // SPA navigation race: the route changed while waiting (mvId stale) or the old
      // detail node left the document → abandon silently; the new navigation's own
      // handleDetailPage will render.
      if (isDetailContextStale(mvId, location.href) || !infoRoot.isConnected) return;
      // Chip rendering lives in ./detail (read-only presentation); data fetching
      // stays owned by the handler (probe cache + watched-id epoch semantics).
      await renderMukakuDetailState(infoRoot, mvId, {
        probe: (id) => this.probeLinkedIds(id),
        watchedSets: () => this.refreshWatchedIdSets(),
      });
    } catch (error: unknown) {
      console.error('[Mukaku] Detail page rendering failed:', error);
      if (MukakuToastController.hasActive()) {
        MukakuToastController.error(t('mukaku.detail_failed', { error: String(error) }));
      } else {
        FloatingToast.error(t('mukaku.detail_failed_title'), String(error));
      }
    }
  }

  /**
   * Batch-fetch watched-id sets with epoch-guarded write-back (shared by
   * ./detail render + processVisibleCards — extracted 2026-08-07 D2 to
   * eliminate the byte-identical duplicate).
   *
   * R2: a failed fetch must NOT be cached — the cache stays untouched so the
   * next scan retries; the caller degrades to empty sets.
   * R3: the write-back is epoch-guarded — if a record event invalidated the
   * cache while we awaited, we skip the write-back so the stale cache is not
   * resurrected.
   */
  private async refreshWatchedIdSets(): Promise<{
    movieDoubanIds: Set<string>;
    imdbIds: Set<string>;
  }> {
    const epoch = this.watchedCacheEpoch;
    const prevWatchedCache = this.watchedIdCache;
    let watchedSets: { movieDoubanIds: Set<string>; imdbIds: Set<string> };
    try {
      watchedSets = await getWatchedIdSets(prevWatchedCache);
    } catch (error: unknown) {
      errorLog(
        '[Mukaku] watchedIds query failed — degrade to empty sets, cache not written:',
        error,
      );
      watchedSets = { movieDoubanIds: new Set<string>(), imdbIds: new Set<string>() };
    }
    const now = Date.now();
    if (this.watchedCacheEpoch === epoch) {
      const watchedCacheFresh =
        prevWatchedCache !== null && now - prevWatchedCache.ts < MUKAKU_CONFIG.WATCHED_ID_CACHE_TTL;
      this.watchedIdCache = {
        ...watchedSets,
        ts: watchedCacheFresh ? prevWatchedCache.ts : now,
      };
    }
    return watchedSets;
  }

  public async handleListPage(): Promise<void> {
    this.resetForPage();
    this.activate();
    this.runner.run(() => this.processVisibleCards());
    this.observers.setup();
  }

  /**
   * SPA navigation reset: disconnect old observers (prevent leaks), clear caches so the
   * new page is evaluated from scratch. Does not touch cleanup() (that is
   * beforeunload-level teardown). Observers are rebuilt by observers.setup().
   */
  private resetForPage(): void {
    this.observers.disconnect();
    // Stop a chunked marker-clear pass targeting the page we are leaving.
    this.pendingClear?.cancel();
    this.pendingClear = null;
    this.watchedIdCache = null;
    this.sessionNoAssociation.clear();
    this.probeFailCooldown.clear();
    this.watchedCacheEpoch++;
    this.listMappingCache = null;
    this.listMappingFailTs = {};
    this.probeCache.clear();
    this.refreshScheduler.cancel();
  }

  /**
   * Process visible video cards.
   * Concurrency is serialized by this.runner (all callers go through runner.run);
   * this method only performs the pure scan.
   */
  private async processVisibleCards(): Promise<void> {
    if (this.queue) this.queue.resetTotal();

    // 收集规则（单次扫描上限 + 无链接卡停放）在 dom.collectVisibleCards（无状态、可测）。
    const { total, unprocessed, noIdCards } = collectVisibleCards(document, MAX_CARDS_PER_SCAN);

    // 无链接卡的列表 API 图片匹配（搜索页 div.video-card，mvId 只存在于 Vue 状态）。
    await this.resolveLinklessCards(noIdCards, unprocessed);

    debugLog(
      '[Mukaku] scan: found',
      total,
      'cards,',
      unprocessed.length,
      'unprocessed,',
      noIdCards.length,
      'linkless',
    );
    if (unprocessed.length === 0) return;

    // Batch-fetch watched IDs: getWatchedIdSets has its own 30s TTL (cache hit → 0 DB
    // calls). On hit keep the original ts (TTL continues); on refill refresh ts.
    // R2/R3 semantics live in refreshWatchedIdSets (shared with renderDetailState).
    const { movieDoubanIds, imdbIds } = await this.refreshWatchedIdSets();
    debugLog('[Mukaku] watched ids: douban=', movieDoubanIds.size, 'imdb=', imdbIds.size);

    // 批量预热探测缓存：一次 dbGetBulk 取代逐卡 probeCacheGet（N 条串行 DB 消息 → 1）。
    await this.prefillProbeCache(unprocessed);

    // Phase 1 — resolve every card; fire all network probes CONCURRENTLY.
    // The RequestQueue enforces maxConcurrent=10 + random delay; awaiting each
    // probe inside the loop would serialize them to 1 at a time, starving the
    // queue (the pre-campaign bug this restores real concurrency for).
    const actions = new Map<string, CardAction>();
    const probePromises = new Map<
      string,
      Promise<{ doubanId: string | null; imdbId: string | null } | null>
    >();
    for (const { mvId } of unprocessed) {
      const action = resolveCardState({
        probe: this.probeCache.get(mvId) ?? null,
        noAssociation: this.sessionNoAssociation.has(mvId),
        watchedDouban: movieDoubanIds,
        watchedImdb: imdbIds,
      });
      debugLog('[Mukaku] resolve', mvId, '→', action);
      actions.set(mvId, action);
      if (action === 'needs-probe') {
        // Fire now, settle later — probeLinkedIds has internal caching
        // (memory → IDB → network), so already-cached cards resolve instantly.
        probePromises.set(
          mvId,
          this.probeLinkedIds(mvId).catch(() => null),
        );
      }
    }

    // Phase 2 — await in-flight probes IN CARD ORDER, then hand the resolved set to
    // the stateless applier (apply.ts) which owns the dim / skip / failure rules.
    const applyInputs: CardApplyInput[] = [];
    for (const { cardEl, mvId } of unprocessed) {
      const action = actions.get(mvId)!;
      if (action === 'needs-probe') {
        const linkedIds = await probePromises.get(mvId)!;
        if (linkedIds !== null) {
          debugLog(
            '[Mukaku] probe',
            mvId,
            '→ douban:',
            linkedIds.doubanId,
            'imdb:',
            linkedIds.imdbId,
          );
        }
        applyInputs.push({ cardEl, mvId, action, linkedIds });
      } else {
        applyInputs.push({ cardEl, mvId, action, linkedIds: null });
      }
    }

    const { failedProbeMvIds } = applyCardActions(applyInputs, {
      watchedDouban: movieDoubanIds,
      watchedImdb: imdbIds,
    });

    // 失败卡的短冷却由调用方登记（apply 层无状态）。标记已在 apply 层清除，故该卡
    // 会在窗口后被重新收集并重试——失败不会被永久跳过。
    for (const mvId of failedProbeMvIds) {
      warnLog('[Mukaku] Probe failed for card', mvId);
      this.probeFailCooldown.set(mvId, Date.now());
      if (this.probeFailCooldown.size > 1000) this.probeFailCooldown.clear();
    }
  }

  /**
   * 无链接卡的列表 API 图片匹配：一次 getVideoList 请求即给出整页的关联 id
   * （data.data[] 携带 image/doub_id/IMDB_number，2026-08-07 核实）。命中卡加入
   * `unprocessed`，映射写入内存；仅当内存未持有时才持久化。
   */
  private async resolveLinklessCards(
    noIdCards: HTMLElement[],
    unprocessed: Array<{ cardEl: HTMLElement; mvId: string }>,
  ): Promise<void> {
    if (noIdCards.length === 0) return;
    const mapping = await this.getListMapping();
    if (!mapping) return;
    for (const cardEl of noIdCards) {
      const imgEl = cardEl.querySelector('img');
      const imgSrc = imgEl?.getAttribute('src') || imgEl?.getAttribute('data-src') || '';
      const key = imageFileName(imgSrc);
      const entry = key ? mapping.get(key) : undefined;
      if (!entry) continue;
      cardEl.setAttribute(PROCESSED_ATTR, 'true');
      const mvId = entry.doubanId;
      unprocessed.push({ cardEl, mvId });
      // Mapping known (successful list-API data) → fill memory; persist only when not already held (O1)
      if (!this.probeCache.has(mvId)) {
        this.probeCache.set(mvId, { doubanId: entry.doubanId, imdbId: entry.imdbId });
        void probeCacheSet(mvId, {
          doubanId: entry.doubanId,
          imdbId: entry.imdbId,
          ts: Date.now(),
        }).catch(() => {});
      }
    }
  }

  /**
   * 批量预热探测缓存：对将进入 'needs-probe' 的卡只发一次 dbGetBulk，取代扫描循环内
   * 的逐卡 probeCacheGet（N 条串行 DB 消息 → 1）。过滤条件与 resolveCardState 的
   * needs-probe 判定一致。批量读失败不得中断扫描——卡回落到网络探测。
   */
  private async prefillProbeCache(
    unprocessed: Array<{ cardEl: HTMLElement; mvId: string }>,
  ): Promise<void> {
    const needsProbeIds: string[] = [];
    for (const { mvId } of unprocessed) {
      // Skip cards in session cooldown or failure cooldown; skip cards already in the in-memory probeCache
      if (this.sessionNoAssociation.has(mvId)) continue;
      const failTs = this.probeFailCooldown.get(mvId);
      if (failTs !== undefined && Date.now() - failTs < PROBE_FAIL_COOLDOWN_MS) continue;
      if (this.probeCache.has(mvId)) continue;
      needsProbeIds.push(mvId);
    }
    const bulkProbes = await probeCacheGetBulk(needsProbeIds).catch((error: unknown) => {
      // DB bulk read failure must not abort the scan — cards fall through to network probes.
      errorLog('[Mukaku] probe prefill failed — fall through to network:', error);
      return new Map<string, { doubanId: string | null; imdbId: string | null; ts: number }>();
    });
    for (const [mvId, entry] of bulkProbes) {
      this.probeCache.set(mvId, { doubanId: entry.doubanId, imdbId: entry.imdbId });
    }
    debugLog('[Mukaku] probe prefill:', bulkProbes.size, 'hits of', needsProbeIds.length);
  }

  /**
   * 清理资源
   */
  public cleanup(): void {
    this.observers.disconnect();
    this.eventBusUnsubscribers.forEach((unsub) => unsub());
    this.eventBusUnsubscribers = [];
    this.activated = false;
    this.refreshScheduler.cancel();
    this.pendingClear?.cancel();
    this.pendingClear = null;
    this.queue = null;
    MukakuToastController.close();
    this.probeCache.clear();
    this.watchedIdCache = null;
    this.sessionNoAssociation.clear();
    this.probeFailCooldown.clear();
    this.listMappingCache = null;
    this.listMappingFailTs = {};
  }
}

export { MukakuHandler };
