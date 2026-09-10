import { test, expect } from '@playwright/test'
import { IDBFactory } from 'fake-indexeddb'
import {
  SehuatangDetailCacheDB,
  TTL_MS,
  MAX_ENTRIES,
  DETAIL_STORE_NAME,
  type SehuatangDetailCacheEntry,
} from '@/features/sehuatang-cache/models'

/**
 * Sehuatang detail cache — DB layer tests (ADR-024 D2).
 *
 * Tests the standalone `umm-sehuatang-cache` IndexedDB wrapper
 * (src/features/sehuatang-cache/models.ts) directly against a real
 * fake-indexeddb IDBFactory — the message layer is out of scope here.
 *
 * Isolation discipline (same as adult-av-db-layer.spec.ts): fresh
 * IDBFactory + fresh SehuatangDetailCacheDB instance + unique DB name per
 * test, so Playwright worker reuse cannot cross-pollute state.
 * globalThis.indexedDB is restored after all tests.
 */

const ORIGINAL_INDEXEDDB = (globalThis as { indexedDB?: IDBFactory }).indexedDB

let dbCounter = 0

function freshDb(): SehuatangDetailCacheDB {
  ;(globalThis as { indexedDB?: IDBFactory }).indexedDB = new IDBFactory()
  dbCounter += 1
  return new SehuatangDetailCacheDB(`umm-sehuatang-cache-test-${dbCounter}`)
}

function makeEntry(
  tid: string,
  overrides: Partial<SehuatangDetailCacheEntry> = {},
): SehuatangDetailCacheEntry {
  return {
    tid,
    imageUrl: `https://img.example/${tid}.jpg`,
    magnetLink: `magnet:?xt=urn:btih:${tid}`,
    cachedAt: Date.now(),
    ...overrides,
  }
}

/** Raw read of every stored entry, bypassing the wrapper (for assertions). */
async function rawGetAll(dbName: string): Promise<SehuatangDetailCacheEntry[]> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(dbName)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  try {
    return await new Promise<SehuatangDetailCacheEntry[]>((resolve, reject) => {
      const tx = db.transaction(DETAIL_STORE_NAME, 'readonly')
      const request = tx.objectStore(DETAIL_STORE_NAME).getAll()
      request.onsuccess = () => resolve(request.result as SehuatangDetailCacheEntry[])
      request.onerror = () => reject(request.error)
    })
  } finally {
    db.close()
  }
}

test.afterAll(() => {
  ;(globalThis as { indexedDB?: IDBFactory }).indexedDB = ORIGINAL_INDEXEDDB
})

test.describe('sehuatang detail cache（独立 IndexedDB，真实 IDBFactory）', () => {
  test('put → get 读回（批量写读闭环）', async () => {
    const db = freshDb()

    await db.putBatch([
      makeEntry('1001'),
      makeEntry('1002', { magnetLink: null }),
    ])

    const entries = await db.getBatch(['1001', '1002'])
    expect(Object.keys(entries).sort()).toEqual(['1001', '1002'])
    expect(entries['1001'].imageUrl).toBe('https://img.example/1001.jpg')
    expect(entries['1001'].magnetLink).toBe('magnet:?xt=urn:btih:1001')
    expect(entries['1002'].magnetLink).toBeNull()
    db.close()
  })

  test('批量部分命中：未缓存的 tid 为 miss 且不报错', async () => {
    const db = freshDb()

    await db.putBatch([makeEntry('2001'), makeEntry('2002')])

    const entries = await db.getBatch(['2001', '2002', '2003', '2004'])
    expect(Object.keys(entries).sort()).toEqual(['2001', '2002'])
    expect(entries['2003']).toBeUndefined()
    db.close()
  })

  test('过期条目 miss 且被顺手删除', async () => {
    const db = freshDb()
    const dbName = `umm-sehuatang-cache-test-${dbCounter}`

    await db.putBatch([
      makeEntry('3001', { cachedAt: Date.now() - TTL_MS - 1000 }), // expired
      makeEntry('3002'), // fresh
    ])

    const entries = await db.getBatch(['3001', '3002'])
    expect(entries['3001']).toBeUndefined()
    expect(entries['3002']).toBeDefined()

    // The expired entry must have been evicted from the store itself.
    const raw = await rawGetAll(dbName)
    expect(raw.map((e) => e.tid)).toEqual(['3002'])
    db.close()
  })

  test('LRU：超过 500 条时按 cachedAt 淘汰最旧', async () => {
    const db = freshDb()
    const dbName = `umm-sehuatang-cache-test-${dbCounter}`

    const base = 1_700_000_000_000
    const batch: SehuatangDetailCacheEntry[] = []
    for (let i = 0; i < MAX_ENTRIES + 10; i++) {
      batch.push(makeEntry(`t${i}`, { cachedAt: base + i }))
    }
    await db.putBatch(batch)

    const raw = await rawGetAll(dbName)
    expect(raw.length).toBe(MAX_ENTRIES)

    const tids = new Set(raw.map((e) => e.tid))
    // Oldest 10 evicted (t0..t9), newest 500 kept (t10..t509).
    for (let i = 0; i < 10; i++) expect(tids.has(`t${i}`)).toBe(false)
    for (let i = 10; i < MAX_ENTRIES + 10; i++) expect(tids.has(`t${i}`)).toBe(true)
    db.close()
  })

  test('同 tid 重写幂等：覆盖更新且不产生重复条目', async () => {
    const db = freshDb()
    const dbName = `umm-sehuatang-cache-test-${dbCounter}`

    const t1 = Date.now() - 1000
    await db.putBatch([makeEntry('4001', { imageUrl: 'https://img.example/old.jpg', cachedAt: t1 })])

    const t2 = Date.now()
    await db.putBatch([makeEntry('4001', { imageUrl: 'https://img.example/new.jpg', cachedAt: t2 })])

    const entries = await db.getBatch(['4001'])
    expect(entries['4001'].imageUrl).toBe('https://img.example/new.jpg')
    expect(entries['4001'].cachedAt).toBe(t2)

    const raw = await rawGetAll(dbName)
    expect(raw.filter((e) => e.tid === '4001').length).toBe(1)
    db.close()
  })

  test('空输入：getBatch([]) → {}，putBatch([]) → no-op', async () => {
    const db = freshDb()
    expect(await db.getBatch([])).toEqual({})
    await db.putBatch([]) // must not throw
    db.close()
  })
})
