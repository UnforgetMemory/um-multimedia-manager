/**
 * Priority-based FIFO queue for DataScheduler.
 *
 * Three internal arrays for HIGH / MEDIUM / LOW priority levels.
 * FIFO within each priority level. Fully synchronous (in-memory).
 * Max queue size is enforced at enqueue time.
 *
 * Dequeue advances a per-bucket head index (O(1)) instead of Array.shift
 * (O(n) per call); the consumed prefix is compacted lazily.
 */

import type { QueuedTask, PriorityLevel } from './types'
import { PRIORITY_ORDER, MAX_QUEUE_SIZE } from './types'

export class PriorityQueue {
  /** One FIFO array per priority level */
  private readonly queues: QueuedTask[][] = [[], [], []]
  /** Next live index per bucket */
  private readonly heads: number[] = [0, 0, 0]

  private liveCount(bucket: number): number {
    return this.queues[bucket].length - this.heads[bucket]
  }

  private compact(bucket: number): void {
    const head = this.heads[bucket]
    if (head >= 64 && head * 2 >= this.queues[bucket].length) {
      this.queues[bucket] = this.queues[bucket].slice(head)
      this.heads[bucket] = 0
    }
  }

  /** Total number of tasks across all priority levels. */
  size(): number {
    return this.liveCount(0) + this.liveCount(1) + this.liveCount(2)
  }

  /** True when there are zero queued tasks. */
  isEmpty(): boolean {
    return this.size() === 0
  }

  /**
   * Enqueue a task at its assigned priority.
   * Returns false if the queue is full.
   */
  enqueue(task: QueuedTask): boolean {
    if (this.size() >= MAX_QUEUE_SIZE) return false
    const bucket = PRIORITY_ORDER[task.priority]
    this.queues[bucket].push(task)
    return true
  }

  /**
   * Dequeue the highest-priority task (FIFO within priority).
   * Returns null when all queues are empty.
   */
  dequeue(): QueuedTask | null {
    for (let i = 0; i < this.queues.length; i++) {
      if (this.liveCount(i) > 0) {
        const task = this.queues[i][this.heads[i]]
        this.heads[i]++
        this.compact(i)
        return task
      }
    }
    return null
  }

  /** Peek at the next task without removing it. */
  peek(): QueuedTask | null {
    for (let i = 0; i < this.queues.length; i++) {
      if (this.liveCount(i) > 0) {
        return this.queues[i][this.heads[i]]
      }
    }
    return null
  }

  /**
   * Remove a queued task by its id from any priority level.
   * Returns true if the task was found and removed.
   */
  remove(id: string): boolean {
    for (let i = 0; i < this.queues.length; i++) {
      for (let j = this.heads[i]; j < this.queues[i].length; j++) {
        if (this.queues[i][j].id === id) {
          this.queues[i].splice(j, 1)
          return true
        }
      }
    }
    return false
  }

  /** Return all queued task ids (for monitoring). */
  ids(): string[] {
    const result: string[] = []
    for (let i = 0; i < this.queues.length; i++) {
      for (let j = this.heads[i]; j < this.queues[i].length; j++) {
        result.push(this.queues[i][j].id)
      }
    }
    return result
  }

  /** Count of tasks at a specific priority level. */
  countByPriority(priority: PriorityLevel): number {
    return this.liveCount(PRIORITY_ORDER[priority])
  }

  /** Remove every queued task. */
  clear(): void {
    this.queues[0] = []
    this.queues[1] = []
    this.queues[2] = []
    this.heads[0] = 0
    this.heads[1] = 0
    this.heads[2] = 0
  }
}
