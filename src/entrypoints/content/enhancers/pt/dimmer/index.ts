import { MTeamHandler } from './mteam';
import { NexusPHPHandler } from './nexusphp';
import { clearResolvedAttributes, createDebouncedScheduler } from './refresh';
import { shouldClearRowForRecordKey } from './row-id-memo';
import { resetPtBulkMemo } from './cache';
import { runChunked, type ChunkOptions, type ChunkedRun } from '@/libraries/utils/dom-chunk';
import { sleep, throttle } from '@/libraries/utils';
import { debugLog } from '@/libraries/utils/logger';
import { waitForElement } from '../../../utils/dom';
import { initEventBus, onEvent } from '@/libraries/utils/event-bus';
import type { HandlerContext, ListPageHandler } from '../types';

/** Initial-process retry budget: attempts at 2s/4s backoff before giving up. */
const INIT_PROCESS_ATTEMPTS = 3;
const INIT_PROCESS_BACKOFF_MS = 2000;
/** Resolved rows un-marked per animation frame (bulk clears touch every row). */
const CLEAR_CHUNK_SIZE = 20;
/**
 * Distinct record keys coalesced into one chunked pass before the round degrades
 * to a bulk `*` clear. WHY a cap: the per-row decision costs one haystack build
 * per key, so `chunkSize × keys` must stay inside one frame's budget — and a
 * 300ms window holding more than this many distinct keys *is* the bulk-import
 * signature, where a whole-page clear is the right verdict anyway.
 */
const BULK_CLEAR_KEY_THRESHOLD = 8;

/**
 * Frame-chunked marker-clear pass over resolved rows. Per-row decision is
 * `shouldClearRowForRecordKey` (id-memo first, haystack fallback). A coalesced
 * round may carry several record keys — a row is cleared when ANY of them owns
 * it; `'*'` short-circuits the whole set. Exported for unit tests; production
 * callers go through PTDimmer.clearResolvedMarkers.
 */
export function clearResolvedMarkersForRows(
  targets: readonly Element[],
  key: string | readonly string[],
  options: ChunkOptions = {},
): ChunkedRun {
  const keys = typeof key === 'string' ? [key] : [...new Set(key)];
  const bulk = keys.includes('*');
  return runChunked(
    targets,
    (el) => {
      if (bulk || keys.some((k) => shouldClearRowForRecordKey(el, k))) clearResolvedAttributes(el);
    },
    { chunkSize: CLEAR_CHUNK_SIZE, ...options },
  );
}

export class PTDimmer {
  private debugTag = '[PT Dimmer Debug]';
  private observer: MutationObserver | null = null;
  private waitForObserver: MutationObserver | null = null;
  private eventBusUnsubscribers: Array<() => void> = [];
  private mteamAutoDetector: MutationObserver | null = null;
  private mteamDocObserver: MutationObserver | null = null;

  /** Static reference to current instance — ensures cleanup() can always find us */
  static currentInstance: PTDimmer | null = null;

  // Cache for ID sets
  private idCache: {
    movieDoubanIds: Set<string>;
    musicDoubanIds: Set<string>;
    imdbIds: Set<string>;
  } | null = null;
  private cacheTimestamp = 0;

  // Handler instances
  private mteamHandler: MTeamHandler;
  private nexusphpHandler: NexusPHPHandler;

  // Event-driven real-time refresh state (record:updated / record:deleted)
  private activeHandler: ListPageHandler | null = null;
  private refreshTimer: number | null = null;
  private disposed = false;
  /** In-flight chunked marker-clear pass — runActiveProcess awaits it before re-processing. */
  private pendingClear: ChunkedRun | null = null;
  /**
   * Record keys collected by the current debounce window, cleared as ONE chunked
   * pass in the refresh round (a `'*'` entry short-circuits the set). Survives
   * cleanup(): a cancelled round must not silently drop keys, or their rows stay
   * resolved and every later re-run is a no-op for them.
   */
  private pendingClearKeys = new Set<string>();
  /** 300ms trailing-edge debounce — coalesces event storms (e.g. bulk import) */
  private refreshScheduler = createDebouncedScheduler(300, {
    setTimeout: (cb, ms) => {
      const handle = window.setTimeout(() => {
        if (this.refreshTimer === handle) this.refreshTimer = null;
        cb();
      }, ms);
      this.refreshTimer = handle;
      return handle;
    },
    clearTimeout: (handle) => {
      if (this.refreshTimer === handle) this.refreshTimer = null;
      window.clearTimeout(handle);
    },
  });

  constructor() {
    this.mteamHandler = new MTeamHandler();
    this.nexusphpHandler = new NexusPHPHandler();

    // MTeam SPA: URL events may not fire for internal routing
    // Start DOM-based auto-detection as fallback
    if (location.href.includes('m-team.cc')) {
      this.startMteamAutoDetection();
    }
  }

  private debug(...args: unknown[]): void {
    // Routed through the logger so the tag stays, but the output obeys the same
    // debug switch as everything else — bare console.log reached users' consoles.
    debugLog(this.debugTag, ...args);
  }

  cleanup(): void {
    this.mteamHandler.teardown();
    this.nexusphpHandler.teardown();
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this.waitForObserver) {
      this.waitForObserver.disconnect();
      this.waitForObserver = null;
    }
    this.eventBusUnsubscribers.forEach((unsub) => unsub());
    this.eventBusUnsubscribers = [];
    if (this.mteamAutoDetector) {
      this.mteamAutoDetector.disconnect();
      this.mteamAutoDetector = null;
    }
    if (this.mteamDocObserver) {
      this.mteamDocObserver.disconnect();
      this.mteamDocObserver = null;
    }
    this.refreshScheduler.cancel();
    this.refreshTimer = null;
    // Stop a chunked marker-clear pass targeting the page we are leaving.
    this.pendingClear?.cancel();
    this.pendingClear = null;
    this.activeHandler = null;
    this.disposed = true;
    PTDimmer.currentInstance = null;
  }

  private selectHandler(url: string): ListPageHandler | null {
    const handlers: ListPageHandler[] = [this.mteamHandler, this.nexusphpHandler];
    return handlers.find((h) => h.match(url)) || null;
  }

  public async runFor(url: string): Promise<void> {
    this.debug('=== runFor called for URL:', url);
    this.cleanup();
    PTDimmer.currentInstance = this;

    // Listen for record changes → re-evaluate rows in real time.
    // Records live in IndexedDB (written by background), so chrome.storage.onChanged never fires.
    // Background broadcasts EVENT_BUS 'record:updated'/'record:deleted' on every DB write (see
    // src/entrypoints/background/handlers/db.ts) — subscribe to those instead.
    initEventBus();
    this.eventBusUnsubscribers = [
      onEvent('record:updated', (data) => this.onRecordChange(data)),
      onEvent('record:deleted', (data) => this.onRecordChange(data)),
    ];

    const active = this.selectHandler(url);
    if (!active) {
      this.debug('No matching handler for URL');
      return;
    }
    this.activeHandler = active;
    this.disposed = false;

    this.debug(
      'Handler matched — selector:',
      active.getSelector(),
      '| contentCheck:',
      typeof active.contentCheck,
    );
    this.debug('Waiting for element...');

    try {
      await waitForElement(active.getSelector(), 15000, {
        contentCheck: active.contentCheck,
        onObserverCreated: (observer) => {
          this.waitForObserver = observer;
        },
      });
    } catch {
      this.debug('Element not found within timeout — skipping:', active.getSelector());
      return;
    }

    this.debug('Element found, starting process...');
    const ctx: HandlerContext = {
      debug: this.debug.bind(this),
      idCache: this.idCache,
      cacheTimestamp: this.cacheTimestamp,
    };
    // Retry the initial process with backoff: the first DB fetch can fail on a
    // transient SW/IndexedDB condition (MV3 wake race, scheduler timeout), and
    // for static pages no MutationObserver event would ever re-trigger it.
    let lastErr: unknown = null;
    for (let attempt = 1; attempt <= INIT_PROCESS_ATTEMPTS; attempt++) {
      // A newer runFor (SPA navigation) may have cleaned us up mid-retry —
      // stop instead of processing the new page state with a stale context.
      if (this.disposed) return;
      try {
        await active.process(ctx);
        lastErr = null;
        break;
      } catch (err: unknown) {
        lastErr = err;
        if (attempt < INIT_PROCESS_ATTEMPTS) {
          this.debug(
            `[PT Dimmer] Initial process attempt ${attempt} failed, retrying in ${INIT_PROCESS_BACKOFF_MS * attempt}ms`,
          );
          await sleep(INIT_PROCESS_BACKOFF_MS * attempt);
        }
      }
    }
    if (lastErr) {
      console.warn('[PT Dimmer] Initial process failed after retries:', lastErr);
    }

    if (typeof active.setup === 'function') {
      // WHY !: String.split never returns an empty array — [0] always exists
      const target =
        document.querySelector(active.getSelector().split(',')[0]!.trim()) || document.body;
      this.debug(
        'Setting up reactive loop on target:',
        target.tagName,
        target.id || target.className || '',
      );
      active.setup(target as HTMLElement, () => active.process(ctx));
      return;
    }

    this.observer = new MutationObserver(
      throttle(() => {
        this.debug('Mutation observed, re-processing...');
        return active.process(ctx);
      }, 260),
    );
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  /**
   * Re-run the current handler's process with a fresh ctx (idCache=null, cacheTimestamp=0).
   * Bypasses MTeamHandler's instance-level setsExpiry (+30s) cache and NexusPHPHandler's
   * ctx self-cache (+30s) so the event-driven refresh reads the latest watched sets.
   */
  private async runActiveProcess(): Promise<void> {
    if (!this.activeHandler) return;
    // Rows still carrying a resolved marker would be skipped by this round, making
    // the refresh a no-op — so the clear pass runs first and is awaited here.
    this.clearResolvedMarkers();
    await this.pendingClear?.promise;
    if (this.disposed || !this.activeHandler) return;
    const ctx: HandlerContext = {
      debug: this.debug.bind(this),
      idCache: null,
      cacheTimestamp: 0,
    };
    try {
      await this.activeHandler.process(ctx);
    } catch (err: unknown) {
      console.warn('[PT Dimmer] Process error:', err);
    }
  }

  /**
   * record:updated / record:deleted event callback. The 300ms trailing-edge debounce
   * coalesces event storms (a bulk import emits one event per record), so this only
   * RECORDS the key and expires the in-memory caches (pure memory work — they stay
   * immediate so no round can read a stale watched set / pt_id_cache memo). The
   * whole-document marker query and its chunked removal pass run once per round,
   * inside runActiveProcess.
   */
  private onRecordChange(data: unknown): void {
    if (this.disposed || !this.activeHandler) return;
    const d = data as { storeName?: unknown; key?: unknown } | null;
    const storeName = typeof d?.storeName === 'string' ? d.storeName : undefined;
    if (storeName !== 'douban_records' && storeName !== 'imdb_records') return;
    const key = typeof d?.key === 'string' ? d.key : '*';
    this.debug('[Cache] Record change — queued resolved-marker clear for key', key);
    this.noteRecordKeyForClear(key);
    this.mteamHandler.invalidateCache();
    // Records changed: invalidate the pt_id_cache bulk result so the next process round cannot hit the stale memo
    resetPtBulkMemo();
    this.refreshScheduler.schedule(() => void this.runActiveProcess());
  }

  /**
   * Collect the keys the next round must re-evaluate. A `'*'` (bulk / keyless
   * payload) dominates and empties the set; past the cap the set collapses to
   * `'*'` — see BULK_CLEAR_KEY_THRESHOLD.
   */
  private noteRecordKeyForClear(key: string): void {
    if (key === '*' || key === '') {
      this.pendingClearKeys.clear();
      this.pendingClearKeys.add('*');
      return;
    }
    if (this.pendingClearKeys.has('*')) return;
    if (this.pendingClearKeys.size >= BULK_CLEAR_KEY_THRESHOLD) {
      this.pendingClearKeys.clear();
      this.pendingClearKeys.add('*');
      return;
    }
    this.pendingClearKeys.add(key);
  }

  /**
   * Clear resolved markers so the next process round re-evaluates them.
   * Bulk `*` clears every resolved row. A single-key write only clears rows
   * the id-memo attributes to that key, plus haystack matches for rows the
   * scan passes never memoized.
   *
   * X9-B: the removal pass is frame-chunked — a bulk import can leave every row
   * on the page resolved, and un-marking all of them synchronously (haystack
   * build + removeAttribute per row) is a host-page long task. The in-flight
   * run is exposed via `pendingClear` so `runActiveProcess` waits for it.
   *
   * Storm fix: the previous run is CANCELLED before the field is reassigned —
   * same idiom as mteam.processMTeamRows / doulist-dialog.renderItems. Without
   * it every round left its own frame-chunked chain running, so N events meant
   * N concurrent passes. A cancelled run still settles (dom-chunk contract), so
   * an awaiting round cannot be stranded by the pass that replaced it.
   */
  private clearResolvedMarkers(): void {
    if (this.pendingClearKeys.size === 0) return;
    const keys = [...this.pendingClearKeys];
    this.pendingClearKeys.clear();
    const targets = Array.from(
      document.querySelectorAll('[data-umm-resolved="true"], [data-umm-mteam-resolved="true"]'),
    );
    this.pendingClear?.cancel();
    this.pendingClear = clearResolvedMarkersForRows(targets, keys);
  }

  /** MTeam SPA fallback: auto-detect browse page via DOM when URL events don't fire */
  private startMteamAutoDetection(): void {
    const checkDom = () => {
      if (!this.mteamHandler.isActive() && this.mteamHandler.isMTeamDomPresent()) {
        this.debug('[M-Team] DOM auto-detect: browse rows found, initializing...');
        const ctx: HandlerContext = {
          debug: this.debug.bind(this),
          idCache: this.idCache,
          cacheTimestamp: this.cacheTimestamp,
        };
        void this.mteamHandler.process(ctx).then(() => {
          this.activeHandler = this.mteamHandler;
          this.disposed = false;
          const target =
            // WHY !: String.split never returns an empty array — [0] always exists
            (document.querySelector(
              this.mteamHandler.getSelector().split(',')[0]!.trim(),
            ) as HTMLElement | null) || document.body;
          this.mteamHandler.setup(target, () => this.mteamHandler.process(ctx));
        });
      }
    };

    // Immediate check for direct page loads
    checkDom();

    // Observe #root for SPA navigation (M-Team React root)
    const root = document.getElementById('root');
    if (root) {
      this.mteamAutoDetector = new MutationObserver(throttle(checkDom, 1000));
      this.mteamAutoDetector.observe(root, { childList: true, subtree: true });
      this.debug('[M-Team] DOM auto-detector attached to #root');
      return;
    }

    // #root not ready yet — watch document for it to appear
    this.mteamDocObserver = new MutationObserver(() => {
      const delayedRoot = document.getElementById('root');
      if (delayedRoot) {
        this.mteamDocObserver!.disconnect();
        this.mteamDocObserver = null;
        this.mteamAutoDetector = new MutationObserver(throttle(checkDom, 1000));
        this.mteamAutoDetector.observe(delayedRoot, { childList: true, subtree: true });
        this.debug('[M-Team] DOM auto-detector attached to #root (delayed)');
      }
    });
    this.mteamDocObserver.observe(document.documentElement, { childList: true, subtree: true });
  }
}
