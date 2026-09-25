import { test, expect } from '@playwright/test'
import { IDBFactory } from 'fake-indexeddb'
import { MediaDatabase } from '@/features/database/models'
import type { StoreRecord } from '@/types'

/**
 * C5 copy-on-write: put/batchPut/optimisticPut must not mutate the caller's
 * snapshot (wire records stay unmutated; versions live only in the store copy).
 *
 * Isolation: new MediaDatabase + new IDBFactory per test (gotcha #5).
 */

function seedRecord(overrides: Partial<StoreRecord> = {}): StoreRecord {
  return {
    url: 'https://movie.douban.com/subject/1/',
    status: 2,
    rating: 8,
    updatedAt: '',
    linkedIds: { douban: 'movie::1' },
    ...overrides,
  }
}

const ORIGINAL_INDEXEDDB = (globalThis as { indexedDB?: IDBFactory }).indexedDB

test.afterAll(() => {
  ;(globalThis as { indexedDB?: IDBFactory }).indexedDB = ORIGINAL_INDEXEDDB
})

test('put does not mutate the input record', async () => {
  ;(globalThis as { indexedDB?: IDBFactory }).indexedDB = new IDBFactory()
  const mdb = new MediaDatabase()
  await mdb.init()
  const input = seedRecord()
  const snapshotBefore = JSON.stringify(input)

  await mdb.put('douban_records', 'movie::1', input)

  expect(JSON.stringify(input)).toBe(snapshotBefore)
  expect(input.recordVersion).toBeUndefined()
  expect(input.updatedAt).toBe('')

  const stored = await mdb.get('douban_records', 'movie::1')
  expect(stored?.recordVersion).toBe(1)
  expect(stored?.updatedAt).not.toBe('')
  expect(stored?.linkedIds).toEqual({ douban: 'movie::1' })
  expect(stored?.linkedIds).not.toBe(input.linkedIds)
  mdb.close()
})

test('batchPut does not mutate items', async () => {
  ;(globalThis as { indexedDB?: IDBFactory }).indexedDB = new IDBFactory()
  const mdb = new MediaDatabase()
  await mdb.init()
  const a = seedRecord({ url: 'https://a.example' })
  const b = seedRecord({ url: 'https://b.example' })
  const before = JSON.stringify([a, b])

  await mdb.batchPut('douban_records', [
    { key: 'movie::a', record: a },
    { key: 'movie::b', record: b },
  ])

  expect(JSON.stringify([a, b])).toBe(before)
  expect(a.recordVersion).toBeUndefined()
  const stored = await mdb.get('douban_records', 'movie::a')
  expect(stored?.recordVersion).toBe(1)
  mdb.close()
})

test('optimisticPut does not mutate input and bumps version in store only', async () => {
  ;(globalThis as { indexedDB?: IDBFactory }).indexedDB = new IDBFactory()
  const mdb = new MediaDatabase()
  await mdb.init()
  await mdb.put('douban_records', 'movie::1', seedRecord())
  const first = await mdb.get('douban_records', 'movie::1')
  const expected = first?.recordVersion ?? 0

  const update = seedRecord({ rating: 9 })
  const before = JSON.stringify(update)
  const result = await mdb.optimisticPut('douban_records', 'movie::1', update, expected)

  expect(result.ok).toBe(true)
  expect(JSON.stringify(update)).toBe(before)
  expect(update.recordVersion).toBeUndefined()
  const stored = await mdb.get('douban_records', 'movie::1')
  expect(stored?.recordVersion).toBe(expected + 1)
  expect(stored?.rating).toBe(9)
  mdb.close()
})
