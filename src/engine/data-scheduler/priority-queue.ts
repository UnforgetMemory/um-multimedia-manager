/**
 * Priority-based FIFO queue for DataScheduler.
 *
 * Three buckets for HIGH / MEDIUM / LOW priority levels.
 * FIFO within each priority level. Fully synchronous (in-memory).
 * Max queue size is enforced at enqueue time.
 *
 * Dequeue advances a per-bucket head index (O(1)) instead of Array.shift
 * (O(n) per call); the consumed prefix is compacted lazily.
 */

import type { QueuedTask, PriorityLevel } from './types';
import { MAX_QUEUE_SIZE } from './types';

/** Buckets keyed by priority level; array order = dequeue preference order. */
const PRIORITY_LEVELS: readonly PriorityLevel[] = ['HIGH', 'MEDIUM', 'LOW'];

interface Bucket {
  /** FIFO task array (with a lazily-compacted consumed prefix) */
  tasks: QueuedTask[];
  /** Next live index into `tasks` */
  head: number;
}

export class PriorityQueue {
  private readonly buckets: Record<PriorityLevel, Bucket> = {
    HIGH: { tasks: [], head: 0 },
    MEDIUM: { tasks: [], head: 0 },
    LOW: { tasks: [], head: 0 },
  };

  private liveCount(bucket: Bucket): number {
    return bucket.tasks.length - bucket.head;
  }

  private compact(bucket: Bucket): void {
    if (bucket.head >= 64 && bucket.head * 2 >= bucket.tasks.length) {
      bucket.tasks = bucket.tasks.slice(bucket.head);
      bucket.head = 0;
    }
  }

  /** Total number of tasks across all priority levels. */
  size(): number {
    let total = 0;
    for (const level of PRIORITY_LEVELS) {
      total += this.liveCount(this.buckets[level]);
    }
    return total;
  }

  /** True when there are zero queued tasks. */
  isEmpty(): boolean {
    return this.size() === 0;
  }

  /**
   * Enqueue a task at its assigned priority.
   * Returns false if the queue is full.
   */
  enqueue(task: QueuedTask): boolean {
    if (this.size() >= MAX_QUEUE_SIZE) return false;
    this.buckets[task.priority].tasks.push(task);
    return true;
  }

  /**
   * Dequeue the highest-priority task (FIFO within priority).
   * Returns null when all queues are empty.
   */
  dequeue(): QueuedTask | null {
    for (const level of PRIORITY_LEVELS) {
      const bucket = this.buckets[level];
      if (this.liveCount(bucket) > 0) {
        // liveCount > 0 ⇒ head < tasks.length: the element always exists;
        // the ?? null branch is only a type-level guard for that impossible case.
        const task = bucket.tasks[bucket.head] ?? null;
        bucket.head++;
        this.compact(bucket);
        return task;
      }
    }
    return null;
  }

  /** Peek at the next task without removing it. */
  peek(): QueuedTask | null {
    for (const level of PRIORITY_LEVELS) {
      const bucket = this.buckets[level];
      if (this.liveCount(bucket) > 0) {
        // Same invariant as dequeue(): liveCount > 0 guarantees the element exists.
        return bucket.tasks[bucket.head] ?? null;
      }
    }
    return null;
  }

  /**
   * Remove a queued task by its id from any priority level.
   * Returns true if the task was found and removed.
   */
  remove(id: string): boolean {
    for (const level of PRIORITY_LEVELS) {
      const bucket = this.buckets[level];
      for (let j = bucket.head; j < bucket.tasks.length; j++) {
        // j < tasks.length guarantees the element exists; ?. is only a
        // type-level accommodation for noUncheckedIndexedAccess.
        if (bucket.tasks[j]?.id === id) {
          bucket.tasks.splice(j, 1);
          return true;
        }
      }
    }
    return false;
  }

  /** Return all queued task ids (for monitoring). */
  ids(): string[] {
    const result: string[] = [];
    for (const level of PRIORITY_LEVELS) {
      const bucket = this.buckets[level];
      for (let j = bucket.head; j < bucket.tasks.length; j++) {
        const task = bucket.tasks[j];
        if (task) result.push(task.id);
      }
    }
    return result;
  }

  /** Count of tasks at a specific priority level. */
  countByPriority(priority: PriorityLevel): number {
    return this.liveCount(this.buckets[priority]);
  }

  /** Remove every queued task. */
  clear(): void {
    for (const level of PRIORITY_LEVELS) {
      const bucket = this.buckets[level];
      bucket.tasks = [];
      bucket.head = 0;
    }
  }
}
