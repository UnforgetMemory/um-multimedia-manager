/**
 * 请求队列工具
 * 
 * 功能：
 * - 并发控制（限制同时进行的请求数量）
 * - 最小/最大延迟（随机抖动防封）
 * - FIFO 队列管理
 * - 状态回调
 */

export interface RequestQueueOptions {
  maxConcurrent: number
  minDelayMs: number
  maxDelayMs: number
  onStateChange?: (state: { queued: number; active: number; currentKey: string | null }) => void
}

interface QueueItem {
  key: string
  task: () => Promise<any>
  resolve: (value: any) => void
  reject: (reason: any) => void
}

export class RequestQueue {
  private queue: QueueItem[] = []
  private activeCount = 0
  private options: RequestQueueOptions

  constructor(options: RequestQueueOptions) {
    this.options = options
  }

  /**
   * 将任务加入队列
   */
  async enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({ key, task, resolve, reject })
      this.processQueue()
    })
  }

  /**
   * 处理队列
   */
  private async processQueue(): Promise<void> {
    if (this.activeCount >= this.options.maxConcurrent || this.queue.length === 0) {
      return
    }

    const item = this.queue.shift()
    if (!item) return

    this.activeCount++
    this.notifyStateChange(item.key)

    try {
      // 执行前等待随机延迟
      await this.randomDelay()

      const result = await item.task()
      item.resolve(result)
    } catch (error) {
      item.reject(error)
    } finally {
      this.activeCount--
      this.notifyStateChange(null)
      
      // 继续处理下一个任务
      setTimeout(() => this.processQueue(), 0)
    }
  }

  /**
   * 随机延迟（在 minDelay 和 maxDelay 之间）
   */
  private async randomDelay(): Promise<void> {
    const delay =
      this.options.minDelayMs +
      Math.random() * (this.options.maxDelayMs - this.options.minDelayMs)
    
    return new Promise((resolve) => setTimeout(resolve, delay))
  }

  /**
   * 通知状态变化
   */
  private notifyStateChange(currentKey: string | null): void {
    if (this.options.onStateChange) {
      this.options.onStateChange({
        queued: this.queue.length,
        active: this.activeCount,
        currentKey,
      })
    }
  }

  /**
   * 获取当前队列状态
   */
  getState(): { queued: number; active: number } {
    return {
      queued: this.queue.length,
      active: this.activeCount,
    }
  }
}
