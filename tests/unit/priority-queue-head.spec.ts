import { test, expect } from '@playwright/test'
import { PriorityQueue } from '@/features/data-scheduler/priority-queue'
import type { QueuedTask, PriorityLevel } from '@/features/data-scheduler/types'

/**
 * Head-index dequeue contract (replaces Array.shift O(n)).
 * Locks FIFO within priority, priority order, and remove/peek after
 * many dequeues (compaction must not drop live items).
 */

function task(id: string, priority: PriorityLevel): QueuedTask {
  const now = Date.now()
  return {
    id,
    priority,
    operation: async () => id,
    resolve: () => {},
    reject: () => {},
    timeout: 1000,
    createdAt: now,
    enqueuedAt: now,
    attempts: 0,
  }
}

test('FIFO within priority and HIGH before MEDIUM before LOW', () => {
  const q = new PriorityQueue()
  expect(q.enqueue(task('l1', 'LOW'))).toBe(true)
  expect(q.enqueue(task('m1', 'MEDIUM'))).toBe(true)
  expect(q.enqueue(task('h1', 'HIGH'))).toBe(true)
  expect(q.enqueue(task('h2', 'HIGH'))).toBe(true)

  expect(q.dequeue()?.id).toBe('h1')
  expect(q.dequeue()?.id).toBe('h2')
  expect(q.dequeue()?.id).toBe('m1')
  expect(q.dequeue()?.id).toBe('l1')
  expect(q.dequeue()).toBeNull()
  expect(q.isEmpty()).toBe(true)
})

test('size/peek/remove respect head after mass dequeue', () => {
  const q = new PriorityQueue()
  for (let i = 0; i < 80; i++) {
    q.enqueue(task(`t${i}`, 'MEDIUM'))
  }
  for (let i = 0; i < 70; i++) {
    expect(q.dequeue()?.id).toBe(`t${i}`)
  }
  expect(q.size()).toBe(10)
  expect(q.peek()?.id).toBe('t70')
  expect(q.countByPriority('MEDIUM')).toBe(10)
  expect(q.ids()).toEqual(Array.from({ length: 10 }, (_, i) => `t${70 + i}`))
  expect(q.remove('t75')).toBe(true)
  expect(q.remove('t75')).toBe(false)
  expect(q.size()).toBe(9)
  expect(q.dequeue()?.id).toBe('t70')
})
