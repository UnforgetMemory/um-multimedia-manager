import { test, expect } from '@playwright/test'
import { DataScheduler } from '@/features/data-scheduler/data-scheduler'
import { CacheManager } from '@/features/cache/cache-manager'
import type { SchedulerEvent } from '@/features/data-scheduler/types'

/**
 * DataScheduler timeout diagnostics (2026-08-11 umreview) — locks the
 * executeTask contract after the DB_GET_WATCHED_IDS timeout cascade fix:
 *
 * 1. A task that outlives its timeout rejects with the timeout error (which
 *    now carries the storeName), NOT the operation's eventual error.
 * 2. When the timed-out operation finally settles, its REAL outcome is
 *    surfaced as an informational `task:late-settled` event (never re-counted
 *    in monitor metrics — the task was already recorded as failed).
 * 3. A late SUCCESS still populates the scheduler cache → the next caller
 *    with the same cacheKey hits the cache (self-healing, no re-execution).
 */

test('timed-out task rejects with timeout error carrying the storeName', async () => {
  const scheduler = new DataScheduler(undefined, 1)

  await expect(
    scheduler.schedule(
      async () => {
        await new Promise((r) => setTimeout(r, 300))
        return 'too slow'
      },
      { priority: 'HIGH', storeName: 'douban_records', timeout: 100 },
    ),
  ).rejects.toThrow(/Task task_\d+_\d+ \(douban_records\) timed out after 100ms/)
})

test('real operation error surfaces via task:late-settled and metrics are not double-counted', async () => {
  const scheduler = new DataScheduler(undefined, 1)
  const events: SchedulerEvent[] = []
  scheduler.onEvent((e) => events.push(e))

  const lateSettled = new Promise<SchedulerEvent>((resolve) => {
    scheduler.onEvent((e) => {
      if (e.type === 'task:late-settled') resolve(e)
    })
  })

  await expect(
    scheduler.schedule(
      async () => {
        await new Promise((r) => setTimeout(r, 300))
        throw new Error('real underlying failure')
      },
      { priority: 'HIGH', storeName: 'douban_records', timeout: 100 },
    ),
  ).rejects.toThrow(/timed out after 100ms/)

  const late = await lateSettled
  expect(late.type).toBe('task:late-settled')
  expect(late.error).toBeInstanceOf(Error)
  expect((late.error as Error).message).toBe('real underlying failure')

  // The task was counted exactly once (as failed) — the late-settled event is
  // informational and must not inflate totalRequests/responseTimes.
  const m = scheduler.monitor.getMetrics()
  expect(m.totalRequests).toBe(1)
  expect(m.totalErrors).toBe(1)
  expect(m.responseTime.p50).toBe(0)
})

test('late success populates the scheduler cache — next caller hits the cache', async () => {
  const cache = new CacheManager({ maxSize: 100 })
  const scheduler = new DataScheduler(cache, 1)

  await expect(
    scheduler.schedule(
      async () => {
        await new Promise((r) => setTimeout(r, 300))
        return { value: 42 }
      },
      { cacheKey: 'watched:douban_records', timeout: 100 },
    ),
  ).rejects.toThrow(/timed out after 100ms/)

  // Wait for the orphaned operation to finish and write the cache.
  const lateSettled = new Promise<void>((resolve) => {
    scheduler.onEvent((e) => {
      if (e.type === 'task:late-settled') resolve()
    })
  })
  await lateSettled

  let executed = 0
  const result = await scheduler.schedule(async () => {
    executed++
    return { value: 99 }
  }, { cacheKey: 'watched:douban_records' })

  expect(result).toEqual({ value: 42 })
  expect(executed).toBe(0)
})
