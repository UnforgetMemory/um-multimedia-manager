/**
 * Bilibili floating button + modal — WXT content script
 *
 * Thin per-site shell for the shared video-overlay module (audit §2.1 / T18).
 * All shared UI / theme / progress-tracking / DB logic lives in
 * src/entrypoints/content/ui/video-overlay.ts; this file keeps only what is
 * bilibili-specific: URL/id detection, SPA navigation, and the coin auto-mark.
 *
 * Status codes: 0=NONE, 1=WISHLIST, 2=DONE, 3=DOING
 * Store keys: 'movie::' + bvid (decision-3)
 */

import { defineContentScript } from 'wxt/utils/define-content-script'
import { STORE_NAMES } from '@/features/database'
import {
  createVideoOverlay,
  parseBilibiliBvid,
  parseBilibiliBvidFromHref,
} from '@/entrypoints/content/ui/video-overlay'

export default defineContentScript({
  matches: ['*://www.bilibili.com/video/*', '*://www.bilibili.com/list/*'],
  runAt: 'document_idle',

  main() {
    const later = (fn: () => void, ms: number): void => { setTimeout(fn, ms) }

    const overlay = createVideoOverlay({
      storeName: STORE_NAMES.BILIBILI,
      attrPrefix: 'umm-bili',
      fontFamily: '"Microsoft YaHei","PingFang SC",-apple-system,sans-serif',
      theme: {
        attr: 'data-theme',
        darkCheck: () => document.documentElement.getAttribute('data-theme') === 'dark',
        vars: {
          dark: { card: '#2a2a3e', fg: '#e0e0e0', border: '#3a3a4e', overlay: 'rgba(0,0,0,0.6)', bbg: '#3a3a4e', mutedFg: '#aaa', ratingBtnBg: '#3a3a4e', ratingBtnFg: '#ccc' },
          light: { card: '#fff', fg: '#1a1a1a', border: '#e5e7eb', overlay: 'rgba(0,0,0,0.45)', bbg: '#fff', mutedFg: '#666', ratingBtnBg: '#f3f4f6', ratingBtnFg: '#374151' },
        },
      },
      player: {
        playerSelector: '#bilibili-player, #playerWrap',
        initialVideoSelector: '#bilibili-player video',
        pollVideoSelector: '#bilibili-player video',
        requirePlayerTarget: true,
        pollInterval: 1000,
        pollStopAfter: 30,
        skipClosest: '.v-recommend-inline-player, .bpx-docker-minor, .bpx-player-auxiliary',
      },
      dimmerStyleId: 'umm-bili-dimmer-styles',
      dimmerCss: '[data-umm-bili-dimmed]{opacity:0.35!important;filter:grayscale(80%)!important;transition:opacity .3s,filter .3s}[data-umm-bili-dimmed]:hover{opacity:1!important;filter:grayscale(0%)!important}',
      recommendation: {
        cardSelector: '.recommend-list-v1 .video-page-card-small, .recommend-list-container .recommend-video-card.video-card',
        linkSelector: 'a[href*="/video/BV"]',
        idFromLink: (link) => parseBilibiliBvidFromHref(link.pathname),
        dimmedAttr: 'data-umm-bili-dimmed',
        thumbSelector: '.pic-box',
        containerSelectors: ['.recommend-list-v1', '.recommend-list-container'],
      },
    })

    // ── Coin Check Auto-Mark ─────────────────────────────────
    const COIN_BTN_SEL = '#arc_toolbar_report > div.video-toolbar-left > div > div:nth-child(2) > div'
    /** bvid at the time the coin check was scheduled — guard against SPA race */
    let coinCheckBVID: string | null = null
    /** MutationObserver watching for the coin button to appear after SPA nav */
    let coinObserver: MutationObserver | null = null
    /** Safety timeout that stops coinObserver after max wait */
    let coinSafetyTimer: ReturnType<typeof setTimeout> | null = null

    function stopCoinObserver() {
      if (coinObserver) { coinObserver.disconnect(); coinObserver = null }
      if (coinSafetyTimer) { clearTimeout(coinSafetyTimer); coinSafetyTimer = null }
    }

    function startCoinObserver() {
      if (coinObserver) return
      const target = document.querySelector('#arc_toolbar_report')
      if (!target) return
      coinObserver = new MutationObserver(() => {
        if (overlay.id !== coinCheckBVID) { stopCoinObserver(); return }
        const coinBtn = document.querySelector<HTMLElement>(COIN_BTN_SEL)
        if (coinBtn?.title && coinBtn.title.includes('已用完')) {
          stopCoinObserver()
          if (overlay.status === 2 || !overlay.id || !overlay.key) return
          overlay.markWatched(7)
        }
      })
      coinObserver.observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: ['title'] })
      coinSafetyTimer = setTimeout(() => stopCoinObserver(), 5000)
    }

    function checkCoinForAutoMark() {
      if (overlay.status === 2 || !overlay.id || !overlay.key) return
      const coinBtn = document.querySelector<HTMLElement>(COIN_BTN_SEL)
      if (coinBtn?.title && coinBtn.title.includes('已用完')) {
        overlay.markWatched(7)
        return
      }
      startCoinObserver()
    }

    // ── SPA Navigation ───────────────────────────────────────
    function onBvidChange() {
      const nb = parseBilibiliBvid(location.pathname, location.search)
      if (nb === overlay.id) return
      overlay.cleanup()
      if (!nb) { overlay.setCurrent(null); return }
      overlay.setCurrent(nb)
      overlay.create()
      overlay.loadRecord().then(() => {
        overlay.applyBtnStyle()
        overlay.syncTrackerStatus()
        coinCheckBVID = nb
        later(() => {
          if (overlay.id === coinCheckBVID) checkCoinForAutoMark()
        }, 1500)
        later(() => overlay.startRecommendationWatch(), 3000)
      })
    }

    function watchUrl() {
      window.addEventListener('popstate', onBvidChange)
      const origPush = history.pushState
      history.pushState = function (...args) {
        origPush.apply(this, args)
        onBvidChange()
      }
      const origReplace = history.replaceState
      history.replaceState = function (...args) {
        origReplace.apply(this, args)
        onBvidChange()
      }
      setInterval(() => {
        onBvidChange()
        overlay.ensureButton()
      }, 3000)
    }

    // ── Init ─────────────────────────────────────────────────
    const initialBvid = parseBilibiliBvid(location.pathname, location.search)
    if (!initialBvid) {
      overlay.destroy()
      return
    }
    overlay.setCurrent(initialBvid)

    function init() {
      watchUrl()
      overlay.create()
      overlay.loadRecord().then(() => {
        overlay.applyBtnStyle()
        overlay.syncTrackerStatus()
        coinCheckBVID = overlay.id
        later(() => {
          if (overlay.id === coinCheckBVID) checkCoinForAutoMark()
        }, 1500)
        later(() => overlay.startRecommendationWatch(), 3000)
      })
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init)
    } else {
      init()
    }
  },
})
