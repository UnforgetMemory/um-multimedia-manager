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

    const COLORS = ['#9ca3af', '#f97316', '#22c55e', '#3b82f6'] as const
    const LABELS = ['未看', '想看', '已看', '在看'] as const
    const DISPLAY = [0, 1, 3, 2] as const
    let status = 0
    let rating = 0
    let btn: HTMLDivElement | null = null
    let modal: HTMLDivElement | null = null
    let loaded = false
    let isDark = false

    // ── Theme ──────────────────────────────────────────────
    /** Detect current dark/light theme from Bilibili's data-theme attr or system preference. */
    function detectDark(): boolean {
      return document.documentElement.getAttribute('data-theme') === 'dark'
        || window.matchMedia('(prefers-color-scheme: dark)').matches
    }

    /** Theme-dependent color values for card, overlay, borders, and muted elements. */
    interface ThemeVars {
      card: string; fg: string; border: string; overlay: string
      bbg: string; muted: string; mutedFg: string
    }

    function themeVars(dark: boolean): ThemeVars {
      return dark
        ? { card: '#2a2a3e', fg: '#e0e0e0', border: '#3a3a4e', overlay: 'rgba(0,0,0,0.6)', bbg: '#3a3a4e', muted: '#3a3a4e', mutedFg: '#aaa' }
        : { card: '#fff', fg: '#1a1a1a', border: '#e5e7eb', overlay: 'rgba(0,0,0,0.45)', bbg: '#fff', muted: '#f3f4f6', mutedFg: '#666' }
    }

    /** Shorthand for themeVars with current isDark state. */
    function tv(): ThemeVars { return themeVars(isDark) }

    // ── Style Templates ────────────────────────────────────
    /** Join CSS property array into a semicolon-delimited inline style string. */
    function css(parts: string[]): string { return parts.join(';') + ';' }

    /** FAB button: fixed-position floating circle with status color and glow. */
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

    /** Rating badge: absolute-positioned corner badge on FAB showing score when DONE. */
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

    // ── Data ───────────────────────────────────────────────
    function getBvid(): string | null {
      const m = location.pathname.match(/^\/video\/(BV[a-zA-Z0-9]+)\/?$/i)
      return m ? m[1] : null
    }

    function storeKey(bvid: string): string {
      return 'video::' + bvid
    }

    function loadRecord(cb?: () => void) {
      chrome.runtime.sendMessage(
        { type: 'DB_GET', payload: { storeName: STORE, key: KEY } },
        (resp: any) => {
          if (resp?.success && resp.record) {
            status = resp.record.status || 0
            rating = resp.record.rating || 0
          }
          loaded = true
          cb?.()
        },
      )
      setTimeout(() => {
        if (!loaded) { loaded = true; cb?.() }
      }, 2000)
    }

    function saveRecord(st: number, ra: number) {
      chrome.runtime.sendMessage({
        type: 'DB_PUT',
        payload: {
          storeName: STORE, key: KEY,
          record: {
            url: location.href, status: st, rating: ra,
            comment: '', updatedAt: new Date().toISOString(), linkedIds: {},
          },
        },
      })
    }

    // ── Theme Observer ─────────────────────────────────────
    /** Watch Bilibili's theme changes via html[data-theme] attr + system prefers-color-scheme. */
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

      // Update cancel button
      const cancel = card.querySelector('[data-umm-bili-cancel]') as HTMLButtonElement | null
      if (cancel) cancel.style.cssText = sCancelBtn(t)

      // Update rating label
      const rl = card.querySelector('[data-umm-bili-rl]') as HTMLDivElement | null
      if (rl) rl.style.cssText = sRatingLabel(t)

      // Update rating grid buttons
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

      // Title
      const title = document.createElement('div')
      title.setAttribute('data-umm-bili-title', '')
      title.textContent = '\u6807\u8bb0\u72b6\u6001'
      title.style.cssText = sTitle()
      card.appendChild(title)

      // updateUI helper
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

      // Status buttons
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

      // Rating (only for DONE)
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

      // Action buttons
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
      sv.onclick = () => { closeModal(); applyBtnStyle(); saveRecord(status, status === 2 ? rating : 0) }
      ar.appendChild(sv)

      card.appendChild(ar)
      modal.appendChild(card)
      document.body.appendChild(modal)
    }

    // ── SPA Navigation ─────────────────────────────────────
    function cleanup() {
      if (modal) { modal.remove(); modal = null }
      if (btn) { btn.remove(); btn = null }
      status = 0; rating = 0; loaded = false
    }

    function onBvidChange() {
      const nb = getBvid()
      if (nb === BVID) return
      cleanup()
      if (!nb) { BVID = null; KEY = null; return }
      BVID = nb; KEY = storeKey(BVID)
      createButton()
      loadRecord(() => applyBtnStyle())
    }

    /** SPA navigation guard: popstate + pushState/replaceState interception + 3s fallback poll. */
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
      setInterval(onBvidChange, 3000)
    }

    // ── Init ───────────────────────────────────────────────
    const cleanupTheme = startThemeWatch()

    function init() {
      watchUrl()
      createButton()
      loadRecord(() => applyBtnStyle())
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