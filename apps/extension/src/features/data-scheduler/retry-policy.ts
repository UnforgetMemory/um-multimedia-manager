/**
 * Retry Policy — exponential backoff with optional jitter
 *
 * Wraps async operations with configurable retry logic for the
 * DataScheduler orchestrator.
 */

import type { RetryConfig, RetryCallback } from './types'
import { DEFAULT_RETRY_CONFIG } from './types'

/**
 * Calculate exponential backoff delay with optional jitter.
 * delay = min(baseDelay * 2^attempt, maxDelay)
 * When jitter=true, adds ±25% random variation.
 */
export function calculateBackoffDelay(
  attempt: number,
  config: RetryConfig,
): number {
  const base = Math.min(config.baseDelay * 2 ** attempt, config.maxDelay)

  if (!config.jitter) return base

  const jitterRange = base * 0.25
  const offset = (Math.random() - 0.5) * 2 * jitterRange
  return Math.round(base + offset)
}

export class RetryPolicy {
  private readonly config: RetryConfig

  constructor(config?: Partial<RetryConfig>) {
    this.config = { ...DEFAULT_RETRY_CONFIG, ...config }
  }

  /** Calculate delay in ms for the given retry attempt (0-based). */
  calculateDelay(attempt: number): number {
    return calculateBackoffDelay(attempt, this.config)
  }

  /**
   * Execute an async function with retry logic.
   * Calls fn once, then retries up to maxRetries times on failure.
   * If onRetry is provided, it's called before each wait with the
   * attempt number (1-indexed) and the error.
   */
  async execute<T>(
    fn: () => Promise<T>,
    onRetry?: RetryCallback,
  ): Promise<T> {
    let lastError: unknown

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await fn()
      } catch (err) {
        lastError = err

        if (attempt < this.config.maxRetries) {
          onRetry?.(attempt + 1, err)
          const delay = this.calculateDelay(attempt)
          await new Promise((resolve) => setTimeout(resolve, delay))
        }
      }
    }

    throw lastError
  }
}
