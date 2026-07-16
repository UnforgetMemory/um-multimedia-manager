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
  onStateChange?: (state: { queued: number; active: number; currentKey: string | null; total: number }) => void
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
  private totalCount = 0
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
      this.totalCount++
      this.processQueue()
    })
  }

  /**
   * 处理队列（支持真正的并发）
   */
  private processQueue(): void {
    // 当活跃任务数小于最大并发数，且队列中有任务时
    while (this.activeCount < this.options.maxConcurrent && this.queue.length > 0) {
      const item = this.queue.shift()
      if (!item) break

      this.activeCount++
      this.notifyStateChange(item.key)

      // 异步执行任务（不阻塞循环）
      this.executeTask(item)
    }
  }

  /**
   * 执行单个任务
   */
  private async executeTask(item: QueueItem): Promise<void> {
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
      this.processQueue()
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
        total: this.totalCount,
      })
    }
  }

  /**
   * 获取当前队列状态
   */
  getState(): { queued: number; active: number; total: number } {
    return {
      queued: this.queue.length,
      active: this.activeCount,
      total: this.totalCount,
    }
  }

  /**
   * 检查队列是否空闲（无排队、无活跃任务）
   */
  isIdle(): boolean {
    return this.queue.length === 0 && this.activeCount === 0
  }

  /**
   * 重置 totalCount（在队列完成后调用，为下一批任务做准备）
   */
  resetTotal(): void {
    this.totalCount = 0
  }
}
