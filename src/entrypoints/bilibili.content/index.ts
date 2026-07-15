/**
 * Bilibili floating button + modal — WXT content script
 *
 * Injects a floating action button on Bilibili video detail pages.
 * Handles SPA navigation via pushState interception + interval poll.
 * Communicates with background via chrome.runtime.sendMessage for DB ops.
 *
 * Status codes: 0=NONE, 1=WISHLIST, 2=DONE, 3=DOING
 * Theme: reacts to html[data-theme] + prefers-color-scheme changes
 */

import { defineContentScript } from 'wxt/utils/define-content-script'

export default defineContentScript({
  matches: ['*://www.bilibili.com/video/*'],
  runAt: 'document_idle',

  main() {
    // ── State ──────────────────────────────────────────────
    let BVID: string | null = null
    let KEY: string | null = null
    const STORE = 'bilibili_records'

    /** BVID guard for tracker timeupdate closure */
    let currentBVID: string | null = null

    const COLORS = ['#9ca3af', '#f97316', '#22c55e', '#3b82f6'] as const
    const LABELS = ['未看', '想看', '已看', '在看'] as const
    const DISPLAY = [0, 1, 3, 2] as const
    let status = 0
    let rating = 0
    let btn: HTMLDivElement | null = null
    let modal: HTMLDivElement | null = null
    let loaded = false
    let isDark = false

    let progressTracker: VideoProgressTracker | null = null

    // ── Progress Tracker ─────────────────────────────────
    interface ProgressTrackerConfig {
      onThresholdReached: () => void
    }

    function calcThreshold(duration: number): number {
      // shorter videos need higher completion % to avoid false-positive
      if (duration <= 0) return 55
      if (duration < 300) return 55    // < 5min
      if (duration < 900) return 60    // 5-15min
      if (duration < 2700) return 65   // 15-45min
      if (duration < 3600) return 70   // 45-60min
      return 70                         // > 60min
    }

    class VideoProgressTracker {
      readonly bvid: string
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

      constructor(bvid: string, config: ProgressTrackerConfig) {
        this.bvid = bvid
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
        const target = document.querySelector('#bilibili-player, #playerWrap')
        if (!target) return
        this.observer = new MutationObserver((mutations) => {
          for (const m of mutations) {
            if (m.type === 'childList') {
              for (const node of m.addedNodes) {
                if (node instanceof HTMLVideoElement) {
                  if (!node.closest('.v-recommend-inline-player')) this.reattachIfNew(node)
                  return
                }
                if (node instanceof Element) {
                  const v = node.querySelector<HTMLVideoElement>('video')
                  if (v && !v.closest('.v-recommend-inline-player')) { this.reattachIfNew(v); return }
                }
              }
            }
          }
        })
        this.observer.observe(target, { childList: true, subtree: true })
      }

      private startScanning(): void {
        if (this.video) { this.attachEvents(this.video); return }

        const existing = document.querySelector<HTMLVideoElement>('#bilibili-player video')
        if (existing) { this.attachEvents(existing); return }

        const target = document.querySelector('#bilibili-player, #playerWrap')
        if (!target) {
          this.pollTimer = setInterval(() => {
            if (document.querySelector('#bilibili-player, #playerWrap')) {
              if (this.pollTimer) clearInterval(this.pollTimer)
              this.startScanning()
            }
          }, 2000)
          return
        }

        this.ensureObserver()

        let count = 0
        this.fallbackTimer = setInterval(() => {
          count++
          const v = document.querySelector<HTMLVideoElement>('#bilibili-player video')
          if (v) {
            if (this.fallbackTimer) clearInterval(this.fallbackTimer)
            this.attachEvents(v)
          } else if (count > 30) {
            if (this.fallbackTimer) clearInterval(this.fallbackTimer)
          }
        }, 1000)
      }

      private attachEvents(video: HTMLVideoElement): void {
        if (this.video === video && this._attachedEvents) return
        if (video.closest('.v-recommend-inline-player, .bpx-docker-minor, .bpx-player-auxiliary')) { return }
        this.detachVideoEvents()
        this.video = video
        this.clearPolling()
        this.ensureObserver()

        this._handleTimeupdate = () => {
          if (!this._active || !this.video || !this.video.duration || this.video.duration === Infinity) return
          if (this.bvid !== currentBVID) return
          const pct = (this.video.currentTime / this.video.duration) * 100
          const threshold = calcThreshold(this.video.duration)
          if (!this.thresholdPassed && pct >= threshold) {
            this.thresholdPassed = true
            this.config.onThresholdReached()
          }
        }

        this._handleEnded = () => {
          if (!this._active || !this.video) return
          if (this.bvid !== currentBVID) return
          if (!this.thresholdPassed) {
            this.thresholdPassed = true
            this.config.onThresholdReached()
          }
        }

        video.addEventListener('timeupdate', this._handleTimeupdate)
        video.addEventListener('ended', this._handleEnded)
        this._attachedEvents = true
      }
    }

    // ── Theme ──────────────────────────────────────────────
    function detectDark(): boolean {
      return document.documentElement.getAttribute('data-theme') === 'dark'
        || window.matchMedia('(prefers-color-scheme: dark)').matches
    }

    interface ThemeVars {
      card: string; fg: string; border: string; overlay: string
      bbg: string; muted: string; mutedFg: string
    }

    function themeVars(dark: boolean): ThemeVars {
      return dark
        ? { card: '#2a2a3e', fg: '#e0e0e0', border: '#3a3a4e', overlay: 'rgba(0,0,0,0.6)', bbg: '#3a3a4e', muted: '#3a3a4e', mutedFg: '#aaa' }
        : { card: '#fff', fg: '#1a1a1a', border: '#e5e7eb', overlay: 'rgba(0,0,0,0.45)', bbg: '#fff', muted: '#f3f4f6', mutedFg: '#666' }
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
        'font-family:"Microsoft YaHei","PingFang SC",-apple-system,sans-serif',
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
        'font-family:"Microsoft YaHei","PingFang SC",-apple-system,sans-serif',
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

    function sSectionRow(): string {
      return 'display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;'
    }

    function sRatingLabel(t: ThemeVars): string {
      return 'font-size:13px;color:' + t.mutedFg + ';margin-bottom:6px;font-weight:600;'
    }

    function sRatingBtn(v: number, cur: number): string {
      const active = v === cur
      return css([
        'width:40px', 'height:32px', 'border:none',
        'border-radius:6px', 'cursor:pointer',
        'font-size:12px', 'font-weight:700', 'font-family:inherit',
        'background:' + (active ? COLORS[2] : (isDark ? '#3a3a4e' : '#f3f4f6')),
        'color:' + (active ? '#fff' : (isDark ? '#ccc' : '#374151')),
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
      if (status === 2) {
        progressTracker.deactivate()
      } else {
        progressTracker.activate()
      }
    }

    // ── Data ───────────────────────────────────────────────
    function getBvid(): string | null {
      const m = location.pathname.match(/^\/video\/(BV[a-zA-Z0-9]+)\/?$/i)
      return m ? m[1] : null
    }

    function storeKey(bvid: string): string {
      return 'video::' + bvid
    }

    function loadRecord(cb?: () => void) {
      let cbCalled = false
      chrome.runtime.sendMessage(
        { type: 'DB_GET', payload: { storeName: STORE, key: KEY } },
        (resp: any) => {
          if (resp?.success && resp.record) {
            status = resp.record.status || 0
            rating = resp.record.rating || 0
          }
          loaded = true
          if (!cbCalled) { cbCalled = true; cb?.() }
        },
      )
      setTimeout(() => {
        if (!loaded) { loaded = true; if (!cbCalled) { cbCalled = true; cb?.() } }
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
          if (chrome.runtime.lastError) {
            console.warn('[UMM Bili] DB_PUT lastError:', chrome.runtime.lastError)
            return
          }
          if (!resp?.success) {
            console.warn('[UMM Bili] DB_PUT failed:', resp?.error || 'no response')
          }
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
          if (m.type === 'attributes' && m.attributeName === 'data-theme') {
            onThemeChange(); break
          }
        }
      })
      obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      mq.addEventListener('change', onThemeChange)

      return () => {
        obs.disconnect()
        mq.removeEventListener('change', onThemeChange)
      }
    }

    // ── FAB Button ─────────────────────────────────────────
    function createButton() {
      if (btn || !BVID) return
      btn = document.createElement('div')
      btn.setAttribute('data-umm-bili-float', '')
      btn.addEventListener('mouseenter', () => { if (btn) btn.style.transform = 'translateY(-50%) scale(1.08)' })
      btn.addEventListener('mouseleave', () => { if (btn) btn.style.transform = 'translateY(-50%) scale(1)' })
      btn.addEventListener('click', showModal)
      applyBtnStyle()
      document.body.appendChild(btn)
    }

    function applyBtnStyle() {
      if (!btn) return
      const t = tv()
      btn.style.cssText = sBtnFloat(t, status)
      btn.textContent = LABELS[status].slice(0, 2)
      const existingBadge = btn.querySelector('[data-umm-bili-rating]')
      if (existingBadge) existingBadge.remove()
      if (status === 2 && rating > 0) {
        const badge = document.createElement('div')
        badge.setAttribute('data-umm-bili-rating', '')
        badge.textContent = String(rating)
        badge.style.cssText = sBadge(t, status)
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

      const cancel = card.querySelector('[data-umm-bili-cancel]') as HTMLButtonElement | null
      if (cancel) cancel.style.cssText = sCancelBtn(t)

      const rl = card.querySelector('[data-umm-bili-rl]') as HTMLDivElement | null
      if (rl) rl.style.cssText = sRatingLabel(t)

      const ratingBtns = card.querySelectorAll('[data-umm-bili-rb]') as NodeListOf<HTMLButtonElement>
      ratingBtns.forEach((rb) => {
        const v = parseInt(rb.textContent!, 10)
        rb.style.cssText = sRatingBtn(v, rating)
      })
    }

    function showModal() {
      if (modal) return
      const t = tv()
      modal = document.createElement('div')
      modal.setAttribute('data-umm-bili-modal', '')
      modal.style.cssText = sOverlay(t)

      const card = document.createElement('div')
      card.style.cssText = sCard(t)

      const title = document.createElement('div')
      title.setAttribute('data-umm-bili-title', '')
      title.textContent = '\u6807\u8bb0\u72b6\u6001'
      title.style.cssText = sTitle()
      card.appendChild(title)

      let sbtns: HTMLButtonElement[] = []
      let sv: HTMLButtonElement | null = null
      let rr: HTMLDivElement | null = null

      const updateUI = () => {
        if (!sbtns.length || !sv || !rr) return
        sbtns.forEach((b, i) => {
          const idx = DISPLAY[i]
          b.style.cssText = sStatusBtn(idx, status)
        })
        sv.style.cssText = sSaveBtn(status)
        rr.style.cssText = sRatingSection(status === 2)
      }

      const sr = document.createElement('div')
      sr.setAttribute('data-umm-bili-sr', '')
      sr.style.cssText = sSectionRow()
      sbtns = []
      DISPLAY.forEach((idx) => {
        const b = document.createElement('button')
        b.setAttribute('data-umm-bili-sb', '')
        b.textContent = LABELS[idx]
        b.style.cssText = sStatusBtn(idx, status)
        b.addEventListener('mouseenter', () => { if (status !== idx) b.style.opacity = '1' })
        b.addEventListener('mouseleave', () => { if (status !== idx) b.style.opacity = '0.85' })
        b.onclick = () => { status = idx; updateUI() }
        sbtns.push(b)
        sr.appendChild(b)
      })
      card.appendChild(sr)

      rr = document.createElement('div')
      rr.setAttribute('data-umm-bili-rr', '')
      rr.style.cssText = sRatingSection(status === 2)
      const rl = document.createElement('div')
      rl.setAttribute('data-umm-bili-rl', '')
      rl.textContent = '\u8bc4\u5206'
      rl.style.cssText = sRatingLabel(t)
      rr.appendChild(rl)

      const rGrid = document.createElement('div')
      rGrid.setAttribute('data-umm-bili-rg', '')
      rGrid.style.cssText = sRatingGrid()
      for (let ri = 0; ri <= 10; ri++) {
        const rb = document.createElement('button')
        rb.setAttribute('data-umm-bili-rb', '')
        rb.textContent = String(ri)
        rb.style.cssText = sRatingBtn(ri, rating)
        rb.addEventListener('mouseenter', () => { if (ri !== rating) rb.style.opacity = '1' })
        rb.addEventListener('mouseleave', () => { if (ri !== rating) rb.style.opacity = '0.85' })
        rb.onclick = ((v: number) => () => {
          rating = v
          const all = rGrid.querySelectorAll('[data-umm-bili-rb]') as NodeListOf<HTMLButtonElement>
          all.forEach((b) => {
            const bv = parseInt(b.textContent!, 10)
            b.style.cssText = sRatingBtn(bv, rating)
          })
        })(ri)
        rGrid.appendChild(rb)
      }
      rr.appendChild(rGrid)
      card.appendChild(rr)

      const ar = document.createElement('div')
      ar.setAttribute('data-umm-bili-ar', '')
      ar.style.cssText = sActionRow()

      const cb = document.createElement('button')
      cb.setAttribute('data-umm-bili-cancel', '')
      cb.textContent = '\u53d6\u6d88'
      cb.style.cssText = sCancelBtn(t)
      cb.addEventListener('mouseenter', () => { cb.style.opacity = '0.8' })
      cb.addEventListener('mouseleave', () => { cb.style.opacity = '1' })
      cb.onclick = () => closeModal()
      ar.appendChild(cb)

      sv = document.createElement('button')
      sv.setAttribute('data-umm-bili-save', '')
      sv.textContent = '\u4fdd\u5b58'
      sv.style.cssText = sSaveBtn(status)
      sv.addEventListener('mouseenter', () => { sv.style.opacity = '0.85' })
      sv.addEventListener('mouseleave', () => { sv.style.opacity = '1' })
      sv.onclick = () => { closeModal(); applyBtnStyle(); saveRecord(status, status === 2 ? rating : 0); syncTrackerStatus() }
      ar.appendChild(sv)

      card.appendChild(ar)
      modal.appendChild(card)
      document.body.appendChild(modal)
    }

    // ── Coin Check Auto-Mark ─────────────────────────────
    function checkCoinForAutoMark() {
      if (status === 2 || !BVID || !KEY) return
      const coinBtn = document.querySelector<HTMLElement>(
        '#arc_toolbar_report > div.video-toolbar-left > div > div:nth-child(2) > div'
      )
      if (!coinBtn?.title) return
      if (coinBtn.title.includes('已用完')) {
        status = 2
        rating = 7
        applyBtnStyle()
        saveRecord(2, 7)
        progressTracker?.deactivate()
      }
    }

    // ── Recommendation Badge Injection ────────────────────
    const RECOMMEND_SEL = '.recommend-list-v1 .video-page-card-small'
    let recObserver: MutationObserver | null = null

    /** 延迟执行，避免干扰 Bilibili Vue 渲染 */
    function later(fn: () => void, ms: number): void {
      setTimeout(fn, ms)
    }

    function decorateRecommendations(recordMap: Map<string, number>) {
      const items = document.querySelectorAll<HTMLElement>(RECOMMEND_SEL)
      for (const item of items) {
        const link = item.querySelector<HTMLAnchorElement>('a[href*="/video/BV"]')
        if (!link) continue
        const m = link.pathname.match(/\/video\/(BV[a-zA-Z0-9]+)/i)
        if (!m) continue
        const bvid = m[1]
        const st = recordMap.get(storeKey(bvid)) ?? 0

        if (st === 2) {
          item.style.opacity = '0.4'
          item.style.pointerEvents = 'none'
        }
        const existing = item.querySelector('[data-umm-rec-badge]')
        if (existing) continue
        const badge = document.createElement('div')
        badge.setAttribute('data-umm-rec-badge', '')
        badge.textContent = LABELS[st].slice(0, 2)
        badge.style.cssText = 'position:absolute;top:4px;left:4px;z-index:10;font-size:10px;font-weight:700;' +
          'background:' + COLORS[st] + ';color:#fff;padding:1px 5px;border-radius:6px;' +
          'font-family:"Microsoft YaHei","PingFang SC",-apple-system,sans-serif;line-height:1.6'
        const picBox = item.querySelector<HTMLElement>('.pic-box')
        if (picBox) {
          picBox.style.position = 'relative'
          picBox.appendChild(badge)
        }
      }
    }

    function loadAndDecorateRecommendations() {
      if (!BVID) return
      chrome.runtime.sendMessage(
        { type: 'DB_GET_ALL', payload: { storeName: STORE } },
        (resp: any) => {
          if (!resp?.success || !Array.isArray(resp.entries)) return
          const recordMap = new Map<string, number>()
          for (const entry of resp.entries) {
            if (entry?.key && typeof entry.record?.status === 'number') {
              recordMap.set(entry.key, entry.record.status)
            }
          }
          later(() => decorateRecommendations(recordMap), 500)
        },
      )
    }

    function watchRecommendations() {
      const target = document.querySelector('.recommend-list-v1')
      if (!target) return
      if (recObserver) recObserver.disconnect()
      recObserver = new MutationObserver(() => {
        later(() => loadAndDecorateRecommendations(), 300)
      })
      recObserver.observe(target, { childList: true, subtree: true })
    }

    // ── SPA Navigation ─────────────────────────────────────
    function cleanup() {
      progressTracker?.destroy()
      progressTracker = null
      if (recObserver) { recObserver.disconnect(); recObserver = null }
      if (modal) { modal.remove(); modal = null }
      if (btn) { btn.remove(); btn = null }
      status = 0; rating = 0; loaded = false
    }

    function onBvidChange() {
      const nb = getBvid()
      if (nb === BVID) return
      cleanup()
      if (!nb) {
        BVID = null; KEY = null; currentBVID = null
        return
      }
      BVID = nb; KEY = storeKey(BVID)
      currentBVID = BVID
      createButton()
      progressTracker = new VideoProgressTracker(BVID, {
        onThresholdReached: () => {
          if (status === 2) return
          status = 2
          rating = 4
          applyBtnStyle()
          saveRecord(2, 4)
          progressTracker?.deactivate()
        },
      })
      loadRecord(() => {
        applyBtnStyle()
        syncTrackerStatus()
        checkCoinForAutoMark()
        later(() => {
          loadAndDecorateRecommendations()
          watchRecommendations()
        }, 3000)
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
        if (BVID && btn && !document.body.contains(btn)) {
          btn.remove()
          btn = null
          createButton()
        }
      }, 3000)
    }

    // ── Init ───────────────────────────────────────────────
    const cleanupTheme = startThemeWatch()

    function init() {
      watchUrl()
      createButton()
      if (BVID) {
        currentBVID = BVID
        progressTracker = new VideoProgressTracker(BVID, {
          onThresholdReached: () => {
            if (status === 2) return
            status = 2
            rating = 4
            applyBtnStyle()
            saveRecord(2, 4)
            progressTracker?.deactivate()
          },
        })
        loadRecord(() => {
          applyBtnStyle()
          syncTrackerStatus()
          checkCoinForAutoMark()
          later(() => {
            loadAndDecorateRecommendations()
            watchRecommendations()
          }, 3000)
        })
      } else {
        loadRecord(() => applyBtnStyle())
      }
    }

    const initialBvid = getBvid()
    if (!initialBvid) {
      cleanupTheme()
      return
    }
    BVID = initialBvid
    KEY = storeKey(BVID)

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init)
    } else {
      init()
    }
  },
})