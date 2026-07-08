/**
 * Priority-based FIFO queue for DataScheduler.
 *
 * Three internal arrays for HIGH / MEDIUM / LOW priority levels.
 * FIFO within each priority level.  Fully synchronous (in-memory).
 * Max queue size is enforced at enqueue time.
 */

import type { QueuedTask, PriorityLevel } from './types'
import { PRIORITY_ORDER, MAX_QUEUE_SIZE } from './types'

export class PriorityQueue {
  /** One FIFO array per priority level */
  private readonly queues: QueuedTask[][] = [[], [], []]

  /** Total number of tasks across all priority levels. */
  size(): number {
    return this.queues[0].length + this.queues[1].length + this.queues[2].length
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
      if (this.queues[i].length > 0) {
        return this.queues[i].shift() ?? null
      }
    }
    return null
  }

  /** Peek at the next task without removing it. */
  peek(): QueuedTask | null {
    for (let i = 0; i < this.queues.length; i++) {
      if (this.queues[i].length > 0) {
        return this.queues[i][0]
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
      const idx = this.queues[i].findIndex((t) => t.id === id)
      if (idx !== -1) {
        this.queues[i].splice(idx, 1)
        return true
      }
    }
    return false
  }

  /** Return all queued task ids (for monitoring). */
  ids(): string[] {
    const result: string[] = []
    for (let i = 0; i < this.queues.length; i++) {
      for (const task of this.queues[i]) {
        result.push(task.id)
      }
    }
    return result
  }

  /** Count of tasks at a specific priority level. */
  countByPriority(priority: PriorityLevel): number {
    return this.queues[PRIORITY_ORDER[priority]].length
  }

  /** Remove every queued task. */
  clear(): void {
    this.queues[0] = []
    this.queues[1] = []
    this.queues[2] = []
  }
}
