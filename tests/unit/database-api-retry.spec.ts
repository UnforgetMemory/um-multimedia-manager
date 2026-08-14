import { test, expect } from '@playwright/test'
import { dbGetWatchedIds } from '@/features/database/api'

/**
 * Database API retry contract (2026-08-11 umreview) — locks the send()
 * behavior added to fix the "Could not establish connection. Receiving end
 * does not exist." failures on PT sites:
 *
 * 1. Transient connection errors (SW wake race / killed mid-flight) are
 *    retried with short backoff; a later success resolves normally.
 * 2. Persistent connection errors reject after the retries are exhausted.
 * 3. Semantic DB errors (response.success === false) are NEVER retried.
 *
 * chrome.runtime is stubbed — send() only touches it at call time.
 */

interface ScriptStep {
  error?: string
  response?: unknown
}

function stubChromeSendMessage(script: ScriptStep[]) {
  let callIndex = 0
  const calls: Array<{ type: string }> = []

  const runtime = {
    sendMessage: (message: { type: string }, callback: (response: unknown) => void) => {
      calls.push(message)
      const step = script[Math.min(callIndex, script.length - 1)]
      callIndex++
      if (step.error) {
        runtime.lastError = { message: step.error }
        callback(undefined)
        runtime.lastError = null
      } else {
        runtime.lastError = null
        callback(step.response)
      }
    },
    lastError: null as { message: string } | null,
  }

  ;(globalThis as unknown as { chrome: unknown }).chrome = { runtime } as unknown as typeof chrome
  return calls
}

test('transient connection error → retried → resolves on success', async () => {
  const calls = stubChromeSendMessage([
    { error: 'Could not establish connection. Receiving end does not exist.' },
    { response: { success: true, results: { douban_records: ['movie::1'] } } },
  ])

  const results = await dbGetWatchedIds(['douban_records'])
  expect(results).toEqual({ douban_records: ['movie::1'] })
  expect(calls.length).toBe(2)
})

test('persistent connection errors → rejects after retries exhausted', async () => {
  const calls = stubChromeSendMessage([
    { error: 'Could not establish connection. Receiving end does not exist.' },
  ])

  await expect(dbGetWatchedIds(['douban_records'])).rejects.toThrow(
    /Could not establish connection/,
  )
  expect(calls.length).toBe(3) // initial + 2 retries
})

test('semantic DB error (success:false) → NOT retried', async () => {
  const calls = stubChromeSendMessage([
    { response: { success: false, error: 'Invalid store name' } },
  ])

  await expect(dbGetWatchedIds(['bogus_records'])).rejects.toThrow(/Invalid store name/)
  expect(calls.length).toBe(1)
})

test('extension context invalidated → NOT retried (permanent condition)', async () => {
  const calls = stubChromeSendMessage([
    { error: 'Extension context invalidated.' },
  ])

  await expect(dbGetWatchedIds(['douban_records'])).rejects.toThrow(
    /Extension context invalidated/,
  )
  expect(calls.length).toBe(1)
})
