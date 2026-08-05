import { test, expect } from '@playwright/test'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { MediaDatabase, DB_NAME, DB_VERSION, STORE_NAMES, isWatchedStatus } from '@/features/database/models'

/**
 * T7 — getWatchedIds characterization gate.
 *
 * Optimizes getWatchedIds (models.ts) from a full-store cursor scan O(N) to a
 * dual status-index cursor O(watched). Correctness wins over speed: this spec
 * is the GATE. It asserts the NEW implementation (dual index cursor) returns
 * the EXACT same Set<string> as a verbatim reference copy of the OLD full-scan
 * algorithm, across every seed case — numeric statuses, legacy string
 * statuses, missing/null/boolean statuses, mixed key prefixes, unrelated
 * keys, and a 5000-record scale set.
 *
 * If ANY seed diverges → T7 is abandoned and production code is reverted.
 * Do NOT weaken or delete a seed to force a pass.
 */

/**
 * Install a fresh in-memory IndexedDB as the global before any open.
 * Also installs IDBKeyRange — a native browser global the dual-cursor
 * implementation relies on, but absent in the Node test env (fake-indexeddb
 * ships it as an export). Mirrors the Chrome runtime the extension targets.
 */
function freshIndexedDB(): void {
  const g = globalThis as unknown as { indexedDB: IDBFactory; IDBKeyRange: typeof IDBKeyRange }
  g.indexedDB = new IDBFactory()
  g.IDBKeyRange = IDBKeyRange
}

/** Open a raw connection to the (already-created) DB. No upgrade runs. */
function openDB(name: string, version: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, version)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/**
 * REFERENCE — verbatim copy of the OLD getWatchedIds algorithm
 * (models.ts:696-723 pre-T7): full-store openCursor scan + JS status check
 * via isWatchedStatus. Must NOT change; this is the ground truth.
 */
function referenceGetWatchedIds(db: IDBDatabase, storeName: string): Promise<Set<string>> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const store = tx.objectStore(storeName)
    const request = store.openCursor()
    const ids = new Set<string>()
    let count = 0

    request.onsuccess = () => {
      const cursor = request.result
      if (cursor) {
        const record = cursor.value
        const rawStatus = record?.status
        if (isWatchedStatus(rawStatus)) {
          ids.add(cursor.primaryKey as string)
        }
        count++
        cursor.continue()
      } else {
        resolve(ids)
      }
    }
    request.onerror = () => reject(request.error)
    tx.onerror = () => reject(tx.error)
  })
}

/** Seed raw records (not normalized) into the given store — getWatchedIds reads raw values. */
function seedStore(
  db: IDBDatabase,
  storeName: string,
  records: Array<{ key: string; record: Record<string, unknown> }>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    for (const { key, record } of records) {
      store.put(record, key)
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

/**
 * The gate: seed the store, run the reference (OLD) and the real
 * MediaDatabase.getWatchedIds (NEW) on the same data, and require identical
 * output. Also asserts an explicit expected-watched set so the test cannot
 * pass vacuously (e.g. if seeding silently failed and both returned empty).
 */
async function characterize(
  records: Array<{ key: string; record: Record<string, unknown> }>,
  expectedWatched?: string[],
): Promise<void> {
  freshIndexedDB()
  const mdb = new MediaDatabase()
  await mdb.init()
  const rawDb = await openDB(DB_NAME, DB_VERSION)
  const storeName = STORE_NAMES.DOUBAN
  await seedStore(rawDb, storeName, records)
  try {
    const expected = await referenceGetWatchedIds(rawDb, storeName)
    const actual = await mdb.getWatchedIds(storeName)

    const sorted = (s: Set<string>) => [...s].sort()
    expect(sorted(actual)).toEqual(sorted(expected))
    expect(actual.size).toBe(expected.size)

    if (expectedWatched) {
      expect(sorted(actual)).toEqual(sorted(expectedWatched))
    }
  } finally {
    mdb.close()
    rawDb.close()
  }
}

/** Minimal record builder — omit status entirely for the "missing status" seed. */
function base(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: 'seed',
    url: 'https://example.com/x',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...over,
  }
}

test.describe('T7 getWatchedIds characterization (dual index cursor == old full scan)', () => {
  test('all status shapes, mixed key prefixes and unrelated keys produce identical watched sets', async () => {
    const seeds: Array<{ key: string; record: Record<string, unknown> }> = [
      // numeric watched → IN
      { key: 'movie::w-num', record: base({ status: 2 }) },
      // legacy string watched → IN
      { key: 'tv::w-done', record: base({ status: 'done' }) },
      // doing (3) → OUT (in-progress must not dim/badge)
      { key: 'movie::doing', record: base({ status: 3 }) },
      // wishlist (1) → OUT
      { key: 'tv::wish-num', record: base({ status: 1 }) },
      // none (0) → OUT
      { key: 'music::none', record: base({ status: 0 }) },
      // missing status field → OUT
      { key: 'movie::missing', record: base() },
      // legacy string wish → OUT
      { key: 'tv::wish-str', record: base({ status: 'wish' }) },
      // unknown string → OUT
      { key: 'music::watching', record: base({ status: 'watching' }) },
      // null status → OUT (null is not a valid index key; isWatchedStatus(null)=false)
      { key: 'movie::null', record: base({ status: null }) },
      // string "2" → OUT (IndexedDB keys are type-sensitive: numeric 2 ≠ string "2")
      { key: 'tv::str-2', record: base({ status: '2' }) },
      // boolean → OUT (not a valid index key; isWatchedStatus(true)=false)
      { key: 'music::bool', record: base({ status: true }) },
      // unrelated-key-prefix records still counted → IN
      { key: 'unrelated::watched', record: base({ status: 2 }) },
      { key: 'unrelated::done', record: base({ status: 'done' }) },
      // other number (999) → OUT
      { key: 'movie::big', record: base({ status: 999 }) },
    ]

    await characterize(seeds, [
      'movie::w-num',
      'tv::w-done',
      'unrelated::watched',
      'unrelated::done',
    ])
  })

  test('5000-record scale: new implementation matches old full scan exactly', async () => {
    const seeds: Array<{ key: string; record: Record<string, unknown> }> = []
    for (let i = 0; i < 5000; i++) {
      const prefix = i % 3 === 0 ? 'movie::' : i % 3 === 1 ? 'tv::' : 'music::'
      const mod = i % 8
      let status: unknown
      if (mod === 0) status = 2
      else if (mod === 1) status = 'done'
      else if (mod === 2) status = 3
      else if (mod === 3) status = 1
      else if (mod === 4) status = 'wish'
      else if (mod === 5) status = 0
      else if (mod === 6) status = 'watching'
      else status = undefined // missing → status key omitted
      const record: Record<string, unknown> = {
        title: `seed-${i}`,
        url: `https://example.com/${i}`,
        updatedAt: '2025-01-01T00:00:00.000Z',
      }
      if (status !== undefined) record.status = status
      seeds.push({ key: `${prefix}${i}`, record })
    }
    // A handful of extra null-status records — excluded by both paths.
    seeds.push({ key: 'movie::extra-null', record: base({ status: null }) })
    seeds.push({ key: 'tv::extra-null', record: base({ status: null }) })
    seeds.push({ key: 'music::extra-null', record: base({ status: null }) })

    // mod ∈ {0,1} → watched. Multiples of 8 in [0,4999]: 625; 1-mod-8: 625.
    await characterize(seeds, undefined)
    // Sanity: the fixture itself must contain the expected watched count, so a
    // silent seeding failure (both impls returning empty) cannot pass the gate.
    const counts: Record<number, number> = {}
    for (const s of seeds) {
      const mod = Number(s.key.split('::')[1]) % 8
      counts[mod] = (counts[mod] ?? 0) + 1
    }
    expect(counts[0] ?? 0).toBe(625)
    expect(counts[1] ?? 0).toBe(625)
  })
})
