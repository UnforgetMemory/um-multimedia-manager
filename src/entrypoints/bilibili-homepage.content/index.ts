/**
 * Bilibili homepage waterfall feed UMM injection — WXT content script
 *
 * Injects UMM status badges and dimmer effects on homepage video cards.
 * Handles SPA/infinite-scroll via MutationObserver.
 * Communicates with background via chrome.runtime.sendMessage for DB ops.
 *
 * Status codes: 0=NONE, 1=WISHLIST(想看), 2=DONE(已看), 3=DOING(在看)
 */

import { defineContentScript } from 'wxt/utils/define-content-script'

export default defineContentScript({
  matches: ['*://www.bilibili.com/*', '*://search.bilibili.com/*'],
  excludeMatches: ['*://www.bilibili.com/video/*'],
  runAt: 'document_idle',

  main() {
    // ── Constants ──────────────────────────────────────────
    const STORE = 'bilibili_records'
    const STATUS_COLORS = ['#9ca3af', '#f97316', '#22c55e', '#3b82f6'] as const
    const STATUS_LABELS = ['未看', '想看', '已看', '在看'] as const
    // Status codes that trigger dimmer : DONE=2, DOING=3
    const DIMMER_THRESHOLD = 2

    // Markers to prevent re-processing
    const PROCESSED_ATTR = 'data-umm-bili-processed'
    const BADGE_CLASS = 'umm-bili-badge'

    // ── Style Injection ────────────────────────────────────
    function injectStyles(): void {
      if (document.getElementById('umm-bili-homepage-styles')) return

      const style = document.createElement('style')
      style.id = 'umm-bili-homepage-styles'
      style.textContent = `
        /* Dimmer effect for watched cards */
        .bili-video-card.umm-viewed {
          opacity: 0.35 !important;
          filter: grayscale(80%) !important;
          transition: opacity 0.3s ease-in-out, filter 0.3s ease-in-out !important;
        }
        .bili-video-card.umm-viewed:hover {
          opacity: 1 !important;
          filter: grayscale(0%) !important;
        }

        .bili-video-card__image--link,
        .bili-video-card__image--filter {
          position: relative !important;
        }

        .umm-bili-badge {
          position: absolute !important;
          top: 8px !important;
          right: 8px !important;
          z-index: 10 !important;
          padding: 2px 8px !important;
          border-radius: 6px !important;
          font-size: 11px !important;
          font-weight: 700 !important;
          font-family: "Microsoft YaHei","PingFang SC",-apple-system,sans-serif !important;
          color: #fff !important;
          line-height: 1.5 !important;
          pointer-events: none !important;
          user-select: none !important;
          box-shadow: 0 2px 6px rgba(0,0,0,0.25) !important;
        }
      `
      document.head.appendChild(style)
    }

    // ── BV ID Extraction ───────────────────────────────────
    function extractBvid(card: Element): string | null {
      // Direct link inside card
      const link = card.querySelector<HTMLAnchorElement>('a[href*="/video/"]')
      if (link) {
        const m = link.href.match(/\/video\/(BV[a-zA-Z0-9]+)/)
        if (m) return m[1]
      }
      // Fallback: check any href attribute
      const links = card.querySelectorAll('[href*="/video/"]')
      for (const el of links) {
        const href = el.getAttribute('href') || ''
        const m = href.match(/\/video\/(BV[a-zA-Z0-9]+)/)
        if (m) return m[1]
      }
      return null
    }

    // ── Badge Management ─────────────────────────────────
    function setBadge(card: HTMLElement, status: number, rating?: number): void {
      let badge = card.querySelector<HTMLElement>(`.${BADGE_CLASS}`)
      if (!badge) {
        badge = document.createElement('div')
        badge.className = BADGE_CLASS
        const anchor = (
          card.querySelector('.bili-video-card__image--link') ||
          card.querySelector('.bili-video-card__image--filter') ||
          card.querySelector('a[href*="/video/"]')
        )
        if (anchor) {
          anchor.appendChild(badge)
        } else {
          card.appendChild(badge)
        }
      }

      let label = STATUS_LABELS[status] || STATUS_LABELS[0]
      if (status === 2 && rating && rating > 0) {
        label += ' ' + rating
      }
      badge.textContent = label
      badge.style.background = STATUS_COLORS[status]
    }

    // ── Card Scanning ──────────────────────────────────────
    function scanCards(): void {
      const cards = document.querySelectorAll<HTMLElement>(
        `.bili-video-card:not([${PROCESSED_ATTR}])`
      )
      if (cards.length === 0) return

      const batch: Array<{ el: HTMLElement; bvid: string }> = []

      cards.forEach((card) => {
        card.setAttribute(PROCESSED_ATTR, 'true')
        const bvid = extractBvid(card)
        if (!bvid) return
        batch.push({ el: card, bvid })
        // Show default "未看" badge immediately
        setBadge(card, 0)
      })

      if (batch.length === 0) return

      for (const { el, bvid } of batch) {
        const key = 'video::' + bvid
        chrome.runtime.sendMessage(
          { type: 'DB_GET', payload: { storeName: STORE, key } },
          (resp) => {
            if (chrome.runtime.lastError) return
            if (resp?.success && resp.record) {
              const status = resp.record.status || 0
              const rating = resp.record.rating || 0
              if (status >= DIMMER_THRESHOLD) {
                el.classList.add('umm-viewed')
              }
              setBadge(el, status, rating)
            }
          },
        )
      }
    }

    // ── Init ────────────────────────────────────────────────
    injectStyles()

    // Initial scan after DOM is ready
    const tryInit = () => {
      const feed = document.querySelector('.bili-feed4, .bili-feed4-layout, #app')
      if (feed) {
        scanCards()
        return true
      }
      return false
    }

    if (!tryInit()) {
      // Feed not ready yet — retry after DOMContentLoaded
      const onReady = () => {
        if (!tryInit()) {
          // Last resort: wait for feed container
          const observer = new MutationObserver(() => {
            if (tryInit()) {
              observer.disconnect()
              startObserver()
            }
          })
          observer.observe(document.body, { childList: true, subtree: true })
        } else {
          startObserver()
        }
      }
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', onReady)
      } else {
        onReady()
      }
    } else {
      startObserver()
    }

    // ── MutationObserver for dynamic content ───────────────
    function startObserver(): void {
      const target = document.querySelector('.bili-feed4, .bili-feed4-layout, .search-content') || document.body
      const observer = new MutationObserver(() => scanCards())
      observer.observe(target, { childList: true, subtree: true })
    }
  },
})