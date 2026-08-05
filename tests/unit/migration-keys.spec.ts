import { test, expect } from '@playwright/test'
import { normalizeVideoKey } from '@/features/database/models'

test.describe('normalizeVideoKey', () => {
  test('video::BV1xx → movie::BV1xx', () => {
    expect(normalizeVideoKey('video::BV1xx')).toBe('movie::BV1xx')
  })

  test('BV1xx (bare key) → movie::BV1xx', () => {
    expect(normalizeVideoKey('BV1xx')).toBe('movie::BV1xx')
  })

  test('movie::BV1xx → unchanged', () => {
    expect(normalizeVideoKey('movie::BV1xx')).toBe('movie::BV1xx')
  })

  test('tv::123 → unchanged', () => {
    expect(normalizeVideoKey('tv::123')).toBe('tv::123')
  })

  test('music::123 → unchanged', () => {
    expect(normalizeVideoKey('music::123')).toBe('music::123')
  })

  test('idempotence: normalized key stays stable', () => {
    const once = normalizeVideoKey('video::BV1xx')
    expect(normalizeVideoKey(once)).toBe(once)
    const twice = normalizeVideoKey('BV1xx')
    expect(normalizeVideoKey(twice)).toBe(twice)
  })
})
