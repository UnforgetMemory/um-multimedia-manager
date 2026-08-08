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
 *
 * Store keys follow decision-3: 'movie::' + id (the v13 migration normalized
 * legacy 'video::X' keys; content scripts must read/write the canonical form).
 *
 * Status codes: 0=NONE, 1=WISHLIST, 2=DONE, 3=DOING
 * Theme: reacts to the configured site attribute + prefers-color-scheme
 */

import { Store } from '@/features/database'

// ── Shared status constants + pure parsers ────────────────────────────────
// Single source of truth: video-overlay-pure.ts (locked by tests/unit/video-overlay.spec.ts).
// Local aliases keep the ~90% shared internal references (COLORS/LABELS/DISPLAY) intact;
// the re-exports below preserve the original public export surface for site consumers.
import {
  STATUS_COLORS as COLORS,
  STATUS_LABELS as LABELS,
  STATUS_DISPLAY_ORDER as DISPLAY,
  storeKey,
} from './video-overlay-pure'

export {
  STATUS_COLORS as VIDEO_COLORS,
  STATUS_LABELS as VIDEO_LABELS,
  storeKey,
  calcThreshold,
  parseYoutubeVideoId,
  parseYoutubeSearchId,
  parseBilibiliBvid,
  parseBilibiliBvidFromHref,
} from './video-overlay-pure'

// ── Split modules (P2: video-overlay.ts was 861L) ─────────────────────────
// Style builders + theme vars live in video-overlay-styles.ts;
// the video progress tracker lives in video-progress-tracker.ts.
import { ThemeVars, sActionRow, sBadge, sBtnFloat, sCancelBtn, sCard, sOverlay, sRatingBtn, sRatingGrid, sRatingLabel, sRatingSection, sSaveBtn, sSectionRow, sStatusBtn, sTitle } from './video-overlay-styles';
import { VideoProgressTracker } from './video-progress-tracker'

// ════════════════════════════════════════════════════════════════════════
// Site configuration
// ════════════════════════════════════════════════════════════════════════

export interface VideoOverlaySiteConfig {
  /** IndexedDB record store name (STORE_NAMES.BILIBILI / STORE_NAMES.YOUTUBE). */
  storeName: string
  /** Attribute prefix for FAB/modal elements: 'umm-bili' | 'umm-yt'. */
  attrPrefix: string
  /** Font stack for the FAB / overlay / recommendation badges. */
  fontFamily: string
  theme: {
    /** Attribute observed for theme switches ('data-theme' | 'dark'). */
    attr: string
    /** Site-specific dark-mode check (prefers-color-scheme handled internally). */
    darkCheck: () => boolean
    vars: { dark: ThemeVars; light: ThemeVars }
  }
  player: {
    /** Container(s) holding the <video> — observer target / container wait. */
    playerSelector: string
    /** Selector for an already-mounted <video> at scan start. */
    initialVideoSelector: string
    /** Selector(s) polled while waiting for the <video> to appear. */
    pollVideoSelector: string
    /** bilibili waits for the player container before observing; youtube does not. */
    requirePlayerTarget: boolean
    /** Poll cadence in ms (bilibili 1000, youtube 2000). */
    pollInterval: number
    /** Stop polling after this many misses (bilibili 30; youtube never stops). */
    pollStopAfter?: number
    /** Ancestor selector(s) of <video> to ignore (bilibili inline recommends). */
    skipClosest?: string
  }
  /** Detail-mode dimmer CSS, injected once into <head>. */
  dimmerCss: string
  dimmerStyleId: string
  recommendation: {
    cardSelector: string
    linkSelector: string
    idFromLink: (link: HTMLAnchorElement) => string | null
    dimmedAttr: string
    thumbSelector: string
    containerSelectors: string[]
  }
}

export interface VideoOverlay {
  readonly id: string | null
  readonly key: string | null
  readonly status: number
  readonly rating: number
  /** Set the current media id (null clears). Creates/destroys the tracker. */
  setCurrent(id: string | null): void
  /** Create the FAB if not present (no-op without an id). */
  create(): void
  /** Re-create the FAB if it went missing (SPA re-render). */
  ensureButton(): void
  /** Repaint the FAB for the current status/rating/theme. */
  applyBtnStyle(): void
  showModal(): void
  closeModal(): void
  /** Resolves once the record is fetched (or a 2s fallback), status/rating applied. Late DB responses repaint the FAB (no-op for callers already painting with real data). */
  loadRecord(): Promise<void>
  /** Persist status/rating under the canonical 'movie::' key. */
  saveRecord(status: number, rating: number): void
  /** Mark as watched (status=2) with the given rating and stop tracking. */
  markWatched(rating: number): void
  syncTrackerStatus(): void
  /** After 3s: load all records + watch recommendation containers. */
  startRecommendationWatch(): void
  refreshRecommendations(): Promise<void>
  watchRecommendations(): void
  /** Tear down UI/tracker (keeps the theme watch; used on SPA navigation). */
  cleanup(): void
  /** cleanup() + stop theme watch (final teardown). */
  destroy(): void
}

// ════════════════════════════════════════════════════════════════════════
// Overlay implementation
// ════════════════════════════════════════════════════════════════════════

class VideoOverlayImpl implements VideoOverlay {
  private config: VideoOverlaySiteConfig

  id: string | null = null
  key: string | null = null
  private currentId: string | null = null
  private statusValue = 0
  private ratingValue = 0
  private btn: HTMLDivElement | null = null
  private modal: HTMLDivElement | null = null
  private isDark = false
  private tracker: VideoProgressTracker | null = null
  private recObserver: MutationObserver | null = null
  private stopTheme: (() => void) | null = null

  get status(): number { return this.statusValue }
  get rating(): number { return this.ratingValue }

  constructor(config: VideoOverlaySiteConfig) {
    this.config = config
    this.injectStyles()
    this.startThemeWatch()
  }

  // ── Styles / theme ─────────────────────────────────────────

  private injectStyles(): void {
    if (document.getElementById(this.config.dimmerStyleId)) return
    const s = document.createElement('style')
    s.id = this.config.dimmerStyleId
    s.textContent = this.config.dimmerCss
    document.head.appendChild(s)
  }

  private detectDark(): boolean {
    return this.config.theme.darkCheck()
      || window.matchMedia('(prefers-color-scheme: dark)').matches
  }

  private tv(): ThemeVars {
    return this.config.theme.vars[this.isDark ? 'dark' : 'light']
  }

  private startThemeWatch(): void {
    this.isDark = this.detectDark()

    const onThemeChange = () => {
      const newDark = this.detectDark()
      if (newDark === this.isDark) return
      this.isDark = newDark
      this.applyBtnStyle()
      if (this.modal) this.applyModalTheme()
    }

    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'attributes' && m.attributeName === this.config.theme.attr) {
          onThemeChange(); break
        }
      }
    })
    obs.observe(document.documentElement, { attributes: true, attributeFilter: [this.config.theme.attr] })

    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', onThemeChange)

    this.stopTheme = () => {
      obs.disconnect()
      mq.removeEventListener('change', onThemeChange)
    }
  }

  // ── Data ───────────────────────────────────────────────────

  setCurrent(id: string | null): void {
    this.id = id
    this.key = id ? storeKey(id) : null
    this.currentId = id
    if (this.tracker) { this.tracker.destroy(); this.tracker = null }
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
      })
    }
  }

  loadRecord(): Promise<void> {
    return new Promise((resolve) => {
      let settled = false
      const done = () => { if (!settled) { settled = true; resolve() } }
      if (!this.key) { done(); return }
      Store.dbGet(this.config.storeName, this.key)
        .then((record) => {
          if (record) {
            this.statusValue = record.status || 0
            this.ratingValue = record.rating || 0
          }
          if (settled) {
            // The 2s fallback already resolved the promise, so the caller
            // painted the default (status=0) state. Repaint with the real
            // record — otherwise the badge stays 未看 until SPA navigation.
            // No-op when the button was torn down (SPA nav), and the fast
            // path never reaches here because settled is still false.
            this.applyBtnStyle()
            this.syncTrackerStatus()
          }
          done()
        })
        .catch((err) => {
          console.warn('[UMM Video] DB_GET failed:', err)
          done()
        })
      // 2s fallback — proceed with default state if the SW is slow/unreachable
      setTimeout(done, 2000)
    })
  }

  saveRecord(status: number, rating: number): void {
    if (!this.key) return
    Store.dbPut(this.config.storeName, this.key, {
      url: location.href, status, rating,
      comment: '', updatedAt: new Date().toISOString(), linkedIds: {},
    }).catch((err) => {
      console.warn('[UMM Video] DB_PUT failed:', err)
    })
  }

  markWatched(rating: number): void {
    if (this.statusValue === 2) return
    this.statusValue = 2
    this.ratingValue = rating
    this.applyBtnStyle()
    this.saveRecord(2, rating)
    this.tracker?.deactivate()
  }

  syncTrackerStatus(): void {
    if (!this.tracker) return
    if (this.statusValue === 2) this.tracker.deactivate()
    else this.tracker.activate()
  }

  // ── FAB button ─────────────────────────────────────────────

  create(): void {
    if (this.btn || !this.id) return
    this.btn = document.createElement('div')
    this.btn.setAttribute(`data-${this.config.attrPrefix}-float`, '')
    this.btn.addEventListener('mouseenter', () => { if (this.btn) this.btn.style.transform = 'translateY(-50%) scale(1.08)' })
    this.btn.addEventListener('mouseleave', () => { if (this.btn) this.btn.style.transform = 'translateY(-50%) scale(1)' })
    this.btn.addEventListener('click', () => this.showModal())
    this.applyBtnStyle()
    document.body.appendChild(this.btn)
  }

  ensureButton(): void {
    if (this.btn && !document.body.contains(this.btn)) {
      this.btn.remove()
      this.btn = null
      this.create()
    } else if (this.id && !this.btn) {
      this.create()
    }
  }

  applyBtnStyle(): void {
    if (!this.btn) return
    const t = this.tv()
    this.btn.style.cssText = sBtnFloat(t, this.statusValue, this.config.fontFamily)
    this.btn.textContent = LABELS[this.statusValue].slice(0, 2)
    const existingBadge = this.btn.querySelector(`[data-${this.config.attrPrefix}-rating]`)
    if (existingBadge) existingBadge.remove()
    if (this.statusValue === 2 && this.ratingValue > 0) {
      const badge = document.createElement('div')
      badge.setAttribute(`data-${this.config.attrPrefix}-rating`, '')
      badge.textContent = String(this.ratingValue)
      badge.style.cssText = sBadge(t, this.statusValue, this.isDark)
      this.btn.appendChild(badge)
    }
  }

  // ── Modal ──────────────────────────────────────────────────

  closeModal(): void {
    if (this.modal) { this.modal.remove(); this.modal = null }
  }

  private applyModalTheme(): void {
    if (!this.modal) return
    const t = this.tv()
    const card = this.modal.firstChild as HTMLElement | null
    if (!card) return
    this.modal.style.background = t.overlay
    card.style.background = t.card
    card.style.color = t.fg

    const cancel = card.querySelector(`[data-${this.config.attrPrefix}-cancel]`) as HTMLButtonElement | null
    if (cancel) cancel.style.cssText = sCancelBtn(t)

    const rl = card.querySelector(`[data-${this.config.attrPrefix}-rl]`) as HTMLDivElement | null
    if (rl) rl.style.cssText = sRatingLabel(t)

    const ratingBtns = card.querySelectorAll(`[data-${this.config.attrPrefix}-rb]`) as NodeListOf<HTMLButtonElement>
    ratingBtns.forEach((rb) => {
      const v = parseInt(rb.textContent!, 10)
      rb.style.cssText = sRatingBtn(t, v, this.ratingValue)
    })
  }

  showModal(): void {
    if (this.modal) return
    const t = this.tv()
    this.modal = document.createElement('div')
    this.modal.setAttribute(`data-${this.config.attrPrefix}-modal`, '')
    this.modal.style.cssText = sOverlay(t, this.config.fontFamily)

    const card = document.createElement('div')
    card.style.cssText = sCard(t)

    const title = document.createElement('div')
    title.setAttribute(`data-${this.config.attrPrefix}-title`, '')
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
        b.style.cssText = sStatusBtn(idx, this.statusValue)
      })
      sv.style.cssText = sSaveBtn(this.statusValue)
      rr.style.cssText = sRatingSection(this.statusValue === 2)
    }

    const sr = document.createElement('div')
    sr.setAttribute(`data-${this.config.attrPrefix}-sr`, '')
    sr.style.cssText = sSectionRow()
    sbtns = []
    DISPLAY.forEach((idx) => {
      const b = document.createElement('button')
      b.setAttribute(`data-${this.config.attrPrefix}-sb`, '')
      b.textContent = LABELS[idx]
      b.style.cssText = sStatusBtn(idx, this.statusValue)
      b.addEventListener('mouseenter', () => { if (this.statusValue !== idx) b.style.opacity = '1' })
      b.addEventListener('mouseleave', () => { if (this.statusValue !== idx) b.style.opacity = '0.85' })
      b.onclick = () => { this.statusValue = idx; updateUI() }
      sbtns.push(b)
      sr.appendChild(b)
    })
    card.appendChild(sr)

    rr = document.createElement('div')
    rr.setAttribute(`data-${this.config.attrPrefix}-rr`, '')
    rr.style.cssText = sRatingSection(this.statusValue === 2)
    const rl = document.createElement('div')
    rl.setAttribute(`data-${this.config.attrPrefix}-rl`, '')
    rl.textContent = '\u8bc4\u5206'
    rl.style.cssText = sRatingLabel(t)
    rr.appendChild(rl)

    const rGrid = document.createElement('div')
    rGrid.setAttribute(`data-${this.config.attrPrefix}-rg`, '')
    rGrid.style.cssText = sRatingGrid()
    for (let ri = 0; ri <= 10; ri++) {
      const rb = document.createElement('button')
      rb.setAttribute(`data-${this.config.attrPrefix}-rb`, '')
      rb.textContent = String(ri)
      rb.style.cssText = sRatingBtn(t, ri, this.ratingValue)
      rb.addEventListener('mouseenter', () => { if (ri !== this.ratingValue) rb.style.opacity = '1' })
      rb.addEventListener('mouseleave', () => { if (ri !== this.ratingValue) rb.style.opacity = '0.85' })
      rb.onclick = ((v: number) => () => {
        this.ratingValue = v
        const all = rGrid.querySelectorAll(`[data-${this.config.attrPrefix}-rb]`) as NodeListOf<HTMLButtonElement>
        all.forEach((b) => {
          const bv = parseInt(b.textContent!, 10)
          b.style.cssText = sRatingBtn(t, bv, this.ratingValue)
        })
      })(ri)
      rGrid.appendChild(rb)
    }
    rr.appendChild(rGrid)
    card.appendChild(rr)

    const ar = document.createElement('div')
    ar.setAttribute(`data-${this.config.attrPrefix}-ar`, '')
    ar.style.cssText = sActionRow()

    const cb = document.createElement('button')
    cb.setAttribute(`data-${this.config.attrPrefix}-cancel`, '')
    cb.textContent = '\u53d6\u6d88'
    cb.style.cssText = sCancelBtn(t)
    cb.addEventListener('mouseenter', () => { cb.style.opacity = '0.8' })
    cb.addEventListener('mouseleave', () => { cb.style.opacity = '1' })
    cb.onclick = () => this.closeModal()
    ar.appendChild(cb)

    sv = document.createElement('button')
    sv.setAttribute(`data-${this.config.attrPrefix}-save`, '')
    sv.textContent = '\u4fdd\u5b58'
    sv.style.cssText = sSaveBtn(this.statusValue)
    sv.addEventListener('mouseenter', () => { sv.style.opacity = '0.85' })
    sv.addEventListener('mouseleave', () => { sv.style.opacity = '1' })
    sv.onclick = () => {
      this.closeModal()
      this.applyBtnStyle()
      this.saveRecord(this.statusValue, this.statusValue === 2 ? this.ratingValue : 0)
      this.syncTrackerStatus()
    }
    ar.appendChild(sv)

    card.appendChild(ar)
    this.modal.appendChild(card)
    document.body.appendChild(this.modal)
  }

  // ── Recommendation decoration ─────────────────────────────

  private decorateRecommendations(recordMap: Map<string, { status: number; rating: number }>): void {
    const rec = this.config.recommendation
    const items = document.querySelectorAll<HTMLElement>(rec.cardSelector)
    for (const item of items) {
      const link = item.querySelector<HTMLAnchorElement>(rec.linkSelector)
      if (!link) continue
      const vid = rec.idFromLink(link)
      if (!vid) continue
      const entry = recordMap.get(storeKey(vid))
      const st = entry?.status ?? 0
      const ra = entry?.rating ?? 0

      if (st === 2) {
        item.setAttribute(rec.dimmedAttr, 'true')
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
        'font-family:' + this.config.fontFamily + ';line-height:1.6;cursor:default'
      const thumb = item.querySelector<HTMLElement>(rec.thumbSelector)
      if (thumb) {
        thumb.style.position = 'relative'
        thumb.appendChild(badge)
      }
    }
  }

  refreshRecommendations(): Promise<void> {
    if (!this.id) return Promise.resolve()
    // Read only the visible recommendation cards' store keys instead of
    // materializing the whole store. Empty key set (no cards yet) falls back
    // to the full-store scan so badges never silently disappear.
    const rec = this.config.recommendation
    const keys = [...document.querySelectorAll<HTMLElement>(rec.cardSelector)]
      .map((item) => {
        const link = item.querySelector<HTMLAnchorElement>(rec.linkSelector)
        if (!link) return null
        const vid = rec.idFromLink(link)
        return vid ? storeKey(vid) : null
      })
      .filter((key): key is string => key !== null)
    const request = keys.length > 0
      ? Store.dbGetBulk(this.config.storeName, keys)
      : Store.dbGetAll(this.config.storeName)
    return request
      .then((entries) => {
        const recordMap = new Map<string, { status: number; rating: number }>()
        for (const entry of entries) {
          if (entry?.key && typeof entry.record?.status === 'number') {
            recordMap.set(entry.key, { status: entry.record.status, rating: entry.record.rating || 0 })
          }
        }
        setTimeout(() => this.decorateRecommendations(recordMap), 500)
      })
      .catch(() => {
        // background unreachable — skip decoration
      })
  }

  watchRecommendations(): void {
    let target: Element | null = null
    for (const sel of this.config.recommendation.containerSelectors) {
      target = document.querySelector(sel)
      if (target) break
    }
    if (!target) return
    if (this.recObserver) this.recObserver.disconnect()
    this.recObserver = new MutationObserver(() => {
      setTimeout(() => { void this.refreshRecommendations() }, 300)
    })
    this.recObserver.observe(target, { childList: true, subtree: true })
  }

  startRecommendationWatch(): void {
    setTimeout(() => {
      void this.refreshRecommendations()
      this.watchRecommendations()
    }, 3000)
  }

  // ── Teardown ───────────────────────────────────────────────

  cleanup(): void {
    if (this.tracker) { this.tracker.destroy(); this.tracker = null }
    if (this.recObserver) { this.recObserver.disconnect(); this.recObserver = null }
    if (this.modal) { this.modal.remove(); this.modal = null }
    if (this.btn) { this.btn.remove(); this.btn = null }
    this.id = null
    this.key = null
    this.currentId = null
    this.statusValue = 0
    this.ratingValue = 0
  }

  destroy(): void {
    this.cleanup()
    if (this.stopTheme) { this.stopTheme(); this.stopTheme = null }
  }
}

/** Create a site-parameterized video overlay (bilibili / youtube). */
export function createVideoOverlay(siteConfig: VideoOverlaySiteConfig): VideoOverlay {
  return new VideoOverlayImpl(siteConfig)
}
