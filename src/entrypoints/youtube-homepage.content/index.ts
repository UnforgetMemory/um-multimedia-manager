/**
 * YouTube unified content script — WXT content script
 *
 * Handles ALL YouTube pages with URL-based mode switching:
 * - Listing mode (homepage/search/channel): card badge injection + dimmer
 * - Detail mode (watch page): floating button + modal + progress tracker + recommendation badges
 * - SPA navigation: seamlessly switches modes when URL changes
 *
 * Status codes: 0=NONE, 1=WISHLIST, 2=DONE, 3=DOING
 * Theme: reacts to html[dark] + prefers-color-scheme changes
 */

import { defineContentScript } from 'wxt/utils/define-content-script'

export default defineContentScript({
  matches: ['*://www.youtube.com/*', '*://m.youtube.com/*'],
  runAt: 'document_idle',

  main() {
    // ── Shared Constants ───────────────────────────────────────
    const STORE = 'youtube_records'
    const COLORS = ['#9ca3af', '#f97316', '#22c55e', '#3b82f6'] as const
    const LABELS = ['未看', '想看', '已看', '在看'] as const
    const DISPLAY = [0, 1, 3, 2] as const
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

    // ── URL Detection ──────────────────────────────────────────
    function isWatchPage(): boolean {
      const params = new URLSearchParams(location.search)
      const v = params.get('v')
      return !!v && /^[a-zA-Z0-9_-]{11}$/.test(v)
    }

    function getVideoId(): string | null {
      const params = new URLSearchParams(location.search)
      const v = params.get('v')
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v
      return null
    }

    function storeKey(vid: string): string { return 'video::' + vid }

    // ── Shared Utility ─────────────────────────────────────────
    function later(fn: () => void, ms: number): void {
      setTimeout(fn, ms)
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
        const href = link.getAttribute('href') || ''
        const m = href.match(/[?&]v=([a-zA-Z0-9_-]{11})/)
        if (m) return m[1]
      }
      const allLinks = card.querySelectorAll('[href*="/watch?v="]')
      for (const el of allLinks) {
        const href = el.getAttribute('href') || ''
        const m = href.match(/[?&]v=([a-zA-Z0-9_-]{11})/)
        if (m) return m[1]
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
      let label = LABELS[status] || LABELS[0]
      if (status === 2 && rating && rating > 0) label += ' ' + rating
      badge.textContent = label
      badge.style.background = COLORS[status]
    }

    function scanCards(): void {
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

      for (const { el, vid } of batch) {
        chrome.runtime.sendMessage(
          { type: 'DB_GET', payload: { storeName: STORE, key: storeKey(vid) } },
          (resp) => {
            if (chrome.runtime.lastError) return
            if (resp?.success && resp.record) {
              const status = resp.record.status || 0
              const rating = resp.record.rating || 0
              if (status >= DIMMER_THRESHOLD) {
                el.setAttribute('data-umm-yt-viewed', 'true')
              }
              setListingBadge(el, status, rating)
            }
          },
        )
      }
    }

    function initListingMode(): void {
      const tryInit = () => {
        const feed = document.querySelector('ytd-rich-grid-renderer, ytd-item-section-renderer, ytd-section-list-renderer')
        if (feed) {
          scanCards()
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
      listingObserver = new MutationObserver(() => scanCards())
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

    let videoId: string | null = null
    let KEY: string | null = null
    /** videoId guard for tracker timeupdate closure */
    let currentVideoId: string | null = null

    let watchStatus = 0
    let watchRating = 0
    let btn: HTMLDivElement | null = null
    let modal: HTMLDivElement | null = null
    let watchLoaded = false
    let isDark = false

    let progressTracker: VideoProgressTracker | null = null
    let recObserver: MutationObserver | null = null
    let cleanupTheme: (() => void) | null = null

    // ── Progress Tracker ─────────────────────────────────
    interface ProgressTrackerConfig {
      onThresholdReached: () => void
    }

    function calcThreshold(duration: number): number {
      if (duration <= 0) return 55
      if (duration < 300) return 55    // < 5min
      if (duration < 900) return 60    // 5-15min
      if (duration < 2700) return 65   // 15-45min
      if (duration < 3600) return 70   // 45-60min
      return 70                         // > 60min
    }

    class VideoProgressTracker {
      readonly vid: string
      private config: ProgressTrackerConfig
      private video: HTMLVideoElement | null = null
      private observer: MutationObserver | null = null
      private pollTimer: ReturnType<typeof setInterval> | null = null
      private fallbackTimer: ReturnType<typeof setInterval> | null = null
      private thresholdPassed = false
      private _active = false
      private _attachedEvents = false
      private _handleTimeupdate: (() => void) | null = null
      private _handleEnded: (() => void) | null = null

      constructor(vid: string, config: ProgressTrackerConfig) {
        this.vid = vid
        this.config = config
      }

      get active(): boolean { return this._active }

      activate(): void {
        if (this._active) return
        this._active = true
        this.thresholdPassed = false
        this.startScanning()
      }

      deactivate(): void {
        if (!this._active) return
        this._active = false
        this.detachVideoEvents()
        this.clearTimers()
      }

      destroy(): void {
        this.deactivate()
        this.video = null
      }

      private clearPolling(): void {
        if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null }
        if (this.fallbackTimer) { clearInterval(this.fallbackTimer); this.fallbackTimer = null }
      }

      private clearTimers(): void {
        this.clearPolling()
        if (this.observer) { this.observer.disconnect(); this.observer = null }
      }

      private detachVideoEvents(): void {
        if (this.video && this._attachedEvents) {
          if (this._handleTimeupdate) this.video.removeEventListener('timeupdate', this._handleTimeupdate)
          if (this._handleEnded) this.video.removeEventListener('ended', this._handleEnded)
          this._attachedEvents = false
        }
      }

      private reattachIfNew(video: HTMLVideoElement): void {
        if (video === this.video) return
        this.attachEvents(video)
      }

      private ensureObserver(): void {
        if (this.observer) return
        const target = document.querySelector('#movie_player, #player-container')
        if (!target) return
        this.observer = new MutationObserver((mutations) => {
          for (const m of mutations) {
            if (m.type === 'childList') {
              for (const node of m.addedNodes) {
                if (node instanceof HTMLVideoElement) { this.reattachIfNew(node); return }
                if (node instanceof Element) {
                  const v = node.querySelector<HTMLVideoElement>('video')
                  if (v) { this.reattachIfNew(v); return }
                }
              }
            }
          }
        })
        this.observer.observe(target, { childList: true, subtree: true })
      }

      private startScanning(): void {
        if (this.video) { this.attachEvents(this.video); return }
        const existing = document.querySelector<HTMLVideoElement>('#movie_player video.html5-main-video')
        if (existing) { this.attachEvents(existing); return }
        this.pollTimer = setInterval(() => {
          const v = document.querySelector<HTMLVideoElement>('#movie_player video.html5-main-video, .video-stream.html5-main-video')
          if (v) {
            if (this.pollTimer) clearInterval(this.pollTimer)
            this.attachEvents(v)
          }
        }, 2000)
      }

      private attachEvents(video: HTMLVideoElement): void {
        if (this.video === video && this._attachedEvents) return
        this.detachVideoEvents()
        this.video = video
        this.clearPolling()
        this._handleTimeupdate = () => {
          if (!this._active || !this.video || !this.video.duration || this.video.duration === Infinity) return
          if (this.vid !== currentVideoId) return
          const pct = (this.video.currentTime / this.video.duration) * 100
          const threshold = calcThreshold(this.video.duration)
          if (!this.thresholdPassed && pct >= threshold) {
            this.thresholdPassed = true
            this.config.onThresholdReached()
          }
        }
        this._handleEnded = () => {
          if (!this._active || !this.video) return
          if (this.vid !== currentVideoId) return
          if (!this.thresholdPassed) {
            this.thresholdPassed = true
            this.config.onThresholdReached()
          }
        }
        video.addEventListener('timeupdate', this._handleTimeupdate)
        video.addEventListener('ended', this._handleEnded)
        this._attachedEvents = true
        this.ensureObserver()
      }
    }

    // ── Theme ──────────────────────────────────────────────
    function detectDark(): boolean {
      return document.documentElement.hasAttribute('dark')
        || window.matchMedia('(prefers-color-scheme: dark)').matches
    }

    interface ThemeVars {
      card: string; fg: string; border: string; overlay: string
      bbg: string; muted: string; mutedFg: string
    }

    function themeVars(dark: boolean): ThemeVars {
      return dark
        ? { card: '#212121', fg: '#fff', border: '#383838', overlay: 'rgba(0,0,0,0.7)', bbg: '#383838', muted: '#383838', mutedFg: '#aaa' }
        : { card: '#fff', fg: '#0f0f0f', border: '#d9d9d9', overlay: 'rgba(0,0,0,0.45)', bbg: '#fff', muted: '#f0f0f0', mutedFg: '#606060' }
    }

    function tv(): ThemeVars { return themeVars(isDark) }

    // ── Style Templates ────────────────────────────────────
    function css(parts: string[]): string { return parts.join(';') + ';' }

    function sBtnFloat(_t: ThemeVars, s: number): string {
      return css([
        'position:fixed', 'left:16px', 'top:50%', 'transform:translateY(-50%)',
        'z-index:2147483647', 'width:48px', 'height:48px', 'border-radius:14px',
        'background:' + COLORS[s], 'color:#fff',
        'display:flex', 'flex-direction:column', 'align-items:center', 'justify-content:center',
        'cursor:pointer', 'font-size:11px', 'font-weight:' + (s === 2 ? '800' : '700'),
        'font-family:Roboto,Arial,sans-serif',
        'box-shadow:' + (s > 0 ? '0 4px 16px ' + COLORS[s] + '66,0 2px 6px rgba(0,0,0,0.2)' : '0 3px 14px rgba(0,0,0,0.25)'),
        'transition:background 0.25s,transform 0.2s,box-shadow 0.25s',
        'user-select:none', 'line-height:1.2',
      ])
    }

    function sBadge(t: ThemeVars, s: number): string {
      return css([
        'position:absolute', 'top:-7px', 'right:-7px',
        'background:' + t.card, 'color:' + COLORS[s],
        'border-radius:9px', 'padding:0 5px',
        'font-size:10px', 'font-weight:' + (isDark ? '700' : '800'),
        'line-height:18px', 'box-shadow:0 1px 4px rgba(0,0,0,0.2)',
        'border:1.5px solid ' + COLORS[s],
      ])
    }

    function sOverlay(t: ThemeVars): string {
      return css([
        'position:fixed', 'inset:0', 'z-index:2147483647',
        'background:' + t.overlay,
        'display:flex', 'align-items:center', 'justify-content:center',
        'font-family:Roboto,Arial,sans-serif',
      ])
    }

    function sCard(t: ThemeVars): string {
      return css([
        'background:' + t.card, 'border-radius:16px', 'padding:24px',
        'width:300px', 'max-width:90vw',
        'box-shadow:0 8px 32px rgba(0,0,0,0.25)', 'color:' + t.fg,
      ])
    }

    function sTitle(): string {
      return 'font-size:16px;font-weight:700;margin-bottom:16px;'
    }

    function sStatusBtn(idx: number, cur: number): string {
      const active = cur === idx
      return css([
        'flex:1', 'min-width:' + (LABELS[idx].length > 2 ? '60px' : '44px'),
        'padding:8px 0', 'border:2px solid ' + COLORS[idx],
        'border-radius:8px', 'cursor:pointer', 'font-size:13px', 'font-weight:700',
        'font-family:inherit', 'transition:all 0.15s',
        'background:' + (active ? COLORS[idx] : 'transparent'),
        'color:' + (active ? '#fff' : COLORS[idx]),
        'opacity:' + (active ? '1' : '0.85'),
      ])
    }

    function sSectionRow(): string { return 'display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;' }

    function sRatingLabel(t: ThemeVars): string {
      return 'font-size:13px;color:' + t.mutedFg + ';margin-bottom:6px;font-weight:600;'
    }

    function sRatingBtn(v: number, cur: number): string {
      const active = v === cur
      return css([
        'width:40px', 'height:32px', 'border:none',
        'border-radius:6px', 'cursor:pointer',
        'font-size:12px', 'font-weight:700', 'font-family:inherit',
        'background:' + (active ? COLORS[2] : (isDark ? '#383838' : '#f0f0f0')),
        'color:' + (active ? '#fff' : (isDark ? '#ccc' : '#0f0f0f')),
        'transition:all 0.1s', 'opacity:' + (active ? '1' : '0.85'),
      ])
    }

    function sActionRow(): string { return 'display:flex;gap:8px;' }

    function sCancelBtn(t: ThemeVars): string {
      return css([
        'flex:1', 'padding:10px 0', 'border:1px solid ' + t.border,
        'border-radius:8px', 'cursor:pointer', 'font-size:14px', 'font-weight:600',
        'font-family:inherit', 'background:' + t.bbg, 'color:' + t.fg,
      ])
    }

    function sSaveBtn(s: number): string {
      return css([
        'flex:1', 'padding:10px 0', 'border:none',
        'border-radius:8px', 'cursor:pointer', 'font-size:14px', 'font-weight:600',
        'font-family:inherit', 'color:#fff', 'background:' + COLORS[s],
      ])
    }

    function sRatingGrid(): string { return 'display:flex;flex-wrap:wrap;gap:4px;' }

    function sRatingSection(show: boolean): string {
      return 'display:' + (show ? 'block' : 'none') + ';margin-bottom:16px;'
    }

    function syncTrackerStatus() {
      if (!progressTracker) return
      if (watchStatus === 2) { progressTracker.deactivate() }
      else { progressTracker.activate() }
    }

    // ── Data ───────────────────────────────────────────────
    function loadRecord(cb?: () => void) {
      let cbCalled = false
      chrome.runtime.sendMessage(
        { type: 'DB_GET', payload: { storeName: STORE, key: KEY } },
        (resp: any) => {
          if (resp?.success && resp.record) {
            watchStatus = resp.record.status || 0
            watchRating = resp.record.rating || 0
          }
          watchLoaded = true
          if (!cbCalled) { cbCalled = true; cb?.() }
        },
      )
      setTimeout(() => {
        if (!watchLoaded) { watchLoaded = true; if (!cbCalled) { cbCalled = true; cb?.() } }
      }, 2000)
    }

    function saveRecord(st: number, ra: number) {
      chrome.runtime.sendMessage(
        {
          type: 'DB_PUT',
          payload: {
            storeName: STORE, key: KEY,
            record: {
              url: location.href, status: st, rating: ra,
              comment: '', updatedAt: new Date().toISOString(), linkedIds: {},
            },
          },
        },
        (resp) => {
          if (chrome.runtime.lastError) return
          if (!resp?.success) return
        },
      )
    }

    // ── Theme Observer ─────────────────────────────────────
    function startThemeWatch() {
      isDark = detectDark()
      const onThemeChange = () => {
        const newDark = detectDark()
        if (newDark === isDark) return
        isDark = newDark
        applyBtnStyle()
        if (modal) applyModalTheme()
      }
      const obs = new MutationObserver((mutations) => {
        for (const m of mutations) {
          if (m.type === 'attributes' && m.attributeName === 'dark') { onThemeChange(); break }
        }
      })
      obs.observe(document.documentElement, { attributes: true, attributeFilter: ['dark'] })
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      mq.addEventListener('change', onThemeChange)
      return () => { obs.disconnect(); mq.removeEventListener('change', onThemeChange) }
    }

    // ── FAB Button ─────────────────────────────────────────
    function createButton() {
      if (btn || !videoId) return
      btn = document.createElement('div')
      btn.setAttribute('data-umm-yt-float', '')
      btn.addEventListener('mouseenter', () => { if (btn) btn.style.transform = 'translateY(-50%) scale(1.08)' })
      btn.addEventListener('mouseleave', () => { if (btn) btn.style.transform = 'translateY(-50%) scale(1)' })
      btn.addEventListener('click', showModal)
      applyBtnStyle()
      document.body.appendChild(btn)
    }

    function applyBtnStyle() {
      if (!btn) return
      const t = tv()
      btn.style.cssText = sBtnFloat(t, watchStatus)
      btn.textContent = LABELS[watchStatus].slice(0, 2)
      const existingBadge = btn.querySelector('[data-umm-yt-rating]')
      if (existingBadge) existingBadge.remove()
      if (watchStatus === 2 && watchRating > 0) {
        const badge = document.createElement('div')
        badge.setAttribute('data-umm-yt-rating', '')
        badge.textContent = String(watchRating)
        badge.style.cssText = sBadge(t, watchStatus)
        btn.appendChild(badge)
      }
    }

    // ── Modal Dialog ───────────────────────────────────────
    function closeModal() {
      if (modal) { modal.remove(); modal = null }
    }

    function applyModalTheme() {
      if (!modal) return
      const t = tv()
      const card = modal.firstChild as HTMLElement | null
      if (!card) return
      modal.style.background = t.overlay
      card.style.background = t.card
      card.style.color = t.fg
      const cancel = card.querySelector('[data-umm-yt-cancel]') as HTMLButtonElement | null
      if (cancel) cancel.style.cssText = sCancelBtn(t)
      const rl = card.querySelector('[data-umm-yt-rl]') as HTMLDivElement | null
      if (rl) rl.style.cssText = sRatingLabel(t)
      const ratingBtns = card.querySelectorAll('[data-umm-yt-rb]') as NodeListOf<HTMLButtonElement>
      ratingBtns.forEach((rb) => {
        const v = parseInt(rb.textContent!, 10)
        rb.style.cssText = sRatingBtn(v, watchRating)
      })
    }

    function showModal() {
      if (modal) return
      const t = tv()
      modal = document.createElement('div')
      modal.setAttribute('data-umm-yt-modal', '')
      modal.style.cssText = sOverlay(t)
      const card = document.createElement('div')
      card.style.cssText = sCard(t)

      const title = document.createElement('div')
      title.setAttribute('data-umm-yt-title', '')
      title.textContent = '\u6807\u8bb0\u72b6\u6001'
      title.style.cssText = sTitle()
      card.appendChild(title)

      let sbtns: HTMLButtonElement[] = []
      let sv: HTMLButtonElement | null = null
      let rr: HTMLDivElement | null = null

      const updateUI = () => {
        if (!sbtns.length || !sv || !rr) return
        sbtns.forEach((b, i) => { b.style.cssText = sStatusBtn(DISPLAY[i], watchStatus) })
        sv.style.cssText = sSaveBtn(watchStatus)
        rr.style.cssText = sRatingSection(watchStatus === 2)
      }

      const sr = document.createElement('div')
      sr.setAttribute('data-umm-yt-sr', '')
      sr.style.cssText = sSectionRow()
      sbtns = []
      DISPLAY.forEach((idx) => {
        const b = document.createElement('button')
        b.setAttribute('data-umm-yt-sb', '')
        b.textContent = LABELS[idx]
        b.style.cssText = sStatusBtn(idx, watchStatus)
        b.addEventListener('mouseenter', () => { if (watchStatus !== idx) b.style.opacity = '1' })
        b.addEventListener('mouseleave', () => { if (watchStatus !== idx) b.style.opacity = '0.85' })
        b.onclick = () => { watchStatus = idx; updateUI() }
        sbtns.push(b)
        sr.appendChild(b)
      })
      card.appendChild(sr)

      rr = document.createElement('div')
      rr.setAttribute('data-umm-yt-rr', '')
      rr.style.cssText = sRatingSection(watchStatus === 2)
      const rl = document.createElement('div')
      rl.setAttribute('data-umm-yt-rl', '')
      rl.textContent = '\u8bc4\u5206'
      rl.style.cssText = sRatingLabel(t)
      rr.appendChild(rl)

      const rGrid = document.createElement('div')
      rGrid.setAttribute('data-umm-yt-rg', '')
      rGrid.style.cssText = sRatingGrid()
      for (let ri = 0; ri <= 10; ri++) {
        const rb = document.createElement('button')
        rb.setAttribute('data-umm-yt-rb', '')
        rb.textContent = String(ri)
        rb.style.cssText = sRatingBtn(ri, watchRating)
        rb.addEventListener('mouseenter', () => { if (ri !== watchRating) rb.style.opacity = '1' })
        rb.addEventListener('mouseleave', () => { if (ri !== watchRating) rb.style.opacity = '0.85' })
        rb.onclick = ((v: number) => () => {
          watchRating = v
          const all = rGrid.querySelectorAll('[data-umm-yt-rb]') as NodeListOf<HTMLButtonElement>
          all.forEach((b) => { b.style.cssText = sRatingBtn(parseInt(b.textContent!, 10), watchRating) })
        })(ri)
        rGrid.appendChild(rb)
      }
      rr.appendChild(rGrid)
      card.appendChild(rr)

      const ar = document.createElement('div')
      ar.setAttribute('data-umm-yt-ar', '')
      ar.style.cssText = sActionRow()
      const cb = document.createElement('button')
      cb.setAttribute('data-umm-yt-cancel', '')
      cb.textContent = '\u53d6\u6d88'
      cb.style.cssText = sCancelBtn(t)
      cb.addEventListener('mouseenter', () => { cb.style.opacity = '0.8' })
      cb.addEventListener('mouseleave', () => { cb.style.opacity = '1' })
      cb.onclick = () => closeModal()
      ar.appendChild(cb)

      sv = document.createElement('button')
      sv.setAttribute('data-umm-yt-save', '')
      sv.textContent = '\u4fdd\u5b58'
      sv.style.cssText = sSaveBtn(watchStatus)
      sv.addEventListener('mouseenter', () => { sv.style.opacity = '0.85' })
      sv.addEventListener('mouseleave', () => { sv.style.opacity = '1' })
      sv.onclick = () => { closeModal(); applyBtnStyle(); saveRecord(watchStatus, watchStatus === 2 ? watchRating : 0); syncTrackerStatus() }
      ar.appendChild(sv)
      card.appendChild(ar)
      modal.appendChild(card)
      document.body.appendChild(modal)
    }

    // ── Recommendation Badge Injection (detail mode) ───────
        function decorateRecommendations(recordMap: Map<string, { status: number; rating: number }>) {
      const items = document.querySelectorAll<HTMLElement>(VIDEO_CARD_SEL)
      for (const item of items) {
        const link = item.querySelector<HTMLAnchorElement>('a[href*="/watch?v="]')
        if (!link) continue
        const href = link.getAttribute('href') || ''
        const m = href.match(/[?&]v=([a-zA-Z0-9_-]{11})/)
        if (!m) continue
        const vid = m[1]
        const rec = recordMap.get(storeKey(vid))
        const st = rec?.status ?? 0
        const ra = rec?.rating ?? 0

        if (st === 2) {
          item.dataset.ummYtDimmed = 'true'
        }
        const existing = item.querySelector('[data-umm-rec-badge]')
        if (existing) continue
        const badge = document.createElement('div')
        badge.setAttribute('data-umm-rec-badge', '')
        let badgeText = LABELS[st].slice(0, 2)
        if (st === 2 && ra > 0) badgeText += ' ' + ra
        badge.textContent = badgeText
        badge.style.cssText = 'position:absolute;top:4px;left:4px;z-index:10;font-size:10px;font-weight:700;' +
          'background:' + COLORS[st] + ';color:#fff;padding:1px 5px;border-radius:6px;' +
          'font-family:Roboto,Arial,sans-serif;line-height:1.6;cursor:default'
        const thumb = item.querySelector<HTMLElement>('#thumbnail, yt-image, .ytd-thumbnail, .ytLockupViewModelContentImage, yt-thumbnail-view-model')
        if (thumb) {
          thumb.style.position = 'relative'
          thumb.appendChild(badge)
        }
      }
    }

    function loadAndDecorateRecommendations() {
      if (!videoId) return
      chrome.runtime.sendMessage(
        { type: 'DB_GET_ALL', payload: { storeName: STORE } },
        (resp: any) => {
          if (!resp?.success || !Array.isArray(resp.entries)) return
          const recordMap = new Map<string, { status: number; rating: number }>()
          for (const entry of resp.entries) {
            if (entry?.key && typeof entry.record?.status === 'number') {
              recordMap.set(entry.key, { status: entry.record.status, rating: entry.record.rating || 0 })
            }
          }
          later(() => decorateRecommendations(recordMap), 500)
        },
      )
    }

    function watchRecommendations() {
      const target = document.querySelector('#secondary, #related, ytd-watch-next-secondary-results-renderer, #playlist, ytd-playlist-panel-renderer')
      if (!target) return
      if (recObserver) recObserver.disconnect()
      recObserver = new MutationObserver(() => {
        later(() => loadAndDecorateRecommendations(), 300)
      })
      recObserver.observe(target, { childList: true, subtree: true })
    }

    // ── Detail Mode Init / Cleanup ─────────────────────────
    function ensureButton() {
      if (videoId && !btn) { createButton() }
    }

    function initDetailMode(): void {
      videoId = getVideoId()
      if (!videoId) return
      KEY = storeKey(videoId)
      currentVideoId = videoId
      cleanupTheme = startThemeWatch()
      createButton()
      ensureButton()
      later(() => ensureButton(), 1000)
      later(() => ensureButton(), 3000)

      progressTracker = new VideoProgressTracker(videoId, {
        onThresholdReached: () => {
          if (watchStatus === 2) return
          watchStatus = 2
          watchRating = 4
          applyBtnStyle()
          saveRecord(2, 4)
          progressTracker?.deactivate()
        },
      })
      loadRecord(() => {
        applyBtnStyle()
        syncTrackerStatus()
        later(() => {
          loadAndDecorateRecommendations()
          watchRecommendations()
        }, 3000)
      })
    }

    function stopDetailMode(): void {
      progressTracker?.destroy()
      progressTracker = null
      if (recObserver) { recObserver.disconnect(); recObserver = null }
      if (modal) { modal.remove(); modal = null }
      if (btn) { btn.remove(); btn = null }
      if (cleanupTheme) { cleanupTheme(); cleanupTheme = null }
      videoId = null; KEY = null; currentVideoId = null
      watchStatus = 0; watchRating = 0; watchLoaded = false
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
          if (nv !== videoId) {
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