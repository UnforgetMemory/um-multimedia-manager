/**
 * Token bucket rate limiter for DataScheduler.
 *
 * Uses timestamp math for refill — no persistent timers.
 * Safe for Service Worker lifecycle (MV3).
 */

import type { RateLimitConfig } from './types'
import { DEFAULT_RATE_LIMIT_CONFIG } from './types'

const REFILL_POLL_MS = 100
const ACQUIRE_TIMEOUT_MS = 10_000

export class RateLimiter {
  private _tokens: number
  private _lastRefill: number
  private _config: RateLimitConfig

  constructor(config?: Partial<RateLimitConfig>) {
    this._config = { ...DEFAULT_RATE_LIMIT_CONFIG, ...config }
    this._tokens = this._config.burstSize
    this._lastRefill = Date.now()
  }

  /**
   * Refill tokens based on elapsed time since last refill.
   * Called on every access — no background timer needed.
   */
  private refill(): void {
    const now = Date.now()
    const elapsed = now - this._lastRefill
    if (elapsed <= 0) return

    const tokensToAdd = elapsed * (this._config.maxRequestsPerSecond / 1000)
    this._tokens = Math.min(this._tokens + tokensToAdd, this._config.burstSize)
    this._lastRefill = now
  }

  /**
   * Synchronously try to acquire one token.
   * Returns true if a token was available and consumed.
   */
  tryAcquire(): boolean {
    this.refill()
    if (this._tokens >= 1) {
      this._tokens -= 1
      return true
    }
    return false
  }

  /**
   * Async acquire — resolves when a token is available,
   * or rejects after ACQUIRE_TIMEOUT_MS.
   * Polls at REFILL_POLL_MS intervals (no persistent timer).
   */
  acquire(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const deadline = Date.now() + ACQUIRE_TIMEOUT_MS

      const poll = (): void => {
        if (this.tryAcquire()) {
          resolve()
          return
        }
        if (Date.now() >= deadline) {
          reject(new Error('Rate limit acquire timeout'))
          return
        }
        setTimeout(poll, REFILL_POLL_MS)
      }

      poll()
    })
  }

  /** Snapshot of current rate-limit config. */
  get config(): RateLimitConfig {
    return { ...this._config }
  }

  /** Update rate-limit config at runtime. */
  updateConfig(config: Partial<RateLimitConfig>): void {
    this._config = { ...this._config, ...config }
    this._tokens = Math.min(this._tokens, this._config.burstSize)
  }
}
