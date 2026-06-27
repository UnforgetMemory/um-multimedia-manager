/**
 * DataScheduler — central orchestrator for the data-scheduler module.
 *
 * Composes PriorityQueue, RateLimiter, RetryPolicy, and
 * SchedulerMonitor into a single async scheduling pipeline.
 *
 * Lifecycle:
 *   schedule() → cache check → rate-limit → enqueue → process loop →
 *     dequeue → [retry loop] → resolve / reject → monitor event
 *
 * The scheduler is re-created on every Service Worker wake (MV3) so
 * in-memory state (queue, cache, metrics) is ephemeral — acceptable
 * because IndexedDB is the durable store and callers naturally
 * re-issue requests on wake.
 */

import type { ScheduleOptions, QueuedTask, SchedulerEvent } from './types'
import { DEFAULT_PRIORITY, DEFAULT_TASK_TIMEOUT, CACHE_TTL } from './types'
import { PriorityQueue } from './priority-queue'
import { RateLimiter } from './rate-limiter'
import { RetryPolicy } from './retry-policy'
import { SchedulerMonitor } from './scheduler-monitor'
import { CacheManager } from '@/features/cache/cache-manager'

export class DataScheduler {
  readonly queue = new PriorityQueue()
  readonly rateLimiter = new RateLimiter()
  readonly retryPolicy = new RetryPolicy()
  readonly monitor = new SchedulerMonitor()

  private processing = false
  private taskCounter = 0

  constructor(readonly cacheManager?: CacheManager) {}

  // ==================== Public API ====================

  /**
   * Schedule an operation for execution.
   *
   * Returns a Promise that resolves with the operation's result (or
   * rejects if all retries are exhausted or the task times out).
   */
  async schedule<T>(
    operation: () => Promise<T>,
    options?: ScheduleOptions,
  ): Promise<T> {
    const priority = options?.priority ?? DEFAULT_PRIORITY
    const timeout = options?.timeout ?? DEFAULT_TASK_TIMEOUT
    const cacheKey = options?.cacheKey
    const taskId = `task_${++this.taskCounter}_${Date.now()}`

    // Cache check (before enqueuing)
    if (cacheKey && !options?.invalidateCache) {
      const cached = await this.peekCache<T>(cacheKey)
      if (cached !== undefined) {
        this.monitor.recordEvent({
          type: 'cache:hit',
          taskId,
          storeName: options?.storeName,
          key: cacheKey,
          timestamp: Date.now(),
        })
        return cached
      }
      this.monitor.recordEvent({
        type: 'cache:miss',
        taskId,
        storeName: options?.storeName,
        key: cacheKey,
        timestamp: Date.now(),
      })
    }

    // Invalidation before execution
    if (options?.invalidateCache && cacheKey) {
      this.cacheManager?.invalidate('scheduler', cacheKey)
    }

    // Create the task
    return new Promise<T>((resolve, reject) => {
      const task: QueuedTask<T> = {
        id: taskId,
        priority,
        operation: async () => {
          const result = await this.retryPolicy.execute(operation)
          if (cacheKey && this.cacheManager) {
            this.cacheManager.set('scheduler', cacheKey, result, {
              ttlMs: options?.cacheTTL ?? CACHE_TTL,
            })
          }
          return result
        },
        timeout,
        createdAt: Date.now(),
        enqueuedAt: Date.now(),
        attempts: 0,
        resolve: resolve as (value: unknown) => void,
        reject,
      }

      if (!this.queue.enqueue(task as QueuedTask)) {
        reject(new Error(`Queue full (max ${this.queue.size()})`))
        return
      }

      this.monitor.setQueueDepth(this.queue.size())
      this.scheduleProcessLoop()
    })
  }

  /** Start the processing loop (called automatically on first schedule). */
  start(): void {
    this.scheduleProcessLoop()
  }

  /** Discard all queued tasks and cached data. Metrics survive unless cleared. */
  clear(): void {
    this.queue.clear()
    this.cacheManager?.invalidate('scheduler')
  }

  /** Register a monitor event listener (delegates to SchedulerMonitor). */
  onEvent(listener: (event: SchedulerEvent) => void): () => void {
    return this.monitor.onEvent(listener)
  }

  // ==================== Internal ====================

  private scheduleProcessLoop(): void {
    if (this.processing) return
    this.processing = true

    // Use microtask / macrotask scheduling to avoid stack buildup
    Promise.resolve().then(() => this.processLoop())
  }

  private async processLoop(): Promise<void> {
    try {
      while (!this.queue.isEmpty()) {
        // Rate-limit check — blocks until a token is available
        try {
          await this.rateLimiter.acquire()
        } catch {
          // Rate-limit timeout — skip this tick, retry later
          break
        }

        const task = this.queue.dequeue() as QueuedTask | null
        if (!task) continue

        await this.executeTask(task)
        this.monitor.setQueueDepth(this.queue.size())
      }
    } finally {
      this.processing = false
    }
  }

  private async executeTask(task: QueuedTask): Promise<void> {
    const startTime = Date.now()

    try {
      // Apply per-task timeout
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Task ${task.id} timed out after ${task.timeout}ms`)), task.timeout),
      )

      const result = await Promise.race([task.operation(), timeoutPromise])

      this.monitor.recordEvent({
        type: 'task:completed',
        taskId: task.id,
        duration: Date.now() - startTime,
        timestamp: Date.now(),
      })

      task.resolve(result)
    } catch (error) {
      this.monitor.recordEvent({
        type: 'task:failed',
        taskId: task.id,
        error,
        timestamp: Date.now(),
      })
      task.reject(error)
    }
  }

  private async peekCache<T>(key: string): Promise<T | undefined> {
    if (!this.cacheManager) return undefined
    return this.cacheManager.get<T>('scheduler', key)
  }
}
