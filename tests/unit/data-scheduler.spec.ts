import { test, expect } from '@playwright/test'
import { DataScheduler } from '@/features/data-scheduler/data-scheduler'

/**
 * T19 — fixes for audit docs/audit/architecture-scan-2026-08-03.md:
 *   §3.3-M1  processLoop rate-limit queue hang (break → sleep+continue)
 *   §3.4-L1  executeTask timeout timer leak (missing clearTimeout)
 */

// ==================== Test 1: M1 — rate-limit timeout must NOT drop the queued task ====================

test('M1: rate-limit acquire timeout does not drop the queued task', async () => {
  // Fail fast if the task never runs (RED: current code `break`s the loop)
  test.setTimeout(4_000)

  // Tiny backoff so the test stays fast; production default is 10s
  const scheduler = new DataScheduler(undefined, 10)

  let acquireCount = 0
  // First acquire times out (rejects), subsequent attempts succeed
  scheduler.rateLimiter.acquire = async () => {
    acquireCount += 1
    if (acquireCount === 1) throw new Error('Rate limit acquire timeout')
  }

  const result = await scheduler.schedule(async () => 'task-ran', { timeout: 1_000 })

  expect(result).toBe('task-ran')
  expect(acquireCount).toBeGreaterThanOrEqual(2)
  expect(scheduler.queue.isEmpty()).toBe(true)
})

// ==================== Test 2+3: L1 — executeTask must clear its timeout timer ====================

/** Instrument setTimeout/clearTimeout to track handles created with the task timeout delay. */
function instrumentTimeoutTimers(targetDelay: number): {
  created: Set<ReturnType<typeof setTimeout>>
  cleared: Set<ReturnType<typeof setTimeout>>
  restore: () => void
} {
  const created = new Set<ReturnType<typeof setTimeout>>()
  const cleared = new Set<ReturnType<typeof setTimeout>>()
  const origSetTimeout = globalThis.setTimeout
  const origClearTimeout = globalThis.clearTimeout

  globalThis.setTimeout = ((fn: (...args: unknown[]) => void, delay?: number, ...args: unknown[]) => {
    const handle = origSetTimeout(fn, delay, ...args)
    if (delay === targetDelay) created.add(handle)
    return handle
  }) as typeof setTimeout

  globalThis.clearTimeout = ((handle: ReturnType<typeof setTimeout>) => {
    if (created.has(handle)) cleared.add(handle)
    return origClearTimeout(handle)
  }) as typeof clearTimeout

  return {
    created,
    cleared,
    restore: () => {
      globalThis.setTimeout = origSetTimeout
      globalThis.clearTimeout = origClearTimeout
    },
  }
}

test('L1: executeTask clears its timeout timer when the task completes', async () => {
  const TASK_TIMEOUT = 200
  const { created, cleared, restore } = instrumentTimeoutTimers(TASK_TIMEOUT)
  try {
    const scheduler = new DataScheduler()
    const result = await scheduler.schedule(async () => 'done', { timeout: TASK_TIMEOUT })

    expect(result).toBe('done')
    // Every per-task timeout timer created must have been cleared
    expect(created.size).toBeGreaterThan(0)
    expect(cleared.size).toBe(created.size)
  } finally {
    restore()
  }
})

test('L1: executeTask clears its timeout timer when the task times out', async () => {
  const TASK_TIMEOUT = 50
  const { created, cleared, restore } = instrumentTimeoutTimers(TASK_TIMEOUT)
  try {
    const scheduler = new DataScheduler()
    // Operation never settles — the per-task timeout must reject it
    await expect(
      scheduler.schedule(async () => new Promise(() => {}), { timeout: TASK_TIMEOUT }),
    ).rejects.toThrow(/timed out/)

    expect(created.size).toBeGreaterThan(0)
    expect(cleared.size).toBe(created.size)
  } finally {
    restore()
  }
})
