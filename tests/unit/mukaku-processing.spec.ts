import { test, expect } from '@playwright/test'
import { createSerialRunner } from '@/entrypoints/content/handlers/mukaku/processing'

/**
 * T7 — createSerialRunner: coalescing serial runner replacing the mukaku
 * dimmer's "drop concurrent scans" guard (handler.ts isProcessing).
 * N rapid run() calls while a run is active must coalesce into exactly ONE
 * queued re-run; rejections must not break the drain loop.
 */

interface Deferred {
  promise: Promise<void>
  resolve: () => void
  reject: (err: unknown) => void
}

/** Controlled deferred — lets the test hold a run open and settle it manually. */
function deferred(): Deferred {
  let resolve!: () => void
  let reject!: (err: unknown) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** Drain microtask queue deterministically (no timers needed — all work is promise-chained). */
async function flush(times = 5): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve()
}

test('single run executes once, then idle', async () => {
  const runner = createSerialRunner()
  expect(runner.idle()).toBe(true)

  const d = deferred()
  let calls = 0
  runner.run(() => {
    calls++
    return d.promise
  })

  expect(calls).toBe(1)
  expect(runner.idle()).toBe(false)

  d.resolve()
  await flush()

  expect(calls).toBe(1)
  expect(runner.idle()).toBe(true)
})

test('run while active executes once more after settle (2 calls → 2 executions)', async () => {
  const runner = createSerialRunner()
  const d1 = deferred()
  const d2 = deferred()
  const tasks = [() => d1.promise, () => d2.promise]
  let calls = 0
  const task = (): Promise<void> => tasks[calls++]()

  runner.run(task)
  runner.run(task)

  expect(calls).toBe(1) // second call coalesced, must NOT run yet

  d1.resolve()
  await flush()

  expect(calls).toBe(2) // queued re-run executes after first settles

  d2.resolve()
  await flush()

  expect(runner.idle()).toBe(true)
})

test('3 rapid calls while active coalesce into exactly 2 executions', async () => {
  const runner = createSerialRunner()
  const d1 = deferred()
  const d2 = deferred()
  const tasks = [() => d1.promise, () => d2.promise]
  let calls = 0
  const task = (): Promise<void> => tasks[calls++]()

  runner.run(task)
  runner.run(task)
  runner.run(task)

  expect(calls).toBe(1)

  d1.resolve()
  await flush()

  expect(calls).toBe(2) // N=3 → 1 + 1 coalesced pending, never 3

  d2.resolve()
  await flush()

  expect(calls).toBe(2)
  expect(runner.idle()).toBe(true)
})

test('rejected run settles, still drains pending, and loop survives', async () => {
  const runner = createSerialRunner()
  const d1 = deferred()
  const d2 = deferred()
  let calls = 0
  const task = (): Promise<void> => {
    calls++
    return calls === 1 ? d1.promise : d2.promise
  }

  runner.run(task)
  runner.run(task)

  d1.reject(new Error('boom'))
  await flush()

  expect(calls).toBe(2) // rejection must not drop the pending re-run

  d2.resolve()
  await flush()
  expect(runner.idle()).toBe(true)

  // Loop survives: a fresh run after a rejected cycle still executes
  const d3 = deferred()
  runner.run(() => {
    calls++
    return d3.promise
  })
  expect(calls).toBe(3)
  d3.resolve()
  await flush()
  expect(runner.idle()).toBe(true)
})

test('idle() reflects active run and pending state', async () => {
  const runner = createSerialRunner()
  expect(runner.idle()).toBe(true)

  const d1 = deferred()
  const d2 = deferred()
  let calls = 0
  const task = (): Promise<void> => (calls++ === 0 ? d1.promise : d2.promise)

  runner.run(task)
  expect(runner.idle()).toBe(false) // active run

  // A coalesced pending run keeps the runner non-idle after the first settle
  runner.run(task)
  d1.resolve()
  await flush()
  expect(calls).toBe(2)
  expect(runner.idle()).toBe(false) // second (queued) run now active

  d2.resolve()
  await flush()
  expect(runner.idle()).toBe(true)
})
