import { test, expect } from '@playwright/test'
import { isWatchedStatus } from '@/features/database/models'

/**
 * isWatchedStatus — the status gate behind getWatchedIds.
 *
 * Locks the rule that only status=2 (done/watched) counts as "watched".
 * Status codes: 0 none | 1 wishlist | 2 done | 3 doing.
 * Doing (3) must NOT be treated as watched — doing so makes PT seed
 * dimming and "watched" badges fire for in-progress records.
 */
test.describe('isWatchedStatus — explicit watched gate', () => {
  test('returns true only for status=2 (watched/done)', () => {
    expect(isWatchedStatus(2)).toBe(true)
  })

  test('accepts legacy string "done" as watched', () => {
    expect(isWatchedStatus('done')).toBe(true)
  })

  test('rejects doing (3) — in-progress is not watched', () => {
    expect(isWatchedStatus(3)).toBe(false)
  })

  test('rejects wishlist (1) and legacy "wish"', () => {
    expect(isWatchedStatus(1)).toBe(false)
    expect(isWatchedStatus('wish')).toBe(false)
  })

  test('rejects none (0)', () => {
    expect(isWatchedStatus(0)).toBe(false)
  })

  test('rejects undefined / missing status', () => {
    expect(isWatchedStatus(undefined)).toBe(false)
  })

  test('rejects unknown string values such as "watching"', () => {
    expect(isWatchedStatus('watching')).toBe(false)
  })

  test('rejects null', () => {
    expect(isWatchedStatus(null)).toBe(false)
  })
})
