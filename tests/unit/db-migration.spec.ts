import { test, expect } from '@playwright/test'
import { IDBFactory } from 'fake-indexeddb'
import { MediaDatabase, DB_NAME, STORE_NAMES } from '@/features/database/models'

/**
 * v13 migration regression test — runs the REAL MediaDatabase against
 * fake-indexeddb (in-memory IndexedDB; the Node test env has no native
 * IndexedDB, so fake-indexeddb is installed as a devDependency for this).
 *
 * Regression covered: models.ts onupgradeneeded used to call
 * db.transaction() while the versionchange upgrade transaction was still
 * live, which throws InvalidStateError per spec and aborts the upgrade
 * (AbortError) — the DB open then fails and every data load reports
 * '数据加载失败'. The v13 migration now runs on request.transaction (the
 * upgrade transaction itself).
 */

/** Install a fresh in-memory IndexedDB as the global before any open. */
function freshIndexedDB(): void {
  const g = globalThis as unknown as { indexedDB: IDBFactory }
  g.indexedDB = new IDBFactory()
}

/** Seed a v12-shaped DB: legacy 'video::' keys in bilibili_records + sehuatang_avids entries. */
function createV12Database(): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 12)
    req.onupgradeneeded = (ev) => {
      const db = (ev.target as IDBOpenDBRequest).result
      // Mirror the v12 schema (the stores the v13 migration depends on).
      for (const name of [
        STORE_NAMES.DOUBAN,
        STORE_NAMES.IMDB,
        STORE_NAMES.NEODB,
        STORE_NAMES.TMDB,
        STORE_NAMES.BILIBILI,
        STORE_NAMES.YOUTUBE,
        STORE_NAMES.BANGUMI,
        STORE_NAMES.TTL_CACHE,
        STORE_NAMES.PT_ID_CACHE,
        STORE_NAMES.JAV_IDS,
        'sehuatang_avids',
      ]) {
        if (!db.objectStoreNames.contains(name)) {
          const store = db.createObjectStore(name)
          store.createIndex('status', 'status', { unique: false })
          store.createIndex('updatedAt', 'updatedAt', { unique: false })
        }
      }
    }
    req.onsuccess = () => {
      const db = req.result
      const legacyRecord = (id: string) => ({
        title: `B ${id}`,
        status: 2,
        rating: 8,
        url: `https://www.bilibili.com/video/${id}`,
        updatedAt: '2025-01-01T00:00:00.000Z',
      })
      const tx = db.transaction(
        [STORE_NAMES.BILIBILI, STORE_NAMES.JAV_IDS, 'sehuatang_avids'],
        'readwrite',
      )
      const bili = tx.objectStore(STORE_NAMES.BILIBILI)
      bili.put(legacyRecord('BV1xx'), 'video::BV1xx') // legacy prefix → movie::BV1xx
      bili.put(legacyRecord('BV2xx'), 'BV2xx') // bare key → movie::BV2xx
      bili.put(legacyRecord('BV3xx'), 'movie::BV3xx') // already canonical → unchanged
      const sehuatang = tx.objectStore('sehuatang_avids')
      sehuatang.put({ url: 'https://sehuatang.net/1', updatedAt: '2025-01-01T00:00:00.000Z' }, 'av1')
      sehuatang.put({ url: 'https://sehuatang.net/2', updatedAt: '2025-01-01T00:00:00.000Z' }, 'av2')
      // Pre-existing jav_ids entry must win over the stale copy.
      const jav = tx.objectStore(STORE_NAMES.JAV_IDS)
      jav.put({ url: 'https://javdb.com/1', updatedAt: '2025-02-01T00:00:00.000Z' }, 'av1')
      tx.oncomplete = () => {
        db.close()
        resolve()
      }
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    }
    req.onerror = () => reject(req.error)
  })
}

test.describe('DB v13 migration (upgrade transaction)', () => {
  test('opens at v13 from a v12 DB, normalizes keys, copies jav_ids without aborting', async () => {
    freshIndexedDB()
    await createV12Database()

    const mdb = new MediaDatabase()
    // Regression: before the fix this REJECTED (InvalidStateError/AbortError)
    // because onupgradeneeded created NEW transactions while the upgrade
    // transaction was still live.
    await mdb.init()

    // decision-3: legacy keys normalized to the canonical movie:: format.
    const bili = await mdb.getAll(STORE_NAMES.BILIBILI)
    const keys = bili.map((e) => e.key).sort()
    expect(keys).toEqual(['movie::BV1xx', 'movie::BV2xx', 'movie::BV3xx'])
    // Records are normalized on read (legacy seed → current schema version).
    expect(bili.every((e) => e.record.schemaVersion === 2)).toBe(true)

    // M4: sehuatang_avids copied into jav_ids; existing jav_ids entry wins.
    const jav = await mdb.getAll(STORE_NAMES.JAV_IDS)
    const javMap = new Map(jav.map((e) => [e.key, e.record as { url: string }]))
    expect(javMap.size).toBe(2)
    expect(javMap.get('av1')?.url).toBe('https://javdb.com/1') // NOT overwritten by stale copy
    expect(javMap.get('av2')?.url).toBe('https://sehuatang.net/2') // copied from legacy store

    // batchGet returns the same normalized shape as getAll.
    const got = await mdb.batchGet<{ schemaVersion?: number }>(STORE_NAMES.BILIBILI, [
      'movie::BV1xx',
      'missing::key',
    ])
    expect(got.get('movie::BV1xx')?.schemaVersion).toBe(2)
    expect(got.has('missing::key')).toBe(false)

    mdb.close()
  })
})
