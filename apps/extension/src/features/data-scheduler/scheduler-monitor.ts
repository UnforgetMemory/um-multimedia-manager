/**
 * Scheduler Monitor — metrics and event tracking for DataScheduler.
 *
 * Maintains a rolling window of response times (capped at 10,000 entries)
 * and exposes P50 / P95 / P99 latency, error / cache-hit rates, and
 * queue depth.  Emits typed SchedulerEvent objects to registered
 * listeners so the consumer can decide how to surface them (console,
 * stats API, etc.).
 */

import type { MonitorMetrics, SchedulerEvent, EventListener } from './types'

const MAX_RESPONSE_TIMES = 10_000

export class SchedulerMonitor {
  private responseTimes: number[] = []
  private totalRequests = 0
  private totalErrors = 0
  private totalCacheHits = 0
  private totalCacheMisses = 0
  private _queueDepth = 0
  private readonly listeners = new Set<EventListener>()

  // ==================== Event Recording ====================

  /** Record a scheduler event. */
  recordEvent(event: SchedulerEvent): void {
    // Notify listeners
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch {
        // Silently swallow listener errors
      }
    }

    switch (event.type) {
      case 'task:completed':
        this.totalRequests++
        if (event.duration !== undefined) {
          this.responseTimes.push(event.duration)
          if (this.responseTimes.length > MAX_RESPONSE_TIMES) {
            this.responseTimes.shift()
          }
        }
        break
      case 'task:failed':
      case 'task:timeout':
        this.totalRequests++
        this.totalErrors++
        break
      case 'cache:hit':
        this.totalCacheHits++
        break
      case 'cache:miss':
        this.totalCacheMisses++
        break
      // task:retrying and rate:limited are informational-only (not counted)
    }
  }

  // ==================== Listeners ====================

  /** Register a listener. Returns an unsubscribe function. */
  onEvent(listener: EventListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  // ==================== Metrics ====================

  /** Compute a percentile value from sorted response times. */
  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0
    const index = Math.ceil((p / 100) * sorted.length) - 1
    return sorted[Math.max(0, index)]
  }

  /** Get a snapshot of current metrics. */
  getMetrics(): MonitorMetrics {
    const sorted = [...this.responseTimes].sort((a, b) => a - b)
    const totalCacheOps = this.totalCacheHits + this.totalCacheMisses

    return {
      responseTime: {
        p50: this.percentile(sorted, 50),
        p95: this.percentile(sorted, 95),
        p99: this.percentile(sorted, 99),
      },
      errorRate: this.totalRequests > 0
        ? this.totalErrors / this.totalRequests
        : 0,
      cacheHitRate: totalCacheOps > 0
        ? this.totalCacheHits / totalCacheOps
        : 0,
      queueDepth: this._queueDepth,
      totalRequests: this.totalRequests,
      totalErrors: this.totalErrors,
      totalCacheHits: this.totalCacheHits,
      totalCacheMisses: this.totalCacheMisses,
    }
  }

  /** Allow the scheduler to report the current queue depth. */
  setQueueDepth(depth: number): void {
    this._queueDepth = depth
  }

  /** Reset all accumulated metrics and the response-time window. */
  clear(): void {
    this.responseTimes = []
    this.totalRequests = 0
    this.totalErrors = 0
    this.totalCacheHits = 0
    this.totalCacheMisses = 0
    this._queueDepth = 0
  }
}
