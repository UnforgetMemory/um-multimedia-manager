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

import { defineContentScript } from 'wxt/utils/define-content-script'
import { STORE_NAMES, Store } from '@/features/database'
import {
  buildListingDimmerCss,
  isListingCapableRoute,
  LISTING_CARD_SELECTOR,
  LISTING_ROOT_SELECTORS,
  LISTING_STYLE_ID,
  parseBiliListingRoute,
  runListingDimmerPass,
} from '@/entrypoints/content/ui/bilibili-listing'

export default defineContentScript({
  matches: [
    '*://www.bilibili.com/*',
    '*://search.bilibili.com/*',
    '*://space.bilibili.com/*',
  ],
  excludeMatches: [
    '*://www.bilibili.com/video/*',
    '*://www.bilibili.com/list/*',
  ],
  runAt: 'document_idle',

  main() {
    const STORE = STORE_NAMES.BILIBILI

    function injectStyles(): void {
      if (document.getElementById(LISTING_STYLE_ID)) return
      const style = document.createElement('style')
      style.id = LISTING_STYLE_ID
      style.textContent = buildListingDimmerCss()
      document.head.appendChild(style)
    }

    function scanRoot(): Element {
      for (const sel of LISTING_ROOT_SELECTORS) {
        const el = document.querySelector(sel)
        if (el) return el
      }
      return document.body
    }

    function scanCards(): Promise<Awaited<ReturnType<typeof runListingDimmerPass>>> {
      return runListingDimmerPass({
        root: document,
        storeName: STORE,
        dbGetBulk: (storeName, keys) => Store.dbGetBulk(storeName, keys),
      })
    }

    let listingObserver: MutationObserver | null = null

    function startObserver(): void {
      const target = scanRoot()
      if (listingObserver) {
        listingObserver.disconnect()
        listingObserver = null
      }
      listingObserver = new MutationObserver(() => {
        void scanCards()
      })
      listingObserver.observe(target, { childList: true, subtree: true })
    }

    function tryInit(): boolean {
      const root = document.querySelector(LISTING_ROOT_SELECTORS.join(', '))
      if (!root && !document.querySelector(LISTING_CARD_SELECTOR)) return false
      void scanCards()
      startObserver()
      return true
    }

    function initListing(): void {
      injectStyles()
      if (tryInit()) return
      const onReady = () => {
        if (!tryInit()) {
          const obs = new MutationObserver(() => {
            if (tryInit()) obs.disconnect()
          })
          if (document.body) {
            obs.observe(document.body, { childList: true, subtree: true })
          }
        }
      }
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', onReady)
      } else {
        onReady()
      }
    }

    let lastHref = location.href

    function onUrlChange(): void {
      const href = location.href
      if (href === lastHref) {
        return
      }
      lastHref = href
      const route = parseBiliListingRoute(href)
      if (!isListingCapableRoute(route)) return
      injectStyles()
      startObserver()
      void scanCards()
    }

    function watchUrl(): void {
      window.addEventListener('popstate', onUrlChange)
      const origPush = history.pushState
      history.pushState = function (...args: Parameters<History['pushState']>) {
        origPush.apply(this, args)
        onUrlChange()
      }
      const origReplace = history.replaceState
      history.replaceState = function (...args: Parameters<History['replaceState']>) {
        origReplace.apply(this, args)
        onUrlChange()
      }
      const poll = setInterval(() => {
        if (!document.hidden) onUrlChange()
      }, 3000)
      window.addEventListener('pagehide', () => clearInterval(poll), { once: true })
    }

    const route = parseBiliListingRoute(location.href)
    if (isListingCapableRoute(route)) {
      initListing()
      watchUrl()
    }
  },
})
