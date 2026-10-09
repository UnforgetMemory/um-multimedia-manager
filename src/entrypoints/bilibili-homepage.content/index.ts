/**
 * Bilibili listing dimmer — WXT content script
 *
 * Thin shell over content/ui/bilibili-listing.ts (scan / badge / CSS / SPA route).
 * Coverage: www homepage, search.bilibili.com, space.bilibili.com personal space
 * (home / lists / list details / upload).
 *
 * Status codes: 0=NONE, 1=WISHLIST, 2=DONE, 3=DOING
 * Store keys: decision-3 canonical 'movie::' + bvid via storeKey()
 */

import { defineContentScript } from 'wxt/utils/define-content-script';
import { STORE_NAMES, Store } from '@/engine/database';
import { throttle } from '@/libraries/utils';
import { bootstrapLogging } from '@/entrypoints/content/bootstrap/logging';
import {
  buildListingDimmerCss,
  invalidateProcessedRows,
  isListingCapableRoute,
  LISTING_CARD_SELECTOR,
  LISTING_ROOT_SELECTORS,
  LISTING_STYLE_ID,
  parseBiliListingRoute,
  runListingDimmerPass,
} from '@/entrypoints/content/ui/bilibili-listing';
import { initEventBus, onEvent } from '@/libraries/utils/event-bus';

export default defineContentScript({
  matches: ['*://www.bilibili.com/*', '*://search.bilibili.com/*', '*://space.bilibili.com/*'],
  excludeMatches: ['*://www.bilibili.com/video/*', '*://www.bilibili.com/list/*'],
  runAt: 'document_idle',

  main() {
    // Options 页的「调试日志」/级别只写进 chrome.storage：本上下文不读它就等于
    // 生产环境恒静音（logger 默认跟随 DEV）。先于路由判断，非列表页也要能取证。
    void bootstrapLogging();

    const STORE = STORE_NAMES.BILIBILI;
    // MutationObserver 回调节流窗口（trailing 语义）
    const OBSERVER_THROTTLE_MS = 250;

    function injectStyles(): void {
      if (document.getElementById(LISTING_STYLE_ID)) return;
      const style = document.createElement('style');
      style.id = LISTING_STYLE_ID;
      style.textContent = buildListingDimmerCss();
      document.head.appendChild(style);
    }

    function scanRoot(): Element {
      for (const sel of LISTING_ROOT_SELECTORS) {
        const el = document.querySelector(sel);
        if (el) return el;
      }
      return document.body;
    }

    function scanCards(): Promise<Awaited<ReturnType<typeof runListingDimmerPass>>> {
      return runListingDimmerPass({
        root: document,
        storeName: STORE,
        dbGetBulk: (storeName, keys) => Store.dbGetBulk(storeName, keys),
      });
    }

    let releaseRecordSub: (() => void) | undefined;

    /**
     * The DOM observer only reacts to host mutations; a record written from the
     * popup, another tab or a sync run changes nothing in the feed. Dirtiness is
     * cleared per event key so a foreign write never re-scans the whole list.
     */
    function subscribeRecordEvents(): void {
      if (releaseRecordSub) return;
      initEventBus();
      const onRecordChange = (data: unknown): void => {
        const payload = data as { storeName?: unknown; key?: unknown } | undefined;
        if (payload?.storeName !== STORE) return;
        const key = typeof payload.key === 'string' ? payload.key : undefined;
        if (invalidateProcessedRows(document, key) > 0) void scanCards();
      };
      const offUpdated = onEvent('record:updated', onRecordChange);
      const offDeleted = onEvent('record:deleted', onRecordChange);
      releaseRecordSub = () => {
        offUpdated();
        offDeleted();
      };
    }

    let listingObserver: MutationObserver | null = null;
    /**
     * Listing-root-not-mounted-yet watchers. Tracked so a route change can
     * release them — an untracked one keeps scanning the body forever and can
     * start a listing observer for a route the user already left.
     */
    let waitingObserver: MutationObserver | null = null;
    let domReadyListener: (() => void) | null = null;

    function startObserver(): void {
      const target = scanRoot();
      if (listingObserver) {
        listingObserver.disconnect();
        listingObserver = null;
      }
      // throttle（trailing）：无限滚动高频变更下合并扫描；
      // runListingDimmerPass 每趟批量收集全部未处理卡片，丢中间事件不丢最终状态。
      listingObserver = new MutationObserver(
        throttle(() => {
          void scanCards();
        }, OBSERVER_THROTTLE_MS),
      );
      listingObserver.observe(target, { childList: true, subtree: true });
    }

    function stopObserver(): void {
      listingObserver?.disconnect();
      listingObserver = null;
      releaseRecordSub?.();
      releaseRecordSub = undefined;
      waitingObserver?.disconnect();
      waitingObserver = null;
      if (domReadyListener) {
        document.removeEventListener('DOMContentLoaded', domReadyListener);
        domReadyListener = null;
      }
    }

    function tryInit(): boolean {
      const root = document.querySelector(LISTING_ROOT_SELECTORS.join(', '));
      if (!root && !document.querySelector(LISTING_CARD_SELECTOR)) return false;
      subscribeRecordEvents();
      void scanCards();
      startObserver();
      return true;
    }

    /** Release only the mount-waiting watchers, keeping a live listing observer. */
    function stopWaiting(): void {
      waitingObserver?.disconnect();
      waitingObserver = null;
      if (domReadyListener) {
        document.removeEventListener('DOMContentLoaded', domReadyListener);
        domReadyListener = null;
      }
    }

    function initListing(): void {
      // Re-entering listing mode replaces the previous mount watcher instead of
      // stacking a second body-level observer on top of it.
      stopWaiting();
      injectStyles();
      if (tryInit()) return;
      const onReady = () => {
        if (tryInit()) {
          stopWaiting();
          return;
        }
        if (waitingObserver) return;
        const obs = new MutationObserver(() => {
          if (tryInit()) stopWaiting();
        });
        waitingObserver = obs;
        if (document.body) {
          obs.observe(document.body, { childList: true, subtree: true });
        }
      };
      if (document.readyState === 'loading') {
        domReadyListener = onReady;
        document.addEventListener('DOMContentLoaded', onReady);
      } else {
        onReady();
      }
    }

    let lastHref = location.href;

    function onUrlChange(): void {
      const href = location.href;
      if (href === lastHref) {
        return;
      }
      lastHref = href;
      const route = parseBiliListingRoute(href);
      // Every real transition starts from a clean slate: the previous route's
      // observers — live or still waiting for its grid to mount — belong to a
      // document that is no longer on screen. A listing route re-arms fresh ones
      // through initListing(); anything else stays released.
      stopObserver();
      if (!isListingCapableRoute(route)) return;
      initListing();
    }

    function watchUrl(): void {
      window.addEventListener('popstate', onUrlChange);
      const origPush = history.pushState;
      history.pushState = function (...args: Parameters<History['pushState']>) {
        origPush.apply(this, args);
        onUrlChange();
      };
      const origReplace = history.replaceState;
      history.replaceState = function (...args: Parameters<History['replaceState']>) {
        origReplace.apply(this, args);
        onUrlChange();
      };
      const poll = setInterval(() => {
        if (!document.hidden) onUrlChange();
      }, 3000);
      window.addEventListener('pagehide', () => clearInterval(poll), { once: true });
    }

    const route = parseBiliListingRoute(location.href);
    if (isListingCapableRoute(route)) {
      initListing();
      watchUrl();
    }
  },
});
