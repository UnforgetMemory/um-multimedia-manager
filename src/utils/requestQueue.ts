/**
 * Request queue: concurrency cap + jittered delay + FIFO.
 */

import { sleep } from '@/utils'

export interface RequestQueueOptions {
  maxConcurrent: number
  minDelayMs: number
  maxDelayMs: number
  onStateChange?: (state: { queued: number; active: number; currentKey: string | null; total: number }) => void
}

interface QueueItem {
  key: string
  /** Completes (or rejects) the caller's promise; never throws. */
  run: () => Promise<void>
}

export class RequestQueue {
  private queue: QueueItem[] = []
  /** Index of the next live item; consumed prefix is compacted lazily. */
  private head = 0
  private activeCount = 0
  private totalCount = 0
  private options: RequestQueueOptions

  constructor(options: RequestQueueOptions) {
    this.options = options
  }

  async enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
    const { promise, resolve, reject } = Promise.withResolvers<T>()
    this.queue.push({
      key,
      run: async () => {
        try {
          await this.randomDelay()
          resolve(await task())
        } catch (error: unknown) {
          reject(error)
        }
      },
    })
    this.totalCount++
    this.processQueue()
    return promise
  }

  private get queuedLength(): number {
    return this.queue.length - this.head
  }

  private takeNext(): QueueItem | null {
    if (this.head >= this.queue.length) return null
    const item = this.queue[this.head]
    this.head++
    if (this.head >= 64 && this.head * 2 >= this.queue.length) {
      this.queue = this.queue.slice(this.head)
      this.head = 0
    }
    return item
  }

  private processQueue(): void {
    while (this.activeCount < this.options.maxConcurrent && this.queuedLength > 0) {
      const item = this.takeNext()
      if (!item) break

      this.activeCount++
      this.notifyStateChange(item.key)
      void this.executeTask(item)
    }
  }

  private async executeTask(item: QueueItem): Promise<void> {
    try {
      await item.run()
    } finally {
      this.activeCount--
      this.notifyStateChange(null)
      this.processQueue()
    }
  }

  private async randomDelay(): Promise<void> {
    const delay =
      this.options.minDelayMs +
      Math.random() * (this.options.maxDelayMs - this.options.minDelayMs)

    return sleep(delay)
  }

  private notifyStateChange(currentKey: string | null): void {
    if (this.options.onStateChange) {
      this.options.onStateChange({
        queued: this.queuedLength,
        active: this.activeCount,
        currentKey,
        total: this.totalCount,
      })
    }
  }

  getState(): { queued: number; active: number; total: number } {
    return {
      queued: this.queuedLength,
      active: this.activeCount,
      total: this.totalCount,
    }
  }

  isIdle(): boolean {
    return this.queuedLength === 0 && this.activeCount === 0
  }

  resetTotal(): void {
    this.totalCount = 0
  }
}
