/**
 * Visibility-aware interval utilities
 *
 * Chrome already throttles background-tab timers (~1/min), but explicit
 * visibility gating provides immediate pause (no 1-min delay) and avoids
 * unnecessary work in hidden tabs.
 */

export interface PausableInterval {
  /** Resume the interval when the tab becomes visible again. */
  resume(): void
  /** Pause the interval immediately. Safe to call multiple times. */
  pause(): void
  /** Stop the interval entirely (cannot be resumed). */
  destroy(): void
}

/**
 * Create a setInterval that pauses when the document is hidden.
 * When the tab comes back, it resumes from where it left off (uses the
 * original interval, not a catch-up).
 *
 * @param fn     — callback to run on each tick
 * @param delay  — interval in milliseconds
 * @returns      — control handle with pause/resume/destroy
 */
export function intervalWhenVisible(fn: () => void, delay: number): PausableInterval {
  let paused = document.hidden
  let timer = setInterval(tick, delay)

  function tick(): void {
    if (document.hidden || paused) return
    fn()
  }

  function onVisibilityChange(): void {
    paused = document.hidden
  }

  document.addEventListener('visibilitychange', onVisibilityChange)

  return {
    resume() {
      if (!paused) return
      paused = false
    },
    pause() {
      paused = true
    },
    destroy() {
      clearInterval(timer)
      timer = -1 as unknown as ReturnType<typeof setInterval>
      document.removeEventListener('visibilitychange', onVisibilityChange)
    },
  }
}

/**
 * Pause an existing setInterval when the document is hidden.
 * A lighter alternative to intervalWhenVisible — use when you already
 * have a setInterval handle and just want to gate execution.
 *
 * @returns cleanup function
 */
export function pauseWhenHidden(
  intervalHandle: ReturnType<typeof setInterval>,
): () => void {
  function check() {
    if (document.hidden) {
      clearInterval(intervalHandle)
    }
  }
  document.addEventListener('visibilitychange', check)
  return () => document.removeEventListener('visibilitychange', check)
}
