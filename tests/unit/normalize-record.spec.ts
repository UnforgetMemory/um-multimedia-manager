import { test, expect } from '@playwright/test'
import { normalizeStoreRecord, MigrationError, CURRENT_RECORD_VERSION, MIN_SUPPORTED_RECORD_VERSION } from '@/features/migration/models'

/**
 * normalizeStoreRecord — boundary hardening for untrusted imported data
 * (WebDAV download/sync, ZIP import).
 *
 * Locks the security contract: non-object payloads are rejected, unknown
 * fields are stripped (CWE-915 mass-assignment), and out-of-range
 * status/rating values are dropped so downstream defaults apply.
 */
test.describe('normalizeStoreRecord — boundary validation', () => {
  test('rejects array payloads with INVALID_RECORD', () => {
    expect(() => normalizeStoreRecord([{ status: 2 }])).toThrowError(MigrationError)
    try {
      normalizeStoreRecord([])
      expect.unreachable()
    } catch (e) {
      expect((e as MigrationError).code).toBe('INVALID_RECORD')
    }
  })

  test('rejects null / primitives', () => {
    expect(() => normalizeStoreRecord(null)).toThrowError(MigrationError)
    expect(() => normalizeStoreRecord(42)).toThrowError(MigrationError)
    expect(() => normalizeStoreRecord('str')).toThrowError(MigrationError)
  })

  test('strips unknown fields (mass-assignment defence)', () => {
    const { record } = normalizeStoreRecord({
      url: 'https://bgm.tv/subject/12345/',
      status: 2,
      rating: 8,
      updatedAt: '2026-08-04T00:00:00.000Z',
      linkedIds: {},
      _injected: 'payload',
      __proto__: { polluted: true },
    })
    expect('_injected' in record).toBe(false)
    expect('polluted' in (record as Record<string, unknown>)).toBe(false)
  })

  test('drops out-of-range status — falls back to neutral 0 (not the malicious value)', () => {
    for (const bad of [-1, 4, 1.5, '2', null]) {
      const { record } = normalizeStoreRecord({ url: 'u', status: bad as never, rating: 0, updatedAt: 't', linkedIds: {} })
      expect(record.status, `status=${String(bad)}`).toBe(0)
    }
  })

  test('drops out-of-range rating — falls back to 0', () => {
    for (const bad of [-1, 11, Number.NaN, '8']) {
      const { record } = normalizeStoreRecord({ url: 'u', status: 2, rating: bad as never, updatedAt: 't', linkedIds: {} })
      expect(record.rating, `rating=${String(bad)}`).toBe(0)
    }
  })

  test('drops non-object linkedIds — falls back to empty object', () => {
    for (const bad of ['x', 42, null]) {
      const { record } = normalizeStoreRecord({ url: 'u', status: 2, rating: 5, updatedAt: 't', linkedIds: bad as never })
      expect(record.linkedIds, `linkedIds=${String(bad)}`).toEqual({})
    }
  })

  test('keeps all whitelisted fields intact on a valid record', () => {
    const valid = {
      url: 'https://bgm.tv/subject/12345/',
      status: 3,
      rating: 9.5,
      comment: '在看',
      updatedAt: '2026-08-04T00:00:00.000Z',
      linkedIds: { imdb: 'movie::tt1234567' },
      recordVersion: 1,
    }
    const { record, migrated } = normalizeStoreRecord(valid)
    expect(record.url).toBe(valid.url)
    expect(record.status).toBe(3)
    expect(record.rating).toBe(9.5)
    expect(record.comment).toBe('在看')
    expect(record.updatedAt).toBe(valid.updatedAt)
    expect(record.linkedIds).toEqual(valid.linkedIds)
    expect(record.recordVersion).toBe(1)
    // v0 (no schemaVersion) must be migrated to the current version
    expect(migrated).toBe(true)
    expect(record.schemaVersion).toBe(CURRENT_RECORD_VERSION)
  })

  test('already-current records pass through unmigrated', () => {
    const { record, migrated } = normalizeStoreRecord({
      url: 'u', status: 2, rating: 7, updatedAt: 't', linkedIds: {}, schemaVersion: CURRENT_RECORD_VERSION,
    })
    expect(migrated).toBe(false)
    expect(record.schemaVersion).toBe(CURRENT_RECORD_VERSION)
  })

  test('records below minimum supported version are rejected', () => {
    expect(() => normalizeStoreRecord({
      url: 'u', status: 2, rating: 7, updatedAt: 't', linkedIds: {}, schemaVersion: MIN_SUPPORTED_RECORD_VERSION - 1,
    })).toThrowError(MigrationError)
  })
})
