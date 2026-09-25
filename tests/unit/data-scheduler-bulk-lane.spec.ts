import { test, expect } from '@playwright/test'
import { DataScheduler } from '@/features/data-scheduler/data-scheduler'
import { CacheManager } from '@/features/cache/cache-manager'

/**
 * Bulk lane isolation (C2): long jobs (export/stats/WebDAV) must not
 * block interactive DB_GET/DB_PUT on the serial interactive queue.
 */

function makeScheduler(): DataScheduler {
  return new DataScheduler(new CacheManager({ maxSize: 10 }), 1)
}

test('bulk lane job does not block interactive schedule', async () => {
  const scheduler = makeScheduler()
  let bulkDone = false
  let interactiveDone = false

  const bulk = scheduler.schedule(
    async () => {
      await new Promise((r) => setTimeout(r, 80))
      bulkDone = true
      return 'bulk'
    },
    { lane: 'bulk', priority: 'MEDIUM', timeout: 5000 },
  )

  const interactive = scheduler.schedule(async () => {
    interactiveDone = true
    return 'db'
  }, { lane: 'interactive', priority: 'HIGH', timeout: 5000 })

  // Interactive resolves while bulk is still running
  await expect(interactive).resolves.toBe('db')
  expect(interactiveDone).toBe(true)
  expect(bulkDone).toBe(false)

  await expect(bulk).resolves.toBe('bulk')
  expect(bulkDone).toBe(true)
})

test('bulk jobs stay serial among themselves', async () => {
  const scheduler = makeScheduler()
  let concurrent = 0
  let peak = 0

  const job = async (id: string) =>
    scheduler.schedule(
      async () => {
        concurrent++
        peak = Math.max(peak, concurrent)
        await new Promise((r) => setTimeout(r, 20))
        concurrent--
        return id
      },
      { lane: 'bulk', timeout: 5000 },
    )

  const results = await Promise.all([job('a'), job('b'), job('c')])
  expect(results).toEqual(['a', 'b', 'c'])
  expect(peak).toBe(1)
})

test('clear() empties both lanes', async () => {
  const scheduler = makeScheduler()
  const p1 = scheduler.schedule(async () => 'x', { lane: 'bulk', timeout: 5000 })
  const p2 = scheduler.schedule(async () => 'y', { lane: 'interactive', timeout: 5000 })
  scheduler.clear()
  // Either resolves (already started) or rejects (dropped) — must settle.
  await Promise.allSettled([p1, p2])
  expect(scheduler.queue.isEmpty()).toBe(true)
  expect(scheduler.bulkQueue.isEmpty()).toBe(true)
})

test('lost-wakeup: enqueue while loop exits still runs', async () => {
  const scheduler = makeScheduler()
  // First task finishes; immediately enqueue a second during the exit window.
  const first = scheduler.schedule(async () => 'a', { timeout: 5000 })
  await first
  const second = scheduler.schedule(async () => 'b', { timeout: 5000 })
  await expect(second).resolves.toBe('b')
})
