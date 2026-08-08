/**
 * Video progress tracker (bilibili ↔ youtube, audit §2.1 T18).
 *
 * Split out of video-overlay.ts (was 861L). Watches a site <video> element,
 * polls for it to appear, and fires once the playhead crosses the configured
 * threshold (or the video ends). Stale trackers are guarded by the currentId
 * hook so SPA navigation cannot fire a late threshold.
 */

import { calcThreshold } from './video-overlay-pure'

export interface TrackerDeps {
  playerSelector: string
  initialVideoSelector: string
  pollVideoSelector: string
  requirePlayerTarget: boolean
  pollInterval: number
  /** Stop polling after N consecutive misses; used on sites that never mount a <video>. */
  pollStopAfter?: number
  /** Skip videos inside this container (e.g. preview/related players). */
  skipClosest?: string
  /** Current media id guard — stale trackers must not fire after SPA nav. */
  currentId: () => string | null
  onThresholdReached: () => void
}

export class VideoProgressTracker {
  readonly id: string
  private deps: TrackerDeps
  private video: HTMLVideoElement | null = null
  private observer: MutationObserver | null = null
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private fallbackTimer: ReturnType<typeof setInterval> | null = null
  private thresholdPassed = false
  private _active = false
  private _attachedEvents = false
  private _handleTimeupdate: (() => void) | null = null
  private _handleEnded: (() => void) | null = null

  constructor(id: string, deps: TrackerDeps) {
    this.id = id
    this.deps = deps
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
    const target = document.querySelector(this.deps.playerSelector)
    if (!target) return
    this.observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'childList') {
          for (const node of m.addedNodes) {
            if (node instanceof HTMLVideoElement) {
              if (!this.deps.skipClosest || !node.closest(this.deps.skipClosest)) this.reattachIfNew(node)
              return
            }
            if (node instanceof Element) {
              const v = node.querySelector<HTMLVideoElement>('video')
              if (v && (!this.deps.skipClosest || !v.closest(this.deps.skipClosest))) { this.reattachIfNew(v); return }
            }
          }
        }
      }
    })
    this.observer.observe(target, { childList: true, subtree: true })
  }

  private startScanning(): void {
    if (this.video) { this.attachEvents(this.video); return }

    const existing = document.querySelector<HTMLVideoElement>(this.deps.initialVideoSelector)
    if (existing) { this.attachEvents(existing); return }

    if (this.deps.requirePlayerTarget) {
      const target = document.querySelector(this.deps.playerSelector)
      if (!target) {
        this.pollTimer = setInterval(() => {
          if (document.querySelector(this.deps.playerSelector)) {
            if (this.pollTimer) clearInterval(this.pollTimer)
            this.startScanning()
          }
        }, 2000)
        return
      }
      this.ensureObserver()
    }

    let count = 0
    this.fallbackTimer = setInterval(() => {
      count++
      const v = document.querySelector<HTMLVideoElement>(this.deps.pollVideoSelector)
      if (v) {
        if (this.fallbackTimer) clearInterval(this.fallbackTimer)
        this.attachEvents(v)
      } else if (this.deps.pollStopAfter !== undefined && count > this.deps.pollStopAfter) {
        if (this.fallbackTimer) clearInterval(this.fallbackTimer)
      }
    }, this.deps.pollInterval)
  }

  private attachEvents(video: HTMLVideoElement): void {
    if (this.video === video && this._attachedEvents) return
    if (this.deps.skipClosest && video.closest(this.deps.skipClosest)) { return }
    this.detachVideoEvents()
    this.video = video
    this.clearPolling()
    this.ensureObserver()

    this._handleTimeupdate = () => {
      if (!this._active || !this.video || !this.video.duration || this.video.duration === Infinity) return
      if (this.id !== this.deps.currentId()) return
      const pct = (this.video.currentTime / this.video.duration) * 100
      const threshold = calcThreshold(this.video.duration)
      if (!this.thresholdPassed && pct >= threshold) {
        this.thresholdPassed = true
        this.deps.onThresholdReached()
      }
    }

    this._handleEnded = () => {
      if (!this._active || !this.video) return
      if (this.id !== this.deps.currentId()) return
      if (!this.thresholdPassed) {
        this.thresholdPassed = true
        this.deps.onThresholdReached()
      }
    }

    video.addEventListener('timeupdate', this._handleTimeupdate)
    video.addEventListener('ended', this._handleEnded)
    this._attachedEvents = true
  }
}
