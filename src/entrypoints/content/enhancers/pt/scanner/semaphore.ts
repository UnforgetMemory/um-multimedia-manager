/**
 * 信号量 - 控制并发执行数量
 */

export class Semaphore {
  private permits: number
  private queue: Array<() => void> = []

  constructor(permits: number) {
    this.permits = permits
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--
      return
    }
    // 排队等待释放：Promise.withResolvers（ES2024）让 resolve 句柄与 promise
    // 一次取出并存入等待队列，无需在 executor 内向外逃逸 resolve。
    const { promise, resolve } = Promise.withResolvers<void>()
    this.queue.push(resolve)
    return promise
  }

  release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift()!
      next()
    } else {
      this.permits++
    }
  }
}
