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

import { defineContentScript } from 'wxt/utils/define-content-script'
import { Store, STORE_NAMES } from '@/features/database'
import {
  createVideoOverlay,
  parseYoutubeSearchId,
  parseYoutubeVideoId,
  storeKey,
  VIDEO_COLORS,
  VIDEO_LABELS,
} from '@/entrypoints/content/ui/video-overlay'

export default defineContentScript({
  matches: ['*://www.youtube.com/*', '*://m.youtube.com/*'],
  runAt: 'document_idle',

  main() {
    const later = (fn: () => void, ms: number): void => { setTimeout(fn, ms) }
    const DIMMER_THRESHOLD = 2 // status >= 2 triggers dimmer

    /** Unified video card selectors — covers all YouTube layouts */
    const VIDEO_CARD_SEL = [
      'ytd-rich-item-renderer',
      'ytd-video-renderer',
      'ytd-compact-video-renderer',
      'ytd-playlist-panel-video-renderer',
      'ytd-grid-video-renderer',
      'yt-lockup-view-model',
    ].join(',')

    const overlay = createVideoOverlay({
      storeName: STORE_NAMES.YOUTUBE,
      attrPrefix: 'umm-yt',
      fontFamily: 'Roboto,Arial,sans-serif',
      theme: {
        attr: 'dark',
        darkCheck: () => document.documentElement.hasAttribute('dark'),
        vars: {
          dark: { card: '#212121', fg: '#fff', border: '#383838', overlay: 'rgba(0,0,0,0.7)', bbg: '#383838', mutedFg: '#aaa', ratingBtnBg: '#383838', ratingBtnFg: '#ccc' },
          light: { card: '#fff', fg: '#0f0f0f', border: '#d9d9d9', overlay: 'rgba(0,0,0,0.45)', bbg: '#fff', mutedFg: '#606060', ratingBtnBg: '#f0f0f0', ratingBtnFg: '#0f0f0f' },
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
      dimmerCss: '[data-umm-yt-dimmed]{opacity:0.35!important;filter:grayscale(80%)!important;transition:opacity 0.3s ease-in-out,filter 0.3s ease-in-out!important}[data-umm-yt-dimmed]:hover{opacity:1!important;filter:grayscale(0%)!important}',
      recommendation: {
        cardSelector: VIDEO_CARD_SEL,
        linkSelector: 'a[href*="/watch?v="]',
        idFromLink: (link) => parseYoutubeVideoId(link.getAttribute('href') || ''),
        dimmedAttr: 'data-umm-yt-dimmed',
        thumbSelector: '#thumbnail, yt-image, .ytd-thumbnail, .ytLockupViewModelContentImage, yt-thumbnail-view-model',
        containerSelectors: ['#secondary, #related, ytd-watch-next-secondary-results-renderer, #playlist, ytd-playlist-panel-renderer'],
      },
    })

    // ── URL Detection ────────────────────────────────────────
    function isWatchPage(): boolean {
      return parseYoutubeSearchId(location.search) !== null
    }

    function getVideoId(): string | null {
      return parseYoutubeSearchId(location.search)
    }

    // ══════════════════════════════════════════════════════════
    //  LISTING MODE (homepage / search / channel)
    // ══════════════════════════════════════════════════════════

    const PROCESSED_ATTR = 'data-umm-yt-processed'
    const BADGE_CLASS = 'umm-yt-badge'
    let listingObserver: MutationObserver | null = null

    function injectListingStyles(): void {
      if (document.getElementById('umm-yt-listing-styles')) return
      const style = document.createElement('style')
      style.id = 'umm-yt-listing-styles'
      style.textContent = `
        [data-umm-yt-viewed="true"],
        [data-umm-yt-dimmed] {
          opacity: 0.35 !important;
          filter: grayscale(80%) !important;
          transition: opacity 0.3s ease-in-out, filter 0.3s ease-in-out !important;
        }
        [data-umm-yt-viewed="true"]:hover,
        [data-umm-yt-dimmed]:hover {
          opacity: 1 !important;
          filter: grayscale(0%) !important;
        }
        .${BADGE_CLASS} {
          position: absolute !important;
          top: 8px !important;
          left: 8px !important;
          z-index: 10 !important;
          padding: 2px 8px !important;
          border-radius: 6px !important;
          font-size: 11px !important;
          font-weight: 700 !important;
          font-family: Roboto, Arial, sans-serif !important;
          color: #fff !important;
          line-height: 1.5 !important;
          user-select: none !important;
          box-shadow: 0 2px 6px rgba(0,0,0,0.25) !important;
          cursor: default !important;
        }
      `
      document.head.appendChild(style)
    }

    function extractVideoIdFromCard(card: Element): string | null {
      const link = card.querySelector<HTMLAnchorElement>('a[href*="/watch?v="]')
      if (link) {
        const id = parseYoutubeVideoId(link.getAttribute('href') || '')
        if (id) return id
      }
      const allLinks = card.querySelectorAll('[href*="/watch?v="]')
      for (const el of allLinks) {
        const id = parseYoutubeVideoId(el.getAttribute('href') || '')
        if (id) return id
      }
      return null
    }

    function setListingBadge(card: HTMLElement, status: number, rating?: number) {
      let badge = card.querySelector<HTMLElement>(`.${BADGE_CLASS}`)
      if (!badge) {
        badge = document.createElement('div')
        badge.className = BADGE_CLASS
        const anchor = card.querySelector('#thumbnail, ytd-thumbnail a, a#thumbnail, .ytLockupViewModelContentImage, yt-thumbnail-view-model')
        if (anchor) {
          const thumb = (anchor.closest('#dismissible') || anchor.closest('ytd-thumbnail') || anchor) as HTMLElement
          thumb.style.position = 'relative'
          thumb.appendChild(badge)
        } else {
          card.appendChild(badge)
        }
      }
      let label = VIDEO_LABELS[status] || VIDEO_LABELS[0]
      if (status === 2 && rating && rating > 0) label += ' ' + rating
      badge.textContent = label
      badge.style.background = VIDEO_COLORS[status]
    }

    async function scanCards(): Promise<void> {
      const unprocessedQuery = VIDEO_CARD_SEL.split(',').map(s => `${s.trim()}:not([${PROCESSED_ATTR}])`).join(',')
      const cards = document.querySelectorAll<HTMLElement>(unprocessedQuery)
      if (cards.length === 0) return

      const batch: Array<{ el: HTMLElement; vid: string }> = []
      cards.forEach((card) => {
        card.setAttribute(PROCESSED_ATTR, 'true')
        const vid = extractVideoIdFromCard(card)
        if (!vid) return
        batch.push({ el: card, vid })
        setListingBadge(card, 0) // show default "未看" badge immediately
      })
      if (batch.length === 0) return

      // Parallel per-card lookups (same semantics as the legacy per-card sendMessage)
      await Promise.all(batch.map(async ({ el, vid }) => {
        try {
          const record = await Store.dbGet(STORE_NAMES.YOUTUBE, storeKey(vid))
          if (record) {
            const status = record.status || 0
            const rating = record.rating || 0
            if (status >= DIMMER_THRESHOLD) {
              el.setAttribute('data-umm-yt-viewed', 'true')
            }
            setListingBadge(el, status, rating)
          }
        } catch {
          // background unreachable — badge stays at default
        }
      }))
    }

    function initListingMode(): void {
      const tryInit = () => {
        const feed = document.querySelector('ytd-rich-grid-renderer, ytd-item-section-renderer, ytd-section-list-renderer')
        if (feed) {
          void scanCards()
          startListingObserver()
          return true
        }
        return false
      }
      if (!tryInit()) {
        const onReady = () => {
          if (!tryInit()) {
            const obs = new MutationObserver(() => {
              if (tryInit()) obs.disconnect()
            })
            obs.observe(document.body, { childList: true, subtree: true })
          }
        }
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', onReady)
        } else {
          onReady()
        }
      }
    }

    function startListingObserver(): void {
      const target = document.querySelector('#contents, ytd-rich-grid-renderer, ytd-item-section-renderer') || document.body
      listingObserver = new MutationObserver(() => { void scanCards() })
      listingObserver.observe(target, { childList: true, subtree: true })
    }

    function stopListingMode(): void {
      if (listingObserver) { listingObserver.disconnect(); listingObserver = null }
      const style = document.getElementById('umm-yt-listing-styles')
      if (style) style.remove()
    }

    // ══════════════════════════════════════════════════════════
    //  DETAIL MODE (watch page)
    // ══════════════════════════════════════════════════════════

    function initDetailMode(): void {
      const vid = getVideoId()
      if (!vid) return
      overlay.setCurrent(vid)
      overlay.create()
      overlay.ensureButton()
      later(() => overlay.ensureButton(), 1000)
      later(() => overlay.ensureButton(), 3000)

      overlay.loadRecord().then(() => {
        overlay.applyBtnStyle()
        overlay.syncTrackerStatus()
        later(() => overlay.startRecommendationWatch(), 3000)
      })
    }

    function stopDetailMode(): void {
      overlay.cleanup()
    }

    // ══════════════════════════════════════════════════════════
    //  SPA NAVIGATION — URL Watcher
    // ══════════════════════════════════════════════════════════

    let currentMode: 'listing' | 'detail' | null = null

    function onUrlChange() {
      const nowWatch = isWatchPage()
      const mode = nowWatch ? 'detail' : 'listing'
      if (mode === currentMode) {
        // Same mode: handle videoId change within detail mode
        if (mode === 'detail') {
          const nv = getVideoId()
          if (nv !== overlay.id) {
            stopDetailMode()
            initDetailMode()
          }
        }
        return
      }
      // Mode switch
      if (currentMode === 'detail') stopDetailMode()
      if (currentMode === 'listing') stopListingMode()

      currentMode = mode
      if (mode === 'detail') initDetailMode()
      else if (mode === 'listing') initListingMode()
    }

    function watchUrl(): void {
      window.addEventListener('popstate', onUrlChange)
      const origPush = history.pushState
      history.pushState = function (...args) {
        origPush.apply(this, args)
        onUrlChange()
      }
      const origReplace = history.replaceState
      history.replaceState = function (...args) {
        origReplace.apply(this, args)
        onUrlChange()
      }
      // Poll for SPA URL changes, skip when tab is hidden
      setInterval(() => { if (!document.hidden) onUrlChange(); }, 3000)
    }

    // ══════════════════════════════════════════════════════════
    //  INIT
    // ══════════════════════════════════════════════════════════

    currentMode = isWatchPage() ? 'detail' : 'listing'
    watchUrl() // always watch for SPA navigation

    // Inject dimmer styles globally (both listing and detail modes need them)
    injectListingStyles()

    if (currentMode === 'detail') {
      initDetailMode()
    } else {
      initListingMode()
    }
  },
})
