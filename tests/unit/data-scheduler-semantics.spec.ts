import { test, expect } from '@playwright/test'
import { DataScheduler } from '@/features/data-scheduler/data-scheduler'
import { CacheManager } from '@/features/cache/cache-manager'
import { MAX_QUEUE_SIZE, CACHE_TTL } from '@/features/data-scheduler/types'

/**
 * DataScheduler core semantics (2026-08-08) — complements the existing M1/L1
 * regression tests with the documented pipeline contract:
 *
 *   schedule() → cache check → rate-limit → enqueue → process → retry → cache write
 *
 * Locks: cache-hit short-circuit (no operation execution), invalidateCache
 * forcing a re-run, HIGH-before-MEDIUM priority ordering, queue-full rejection,
 * and post-execution cache population.
 */

function makeScheduler(): { scheduler: DataScheduler; cache: CacheManager } {
  const cache = new CacheManager({ maxSize: 100 })
  const scheduler = new DataScheduler(cache, 1)
  return { scheduler, cache }
}

test('cacheKey hit short-circuits — operation NOT executed', async () => {
  const { scheduler, cache } = makeScheduler()
  await cache.set('scheduler', 'get:st:k', { value: 42 })

  let executed = 0
  const result = await scheduler.schedule(async () => {
    executed++
    return { value: 99 }
  }, { cacheKey: 'get:st:k' })

  expect(result).toEqual({ value: 42 })
  expect(executed).toBe(0)
})

test('cache miss executes operation and populates the cache', async () => {
  const { scheduler, cache } = makeScheduler()

  const result = await scheduler.schedule(async () => 'fresh', { cacheKey: 'get:st:k' })

  expect(result).toBe('fresh')
  expect(await cache.get('scheduler', 'get:st:k')).toBe('fresh')
})

test('invalidateCache forces re-execution and clears stale entry', async () => {
  const { scheduler, cache } = makeScheduler()
  await cache.set('scheduler', 'get:st:k', 'stale')

  let executed = 0
  const result = await scheduler.schedule(async () => {
    executed++
    return 'new'
  }, { cacheKey: 'get:st:k', invalidateCache: true })

  expect(result).toBe('new')
  expect(executed).toBe(1)
  expect(await cache.get('scheduler', 'get:st:k')).toBe('new')
})

test('HIGH priority task dequeues before MEDIUM', async () => {
  const scheduler = new DataScheduler(undefined, 1)
  const order: string[] = []

  // Schedule the MEDIUM task first (would be at queue head), then HIGH.
  // Without priority ordering the MEDIUM task would run first.
  const medium = scheduler.schedule(async () => {
    order.push('medium')
  }, { priority: 'MEDIUM' })

  const high = scheduler.schedule(async () => {
    order.push('high')
  }, { priority: 'HIGH' })

  await Promise.all([medium, high])
  expect(order).toEqual(['high', 'medium'])
})

test('queue full → schedule rejects with clear error', async () => {
  const scheduler = new DataScheduler(undefined, 1)

  // Occupy the queue with MAX_QUEUE_SIZE pending tasks whose operations block
  // forever, so every subsequent enqueue hits the size cap.
  const blockers: Promise<unknown>[] = []
  for (let i = 0; i < MAX_QUEUE_SIZE; i++) {
    blockers.push(
      scheduler.schedule(
        () => new Promise(() => { /* never resolves */ }),
        { priority: 'LOW', timeout: 60_000 },
      ),
    )
  }

  await expect(
    scheduler.schedule(async () => 'overflow', { priority: 'LOW' }),
  ).rejects.toThrow(/Queue full/)
})
