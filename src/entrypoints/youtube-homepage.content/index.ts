/**
 * YouTube unified content script — WXT content script
 *
 * Thin per-site shell for the shared video-overlay module (audit §2.1 / T18).
 * All shared UI / theme / progress-tracking / DB logic lives in
 * src/entrypoints/content/ui/video-overlay.ts; this file keeps only what is
 * youtube-specific: URL-based mode switching, listing-mode card scan, and the
 * detail-mode wiring.
 *
 * - Listing mode (homepage/search/channel): card badge injection + dimmer
 * - Detail mode (watch page): floating button + modal + progress tracker + recommendation badges
 *
 * Status codes: 0=NONE, 1=WISHLIST, 2=DONE, 3=DOING
 * Store keys: 'movie::' + videoId (decision-3)
 */

import { defineContentScript } from 'wxt/utils/define-content-script';
import { Store, STORE_NAMES } from '@/engine/database';
import { throttle } from '@/libraries/utils';
import {
  createVideoOverlay,
  parseYoutubeSearchId,
  parseYoutubeVideoId,
} from '@/entrypoints/content/ui/video-overlay';
import {
  buildListingDimmerCss,
  LISTING_STYLE_ID,
  runYoutubeListingPass,
  VIDEO_CARD_SELECTOR,
} from '@/entrypoints/content/ui/youtube-listing';

export default defineContentScript({
  matches: ['*://www.youtube.com/*', '*://m.youtube.com/*'],
  runAt: 'document_idle',

  main() {
    const later = (fn: () => void, ms: number): void => {
      setTimeout(fn, ms);
    };
    // MutationObserver 回调节流窗口（trailing 语义，audit §P-C）
    const OBSERVER_THROTTLE_MS = 250;

    const overlay = createVideoOverlay({
      storeName: STORE_NAMES.YOUTUBE,
      attrPrefix: 'umm-yt',
      fontFamily: 'Roboto,Arial,sans-serif',
      theme: {
        attr: 'dark',
        darkCheck: () => document.documentElement.hasAttribute('dark'),
        vars: {
          dark: {
            card: '#212121',
            fg: '#fff',
            border: '#383838',
            overlay: 'rgba(0,0,0,0.7)',
            bbg: '#383838',
            mutedFg: '#aaa',
            ratingBtnBg: '#383838',
            ratingBtnFg: '#ccc',
          },
          light: {
            card: '#fff',
            fg: '#0f0f0f',
            border: '#d9d9d9',
            overlay: 'rgba(0,0,0,0.45)',
            bbg: '#fff',
            mutedFg: '#606060',
            ratingBtnBg: '#f0f0f0',
            ratingBtnFg: '#0f0f0f',
          },
        },
      },
      player: {
        playerSelector: '#movie_player, #player-container',
        initialVideoSelector: '#movie_player video.html5-main-video',
        pollVideoSelector: '#movie_player video.html5-main-video, .video-stream.html5-main-video',
        requirePlayerTarget: false,
        pollInterval: 2000,
      },
      dimmerStyleId: 'umm-yt-detail-styles',
      dimmerCss:
        '[data-umm-yt-dimmed]{opacity:0.35!important;filter:grayscale(80%)!important;transition:opacity 0.3s ease-in-out,filter 0.3s ease-in-out!important}[data-umm-yt-dimmed]:hover{opacity:1!important;filter:grayscale(0%)!important}@media (prefers-reduced-motion: reduce){[data-umm-yt-dimmed]{transition:none!important}}',
      recommendation: {
        cardSelector: VIDEO_CARD_SELECTOR,
        linkSelector: 'a[href*="/watch?v="]',
        idFromLink: (link) => parseYoutubeVideoId(link.getAttribute('href') || ''),
        dimmedAttr: 'data-umm-yt-dimmed',
        thumbSelector:
          '#thumbnail, yt-image, .ytd-thumbnail, .ytLockupViewModelContentImage, yt-thumbnail-view-model',
        containerSelectors: [
          '#secondary, #related, ytd-watch-next-secondary-results-renderer, #playlist, ytd-playlist-panel-renderer',
        ],
      },
    });

    // ── URL Detection ────────────────────────────────────────
    function isWatchPage(): boolean {
      return parseYoutubeSearchId(location.search) !== null;
    }

    function getVideoId(): string | null {
      return parseYoutubeSearchId(location.search);
    }

    // ══════════════════════════════════════════════════════════
    //  LISTING MODE (homepage / search / channel)
    // ══════════════════════════════════════════════════════════

    let listingObserver: MutationObserver | null = null;

    function injectListingStyles(): void {
      if (document.getElementById(LISTING_STYLE_ID)) return;
      const style = document.createElement('style');
      style.id = LISTING_STYLE_ID;
      style.textContent = buildListingDimmerCss();
      document.head.appendChild(style);
    }

    /**
     * One scan pass collects all unprocessed visible cards and resolves
     * their statuses with a SINGLE DB_GET_BULK (audit §P-C N+1 fix) —
     * pure logic + bulk key construction live in youtube-listing.ts.
     */
    function scanCards(): Promise<unknown> {
      return runYoutubeListingPass({
        root: document,
        storeName: STORE_NAMES.YOUTUBE,
        dbGetBulk: (storeName, keys) => Store.dbGetBulk(storeName, keys),
      });
    }

    function initListingMode(): void {
      const tryInit = () => {
        const feed = document.querySelector(
          'ytd-rich-grid-renderer, ytd-item-section-renderer, ytd-section-list-renderer',
        );
        if (feed) {
          void scanCards();
          startListingObserver();
          return true;
        }
        return false;
      };
      if (!tryInit()) {
        const onReady = () => {
          if (!tryInit()) {
            const obs = new MutationObserver(() => {
              if (tryInit()) obs.disconnect();
            });
            obs.observe(document.body, { childList: true, subtree: true });
          }
        };
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', onReady);
        } else {
          onReady();
        }
      }
    }

    function startListingObserver(): void {
      const target =
        document.querySelector('#contents, ytd-rich-grid-renderer, ytd-item-section-renderer') ||
        document.body;
      // throttle（trailing）：SPA 无限滚动高频变更下合并扫描；scanCards 本身
      // 每次都会批量收集全部未处理卡片，丢中间事件不丢最终状态。
      listingObserver = new MutationObserver(
        throttle(() => {
          void scanCards();
        }, OBSERVER_THROTTLE_MS),
      );
      listingObserver.observe(target, { childList: true, subtree: true });
    }

    function stopListingMode(): void {
      if (listingObserver) {
        listingObserver.disconnect();
        listingObserver = null;
      }
      const style = document.getElementById('umm-yt-listing-styles');
      if (style) style.remove();
    }

    // ══════════════════════════════════════════════════════════
    //  DETAIL MODE (watch page)
    // ══════════════════════════════════════════════════════════

    function initDetailMode(): void {
      const vid = getVideoId();
      if (!vid) return;
      overlay.setCurrent(vid);
      overlay.create();
      overlay.ensureButton();
      later(() => overlay.ensureButton(), 1000);
      later(() => overlay.ensureButton(), 3000);

      overlay.loadRecord().then(() => {
        overlay.applyBtnStyle();
        overlay.syncTrackerStatus();
        later(() => overlay.startRecommendationWatch(), 3000);
      });
    }

    function stopDetailMode(): void {
      overlay.cleanup();
    }

    // ══════════════════════════════════════════════════════════
    //  SPA NAVIGATION — URL Watcher
    // ══════════════════════════════════════════════════════════

    let currentMode: 'listing' | 'detail' | null = null;

    function onUrlChange() {
      const nowWatch = isWatchPage();
      const mode = nowWatch ? 'detail' : 'listing';
      if (mode === currentMode) {
        // Same mode: handle videoId change within detail mode
        if (mode === 'detail') {
          const nv = getVideoId();
          if (nv !== overlay.id) {
            stopDetailMode();
            initDetailMode();
          }
        }
        return;
      }
      // Mode switch
      if (currentMode === 'detail') stopDetailMode();
      if (currentMode === 'listing') stopListingMode();

      currentMode = mode;
      if (mode === 'detail') initDetailMode();
      else if (mode === 'listing') initListingMode();
    }

    function watchUrl(): void {
      window.addEventListener('popstate', onUrlChange);
      const origPush = history.pushState;
      history.pushState = function (...args) {
        origPush.apply(this, args);
        onUrlChange();
      };
      const origReplace = history.replaceState;
      history.replaceState = function (...args) {
        origReplace.apply(this, args);
        onUrlChange();
      };
      // Poll for SPA URL changes, skip when tab is hidden
      const urlPollTimer = setInterval(() => {
        if (!document.hidden) onUrlChange();
      }, 3000);

      // Clear the polling timer when the page is unloaded to avoid
      // orphaned timers lingering after the content script's host page
      // is bfcached or destroyed. Matches the cleanup discipline used by
      // useHomepageObserver / mteam / video-progress-tracker.
      window.addEventListener(
        'pagehide',
        () => {
          clearInterval(urlPollTimer);
        },
        { once: true },
      );
    }

    // ══════════════════════════════════════════════════════════
    //  INIT
    // ══════════════════════════════════════════════════════════

    currentMode = isWatchPage() ? 'detail' : 'listing';
    watchUrl(); // always watch for SPA navigation

    // Inject dimmer styles globally (both listing and detail modes need them)
    injectListingStyles();

    if (currentMode === 'detail') {
      initDetailMode();
    } else {
      initListingMode();
    }
  },
});
