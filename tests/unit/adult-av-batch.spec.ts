import { test, expect } from '@playwright/test'
import { IDBFactory } from 'fake-indexeddb'
import { handleAdultAvBatchAdd } from '@/entrypoints/background/handlers/adult-av'
import { JAV_IDS_STORE_NAME } from '@/features/adult-av/models'
import type { StoreRecord, AdultAvIdInput } from '@/types'
import type { MediaDatabase } from '@/features/database/models'

/**
 * S5 — N+1 elimination for the adult write path.
 *
 * handleAdultAvBatchAdd used to do a sequential `mediaDB.get` + `mediaDB.put`
 * (2 transactions) per item. It must now do exactly ONE batchGet + ONE
 * batchPut while preserving byte-identical merge semantics:
 *   url       = item.url        || existing.url || ''
 *   status    = 2
 *   rating    = item.rating ?? existing.rating ?? 0
 *   updatedAt = item.updatedAt  || now
 *   linkedIds = existing.linkedIds || {}
 * Items without an id are skipped entirely (not counted, not written).
 *
 * The db seam (3rd arg, defaults to the real mediaDB singleton) lets these
 * tests drive the handler with a stub that records calls.
 */

interface BatchPutCall {
  storeName: string
  records: Array<{ key: string; record: StoreRecord }>
}

/** Stub MediaDatabase recording batchGet/batchPut call counts + payloads. */
function createStubDb(seed: Map<string, StoreRecord>) {
  const batchGetCalls: Array<{ storeName: string; keys: string[] }> = []
  const batchPutCalls: BatchPutCall[] = []
  const db: Pick<MediaDatabase, 'batchGet' | 'batchPut'> = {
    batchGet: async <T = StoreRecord>(storeName: string, keys: IDBValidKey[]) => {
      batchGetCalls.push({ storeName, keys: keys.map(String) })
      const map = new Map<IDBValidKey, T>()
      for (const k of keys) {
        const found = seed.get(String(k))
        if (found) map.set(k, found as T)
      }
      return map
    },
    batchPut: async (storeName: string, records: Array<{ key: string; record: StoreRecord }>) => {
      batchPutCalls.push({ storeName, records })
    },
  }
  return { db, batchGetCalls, batchPutCalls }
}

/** Fresh in-memory IndexedDB so the pre-fix handler (real mediaDB) can run. */
;(globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory()

const ISO_TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/

function runHandler(db: Pick<MediaDatabase, 'batchGet' | 'batchPut'>, source: string, items: AdultAvIdInput[]) {
  let response: { success: boolean; addedCount?: number; error?: string } | undefined
  const sendResponse = (r?: unknown) => { response = r as typeof response }
  return {
    promise: handleAdultAvBatchAdd({ source, items }, sendResponse, db),
    response: () => response,
  }
}

test.describe('handleAdultAvBatchAdd (S5 N+1 elimination)', () => {
  test('exactly one batchGet + one batchPut, old merge semantics preserved', async () => {
    const seed = new Map<string, StoreRecord>([
      ['javdb::ABC-123', {
        url: 'https://old.example/abc',
        status: 2,
        rating: 7,
        updatedAt: '2024-01-01T00:00:00.000Z',
        linkedIds: { douban: 'movie::1' },
      }],
    ])
    const { db, batchGetCalls, batchPutCalls } = createStubDb(seed)
    const { promise, response } = runHandler(db, 'javdb', [
      { id: 'abc-123', url: 'https://new.example/abc', rating: 9 },
      { id: 'DEF-456', url: '' },
      { url: 'https://no-id.example' }, // skipped: no id
    ])
    await promise
    // Exactly ONE read transaction + ONE write transaction (was 2 per item)
    expect(batchGetCalls).toEqual([
      { storeName: 'jav_ids', keys: ['javdb::ABC-123', 'javdb::DEF-456'] },
    ])
    expect(batchPutCalls).toHaveLength(1)
    expect(batchPutCalls[0].storeName).toBe('jav_ids')

    const records = batchPutCalls[0].records
    expect(records).toHaveLength(2)

    // Existing item: item url/rating win, linkedIds preserved from existing
    expect(records[0].key).toBe('javdb::ABC-123')
    expect(records[0].record.url).toBe('https://new.example/abc')
    expect(records[0].record.status).toBe(2)
    expect(records[0].record.rating).toBe(9)
    expect(records[0].record.linkedIds).toEqual({ douban: 'movie::1' })
    expect(records[0].record.updatedAt).toMatch(ISO_TS)

    // New item: defaults url '' / rating 0 / linkedIds {}
    expect(records[1].key).toBe('javdb::DEF-456')
    expect(records[1].record.url).toBe('')
    expect(records[1].record.status).toBe(2)
    expect(records[1].record.rating).toBe(0)
    expect(records[1].record.linkedIds).toEqual({})
    expect(records[1].record.updatedAt).toMatch(ISO_TS)

    expect(response()).toEqual({ success: true, addedCount: 2 })
  })

  test('url/rating fall back to the existing record when the item omits them', async () => {
    const seed = new Map<string, StoreRecord>([
      ['javdb::XYZ-999', {
        url: 'https://old-url.example/xyz',
        status: 2,
        rating: 7,
        updatedAt: '2024-01-01T00:00:00.000Z',
        linkedIds: { imdb: 'tt0111161' },
      }],
    ])
    const { db, batchPutCalls } = createStubDb(seed)
    const { promise, response } = runHandler(db, 'javdb', [{ id: ' xyz-999 ' }])
    await promise
    expect(batchPutCalls).toHaveLength(1)
    const { key, record } = batchPutCalls[0].records[0]
    expect(key).toBe('javdb::XYZ-999') // normalizeAvId trims + uppercases
    expect(record.url).toBe('https://old-url.example/xyz')
    expect(record.rating).toBe(7)
    expect(record.linkedIds).toEqual({ imdb: 'tt0111161' })
    expect(record.status).toBe(2)
    expect(record.updatedAt).toMatch(ISO_TS)

    expect(response()).toEqual({ success: true, addedCount: 1 })
  })

  test('no valid items → no batchPut, addedCount 0', async () => {
    const { db, batchGetCalls, batchPutCalls } = createStubDb(new Map())
    const { promise, response } = runHandler(db, 'javdb', [{ url: 'https://a.example' }, { id: '' }])
    await promise
    expect(batchGetCalls).toHaveLength(1)
    expect(batchGetCalls[0].keys).toEqual([])
    expect(batchPutCalls).toHaveLength(0)

    expect(response()).toEqual({ success: true, addedCount: 0 })
  })
})
