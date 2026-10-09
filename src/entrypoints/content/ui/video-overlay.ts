/**
 * Shared video-overlay module for bilibili ↔ youtube content scripts (T18, audit §2.1).
 *
 * Extracted from the ~90% identical src/entrypoints/bilibili.content/index.ts and
 * src/entrypoints/youtube-homepage.content/index.ts. `createVideoOverlay(siteConfig)`
 * hosts everything the two sites share:
 *   - theme system (themeVars / detectDark / startThemeWatch)
 *   - modal (createButton/applyBtnStyle/showModal/closeModal/applyModalTheme)
 *   - recommendation decoration (decorateRecommendations)
 *   - typed DB access via Store.dbGet/dbPut/dbGetAll — replaces the hand-rolled
 *     chrome.runtime.sendMessage(…, (resp: any) => …) calls in the legacy files
 *
 * The video progress tracker and the style builders were split out (P2):
 *   - video-progress-tracker.ts — VideoProgressTracker class
 *   - video-overlay-styles.ts — sBtnFloat/sBadge/sOverlay/… style helpers
 * The status modal and the recommendation decoration were split out next
 * (ADR-026 req 9 file-size gate):
 *   - video-overlay-modal.ts — status-modal DOM + theme re-apply (view layer)
 *   - video-overlay-recommendations.ts — card scan / bulk DB read / badge stamp
 *
 * Store keys follow decision-3: 'movie::' + id (the v13 migration normalized
 * legacy 'video::X' keys; content scripts must read/write the canonical form).
 *
 * Status codes: 0=NONE, 1=WISHLIST, 2=DONE, 3=DOING
 * Theme: reacts to the configured site attribute + prefers-color-scheme
 */

import { Store } from '@/engine/database';

// ── Shared status constants + pure parsers ────────────────────────────────
// Single source of truth: video-overlay-pure.ts (locked by tests/unit/video-overlay.spec.ts).
// Local aliases keep the ~90% shared internal references (COLORS/LABELS/DISPLAY) intact;
// the re-exports below preserve the original public export surface for site consumers.
import { STATUS_LABELS as LABELS, storeKey } from './video-overlay-pure';

export {
  STATUS_COLORS as VIDEO_COLORS,
  STATUS_LABELS as VIDEO_LABELS,
  storeKey,
  calcThreshold,
  parseYoutubeVideoId,
  parseYoutubeSearchId,
  parseBilibiliBvid,
  parseBilibiliBvidFromHref,
} from './video-overlay-pure';

// ── Split modules (P2: video-overlay.ts was 861L) ─────────────────────────
// Style builders + theme vars live in video-overlay-styles.ts;
// the video progress tracker lives in video-progress-tracker.ts;
// the status modal DOM lives in video-overlay-modal.ts;
// recommendation scanning/decoration lives in video-overlay-recommendations.ts.
import { ThemeVars, sBadge, sBtnFloat } from './video-overlay-styles';
import { VideoProgressTracker } from './video-progress-tracker';
import { createStatusModal } from './video-overlay-modal';
import type { StatusModal } from './video-overlay-modal';
import { observeRecommendations, refreshRecommendations } from './video-overlay-recommendations';
import { watchRecord } from '@/libraries/utils/watch-record';
import type { RecommendationConfig } from './video-overlay-recommendations';

// ════════════════════════════════════════════════════════════════════════
// Site configuration
// ════════════════════════════════════════════════════════════════════════

/** Grace period before the recommendation pass starts (site chrome still hydrating). */
const REC_WATCH_DELAY_MS = 3000;
/** Trailing settle for a recommendation-card mutation burst. */
const REC_REFRESH_DELAY_MS = 300;

export interface VideoOverlaySiteConfig {
  /** IndexedDB record store name (STORE_NAMES.BILIBILI / STORE_NAMES.YOUTUBE). */
  storeName: string;
  /**
   * Record-event subscription seam; defaults to the shared bus watcher.
   * Injected in tests because `event-bus` keeps module-level state per worker:
   * a spec that used the real bus would pass or fail by file-order luck.
   */
  subscribeRecord?: (
    storeName: string,
    key: string | undefined,
    onChange: () => void,
  ) => () => void;
  /** Attribute prefix for FAB/modal elements: 'umm-bili' | 'umm-yt'. */
  attrPrefix: string;
  /** Font stack for the FAB / overlay / recommendation badges. */
  fontFamily: string;
  theme: {
    /** Attribute observed for theme switches ('data-theme' | 'dark'). */
    attr: string;
    /** Site-specific dark-mode check (prefers-color-scheme handled internally). */
    darkCheck: () => boolean;
    vars: { dark: ThemeVars; light: ThemeVars };
  };
  player: {
    /** Container(s) holding the <video> — observer target / container wait. */
    playerSelector: string;
    /** Selector for an already-mounted <video> at scan start. */
    initialVideoSelector: string;
    /** Selector(s) polled while waiting for the <video> to appear. */
    pollVideoSelector: string;
    /** bilibili waits for the player container before observing; youtube does not. */
    requirePlayerTarget: boolean;
    /** Poll cadence in ms (bilibili 1000, youtube 2000). */
    pollInterval: number;
    /** Stop polling after this many misses (bilibili 30; youtube never stops). */
    pollStopAfter?: number;
    /** Ancestor selector(s) of <video> to ignore (bilibili inline recommends). */
    skipClosest?: string;
  };
  /** Detail-mode dimmer CSS, injected once into <head>. */
  dimmerCss: string;
  dimmerStyleId: string;
  recommendation: RecommendationConfig;
}

export interface VideoOverlay {
  readonly id: string | null;
  readonly key: string | null;
  readonly status: number;
  readonly rating: number;
  /** Set the current media id (null clears). Creates/destroys the tracker. */
  setCurrent(id: string | null): void;
  /** Create the FAB if not present (no-op without an id). */
  create(): void;
  /** Re-create the FAB if it went missing (SPA re-render). */
  ensureButton(): void;
  /** Repaint the FAB for the current status/rating/theme. */
  applyBtnStyle(): void;
  showModal(): void;
  closeModal(): void;
  /** Resolves once the record is fetched (or a 2s fallback), status/rating applied. Late DB responses repaint the FAB (no-op for callers already painting with real data). */
  loadRecord(): Promise<void>;
  /** Persist status/rating under the canonical 'movie::' key. */
  saveRecord(status: number, rating: number): void;
  /** Mark as watched (status=2) with the given rating and stop tracking. */
  markWatched(rating: number): void;
  syncTrackerStatus(): void;
  /** After 3s: load all records + watch recommendation containers. */
  startRecommendationWatch(): void;
  refreshRecommendations(): Promise<void>;
  watchRecommendations(): void;
  /** Tear down UI/tracker (keeps the theme watch; used on SPA navigation). */
  cleanup(): void;
  /** cleanup() + stop theme watch (final teardown). */
  destroy(): void;
}

// ════════════════════════════════════════════════════════════════════════
// Overlay implementation
// ════════════════════════════════════════════════════════════════════════

class VideoOverlayImpl implements VideoOverlay {
  private config: VideoOverlaySiteConfig;

  id: string | null = null;
  key: string | null = null;
  private currentId: string | null = null;
  private statusValue = 0;
  private ratingValue = 0;
  private btn: HTMLDivElement | null = null;
  private modalUi: StatusModal | null = null;
  private isDark = false;
  private tracker: VideoProgressTracker | null = null;
  private recObserver: MutationObserver | null = null;
  /** Released by cleanup(): the record-event subscription of this overlay. */
  private releaseRecordWatch: (() => void) | null = null;
  private stopTheme: (() => void) | null = null;
  /**
   * Deferred work still waiting to run (recommendation watch / refresh kicks),
   * keyed by slot. Every handle is tracked so teardown can cancel it — deferred
   * work must never revive a page that was already torn down.
   */
  private pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private pendingSeq = 0;

  get status(): number {
    return this.statusValue;
  }
  get rating(): number {
    return this.ratingValue;
  }

  constructor(config: VideoOverlaySiteConfig) {
    this.config = config;
    this.injectStyles();
    this.startThemeWatch();
  }

  // ── Styles / theme ─────────────────────────────────────────

  private injectStyles(): void {
    if (document.getElementById(this.config.dimmerStyleId)) return;
    const s = document.createElement('style');
    s.id = this.config.dimmerStyleId;
    s.textContent = this.config.dimmerCss;
    document.head.appendChild(s);
  }

  private detectDark(): boolean {
    return (
      this.config.theme.darkCheck() || window.matchMedia('(prefers-color-scheme: dark)').matches
    );
  }

  private tv(): ThemeVars {
    return this.config.theme.vars[this.isDark ? 'dark' : 'light'];
  }

  private startThemeWatch(): void {
    this.isDark = this.detectDark();

    const onThemeChange = () => {
      const newDark = this.detectDark();
      if (newDark === this.isDark) return;
      this.isDark = newDark;
      this.applyBtnStyle();
      if (this.modalUi) this.modalUi.applyTheme();
    };

    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'attributes' && m.attributeName === this.config.theme.attr) {
          onThemeChange();
          break;
        }
      }
    });
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: [this.config.theme.attr],
    });

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', onThemeChange);

    this.stopTheme = () => {
      obs.disconnect();
      mq.removeEventListener('change', onThemeChange);
    };
  }

  // ── Data ───────────────────────────────────────────────────

  setCurrent(id: string | null): void {
    this.id = id;
    this.key = id ? storeKey(id) : null;
    this.currentId = id;
    if (this.tracker) {
      this.tracker.destroy();
      this.tracker = null;
    }
    if (id) {
      this.tracker = new VideoProgressTracker(id, {
        playerSelector: this.config.player.playerSelector,
        initialVideoSelector: this.config.player.initialVideoSelector,
        pollVideoSelector: this.config.player.pollVideoSelector,
        requirePlayerTarget: this.config.player.requirePlayerTarget,
        pollInterval: this.config.player.pollInterval,
        pollStopAfter: this.config.player.pollStopAfter,
        skipClosest: this.config.player.skipClosest,
        currentId: () => this.currentId,
        onThresholdReached: () => this.markWatched(4),
      });
    }
  }

  loadRecord(): Promise<void> {
    return new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };
      if (!this.key) {
        done();
        return;
      }
      Store.dbGet(this.config.storeName, this.key)
        .then((record) => {
          if (record) {
            this.statusValue = record.status || 0;
            this.ratingValue = record.rating || 0;
          }
          if (settled) {
            // The 2s fallback already resolved the promise, so the caller
            // painted the default (status=0) state. Repaint with the real
            // record — otherwise the badge stays 未看 until SPA navigation.
            // No-op when the button was torn down (SPA nav), and the fast
            // path never reaches here because settled is still false.
            this.applyBtnStyle();
            this.syncTrackerStatus();
          }
          done();
        })
        .catch((err) => {
          console.warn('[UMM Video] DB_GET failed:', err);
          done();
        });
      // 2s fallback — proceed with default state if the SW is slow/unreachable
      setTimeout(done, 2000);
    });
  }

  saveRecord(status: number, rating: number): void {
    if (!this.key) return;
    Store.dbPut(this.config.storeName, this.key, {
      url: location.href,
      status,
      rating,
      comment: '',
      updatedAt: new Date().toISOString(),
      linkedIds: {},
    }).catch((err) => {
      console.warn('[UMM Video] DB_PUT failed:', err);
    });
  }

  markWatched(rating: number): void {
    if (this.statusValue === 2) return;
    this.statusValue = 2;
    this.ratingValue = rating;
    this.applyBtnStyle();
    this.saveRecord(2, rating);
    this.tracker?.deactivate();
  }

  syncTrackerStatus(): void {
    if (!this.tracker) return;
    if (this.statusValue === 2) this.tracker.deactivate();
    else this.tracker.activate();
  }

  // ── FAB button ─────────────────────────────────────────────

  create(): void {
    if (this.btn || !this.id) return;
    this.btn = document.createElement('div');
    this.btn.setAttribute(`data-${this.config.attrPrefix}-float`, '');
    this.btn.addEventListener('mouseenter', () => {
      if (this.btn) this.btn.style.transform = 'translateY(-50%) scale(1.08)';
    });
    this.btn.addEventListener('mouseleave', () => {
      if (this.btn) this.btn.style.transform = 'translateY(-50%) scale(1)';
    });
    this.btn.addEventListener('click', () => this.showModal());
    this.applyBtnStyle();
    document.body.appendChild(this.btn);
  }

  ensureButton(): void {
    if (this.btn && !document.body.contains(this.btn)) {
      this.btn.remove();
      this.btn = null;
      this.create();
    } else if (this.id && !this.btn) {
      this.create();
    }
  }

  applyBtnStyle(): void {
    if (!this.btn) return;
    const t = this.tv();
    this.btn.style.cssText = sBtnFloat(t, this.statusValue, this.config.fontFamily);
    this.btn.textContent = LABELS[this.statusValue]?.slice(0, 2) ?? '';
    const existingBadge = this.btn.querySelector(`[data-${this.config.attrPrefix}-rating]`);
    if (existingBadge) existingBadge.remove();
    if (this.statusValue === 2 && this.ratingValue > 0) {
      const badge = document.createElement('div');
      badge.setAttribute(`data-${this.config.attrPrefix}-rating`, '');
      badge.textContent = String(this.ratingValue);
      badge.style.cssText = sBadge(t, this.statusValue, this.isDark);
      this.btn.appendChild(badge);
    }
  }

  // ── Modal ──────────────────────────────────────────────────

  closeModal(): void {
    if (this.modalUi) {
      this.modalUi.el.remove();
      this.modalUi = null;
    }
  }

  showModal(): void {
    if (this.modalUi) return;
    // DOM building lives in video-overlay-modal.ts; this host keeps all record
    // state and persists on save (close + repaint FAB + write + sync tracker).
    this.modalUi = createStatusModal({
      attrPrefix: this.config.attrPrefix,
      fontFamily: this.config.fontFamily,
      getThemeVars: () => this.tv(),
      getStatus: () => this.statusValue,
      getRating: () => this.ratingValue,
      setStatus: (status) => {
        this.statusValue = status;
      },
      setRating: (rating) => {
        this.ratingValue = rating;
      },
      onCancel: () => this.closeModal(),
      onSave: () => {
        this.closeModal();
        this.applyBtnStyle();
        this.saveRecord(this.statusValue, this.statusValue === 2 ? this.ratingValue : 0);
        this.syncTrackerStatus();
      },
    });
    document.body.appendChild(this.modalUi.el);
  }

  // ── Recommendation decoration (DOM work lives in video-overlay-recommendations.ts) ──

  /** Schedule deferred work; `slot` coalesces repeat scheduling into one trailing run. */
  private after(ms: number, run: () => void, slot?: string): void {
    const key = slot ?? `pending-${++this.pendingSeq}`;
    const previous = this.pendingTimers.get(key);
    if (previous !== undefined) clearTimeout(previous);
    const handle = setTimeout(() => {
      this.pendingTimers.delete(key);
      run();
    }, ms);
    this.pendingTimers.set(key, handle);
  }

  private cancelPending(): void {
    for (const handle of this.pendingTimers.values()) clearTimeout(handle);
    this.pendingTimers.clear();
  }

  refreshRecommendations(): Promise<void> {
    if (!this.id) return Promise.resolve();
    return refreshRecommendations(
      this.config.storeName,
      this.config.recommendation,
      this.config.fontFamily,
    );
  }

  watchRecommendations(): void {
    const observer = observeRecommendations(this.config.recommendation, () => {
      this.after(
        REC_REFRESH_DELAY_MS,
        () => {
          void this.refreshRecommendations();
        },
        'rec-refresh',
      );
    });
    if (!observer) return;
    if (this.recObserver) this.recObserver.disconnect();
    this.recObserver = observer;
  }

  /**
   * A record written from the popup, another tab or a sync run changes no host
   * DOM, so the feed observer never fires and recommendation badges stay stale
   * until reload. Any write in this store re-runs the targeted bulk read
   * through the same trailing settle the feed bursts already use.
   */
  private watchRecordChanges(): void {
    if (this.releaseRecordWatch) return;
    const subscribe = this.config.subscribeRecord ?? watchRecord;
    this.releaseRecordWatch = subscribe(this.config.storeName, undefined, () => {
      this.after(
        REC_REFRESH_DELAY_MS,
        () => {
          void this.refreshRecommendations();
        },
        'rec-refresh',
      );
    });
  }

  startRecommendationWatch(): void {
    this.watchRecordChanges();
    this.after(
      REC_WATCH_DELAY_MS,
      () => {
        void this.refreshRecommendations();
        this.watchRecommendations();
      },
      'rec-watch',
    );
  }

  // ── Teardown ───────────────────────────────────────────────

  cleanup(): void {
    this.cancelPending();
    if (this.tracker) {
      this.tracker.destroy();
      this.tracker = null;
    }
    if (this.recObserver) {
      this.recObserver.disconnect();
      this.recObserver = null;
    }
    if (this.releaseRecordWatch) {
      this.releaseRecordWatch();
      this.releaseRecordWatch = null;
    }
    if (this.modalUi) {
      this.modalUi.el.remove();
      this.modalUi = null;
    }
    if (this.btn) {
      this.btn.remove();
      this.btn = null;
    }
    this.id = null;
    this.key = null;
    this.currentId = null;
    this.statusValue = 0;
    this.ratingValue = 0;
  }

  destroy(): void {
    this.cleanup();
    if (this.stopTheme) {
      this.stopTheme();
      this.stopTheme = null;
    }
  }
}

/** Create a site-parameterized video overlay (bilibili / youtube). */
export function createVideoOverlay(siteConfig: VideoOverlaySiteConfig): VideoOverlay {
  return new VideoOverlayImpl(siteConfig);
}
