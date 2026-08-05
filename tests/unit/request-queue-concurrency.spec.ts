import { test, expect } from '@playwright/test'
import { RequestQueue } from '@/utils/requestQueue'

/**
 * Concurrency contract for the mukaku network probe queue.
 *
 * Root cause fixed in the mukaku dimmer: the card loop awaited each
 * probeAndProcessCard before starting the next card, so the RequestQueue
 * never had more than one task in flight — maxConcurrent: 10 never engaged
 * and dimming of N uncached cards took N × (420–980ms delay + fetch).
 *
 * The fix fires all needs-probe lookups in phase 1 (no per-card await),
 * then settles them in phase 2. These tests lock the queue's own
 * concurrency contract so a future serialization regression is caught here.
 */

function makeQueue(maxConcurrent: number, minDelayMs = 0, maxDelayMs = 0): RequestQueue {
  return new RequestQueue({ maxConcurrent, minDelayMs, maxDelayMs })
}

test('runs up to maxConcurrent tasks concurrently (no serialization)', async () => {
  const queue = makeQueue(10)
  const active = new Set<number>()
  let peakActive = 0

  const tasks = Array.from({ length: 20 }, (_, i) =>
    queue.enqueue(`k${i}`, async () => {
      active.add(i)
      peakActive = Math.max(peakActive, active.size)
      await new Promise((r) => setTimeout(r, 20))
      active.delete(i)
    }),
  )

  await Promise.all(tasks)
  // 20 tasks with maxConcurrent 10 → peak concurrency must exceed 1
  expect(peakActive).toBeGreaterThan(1)
  expect(peakActive).toBeLessThanOrEqual(10)
})

test('maxConcurrent 1 serializes strictly (peak 1)', async () => {
  const queue = makeQueue(1)
  const active = new Set<number>()
  let peakActive = 0

  const tasks = Array.from({ length: 5 }, (_, i) =>
    queue.enqueue(`k${i}`, async () => {
      active.add(i)
      peakActive = Math.max(peakActive, active.size)
      await new Promise((r) => setTimeout(r, 5))
      active.delete(i)
    }),
  )

  await Promise.all(tasks)
  expect(peakActive).toBe(1)
})

test('rejects propagate to the enqueue caller', async () => {
  const queue = makeQueue(2)
  await expect(
    queue.enqueue('boom', async () => {
      throw new Error('probe failed')
    }),
  ).rejects.toThrow('probe failed')
})

test('idle after all tasks settle; totalCount resets', async () => {
  const queue = makeQueue(3)
  expect(queue.isIdle()).toBe(true)

  const tasks = Array.from({ length: 4 }, (_, i) =>
    queue.enqueue(`k${i}`, async () => {
      await new Promise((r) => setTimeout(r, 5))
    }),
  )
  expect(queue.isIdle()).toBe(false)
  await Promise.all(tasks)
  expect(queue.isIdle()).toBe(true)

  queue.resetTotal()
  expect(queue.getState().total).toBe(0)
})
