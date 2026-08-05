import { test, expect } from '@playwright/test'
import {
  probeCacheKey,
  filterFreshProbe,
  probeCacheGetBulk,
  getWatchedIdSets,
  writeBatchedSets,
  type MukakuStoreApi,
  type WatchedIdCache,
} from '@/entrypoints/content/handlers/mukaku/cache'
import { MUKAKU_CONFIG } from '@/entrypoints/content/handlers/mukaku/config'

/**
 * S2/S3 — mukaku dimmer batch cache APIs.
 *
 * The per-card loop currently issues one IndexedDB message per card
 * (setAddItem/setDeleteItem/expMapAdd read-modify-write, probeCacheGet,
 * getIdSet). These tests lock the new batch surface:
 *  - probeCacheKey / filterFreshProbe are the pure building blocks;
 *  - probeCacheGetBulk collapses N probeCacheGet messages into ONE dbGetBulk;
 *  - getWatchedIdSets collapses the two getIdSet calls into ONE
 *    dbGetWatchedIds message with a 30s in-memory cache;
 *  - writeBatchedSets flushes both sets in EXACTLY 2 writes with the same
 *    stored shapes setAddItem/expMapAdd produce (string[] / Record<string,number>).
 *
 * The store is injected via the MukakuStoreApi seam (same pattern as
 * record-cache-core's StoreApi) so every test observes exact message counts.
 */

interface FakeCalls {
  dbGetBulk: Array<[storeName: string, keys: string[]]>
  dbGetWatchedIds: Array<[storeNames: string[]]>
  dbPut: Array<[storeName: string, key: string, value: unknown]>
}

function createFakeStore(
  handlers: {
    dbGetBulk?: (storeName: string, keys: string[]) => Array<{ key: string; record: unknown }>
    dbGetWatchedIds?: (storeNames: string[]) => Record<string, string[]>
  } = {},
): { store: MukakuStoreApi; calls: FakeCalls } {
  const calls: FakeCalls = {
    dbGetBulk: [],
    dbGetWatchedIds: [],
    dbPut: [],
  }
  const store: MukakuStoreApi = {
    dbGetBulk: async (storeName, keys) => {
      calls.dbGetBulk.push([storeName, keys])
      return handlers.dbGetBulk ? handlers.dbGetBulk(storeName, keys) : []
    },
    dbGetWatchedIds: async (storeNames) => {
      calls.dbGetWatchedIds.push(storeNames)
      return handlers.dbGetWatchedIds ? handlers.dbGetWatchedIds(storeNames) : {}
    },
    dbPut: async (storeName, key, value) => {
      calls.dbPut.push([storeName, key, value])
    },
  }
  return { store, calls }
}

test.describe('probeCacheKey', () => {
  test('prefixed with the probe cache key constant', () => {
    expect(probeCacheKey('12345')).toBe(`${MUKAKU_CONFIG.PROBE_CACHE_KEY}:12345`)
  })
})

test.describe('filterFreshProbe', () => {
  test('returns a fresh entry as-is', () => {
    const now = 1_000_000_000
    const fresh = { doubanId: 'd1', imdbId: 'tt1', ts: now - 1000 }
    expect(filterFreshProbe(fresh, now)).toEqual(fresh)
  })

  test('entry exactly TTL old is still fresh (expiry is strictly greater)', () => {
    const now = 1_000_000_000
    const boundary = { doubanId: null, imdbId: null, ts: now - MUKAKU_CONFIG.PROBE_CACHE_TTL_MS }
    expect(filterFreshProbe(boundary, now)).toEqual(boundary)
  })

  test('returns null for an expired entry', () => {
    const now = 1_000_000_000
    const expired = { doubanId: 'd2', imdbId: null, ts: now - MUKAKU_CONFIG.PROBE_CACHE_TTL_MS - 1 }
    expect(filterFreshProbe(expired, now)).toBeNull()
  })

  test('returns null for malformed values (null / primitive / missing ts)', () => {
    const now = 1_000_000_000
    expect(filterFreshProbe(null, now)).toBeNull()
    expect(filterFreshProbe('not an object', now)).toBeNull()
    expect(filterFreshProbe({ doubanId: 'd3' }, now)).toBeNull()
  })
})

test.describe('probeCacheGetBulk', () => {
  test('issues exactly ONE dbGetBulk with all probe keys and returns a Map keyed by bare mvId', async () => {
    const now = Date.now()
    const entries = [
      { key: `${MUKAKU_CONFIG.PROBE_CACHE_KEY}:111`, record: { doubanId: 'd1', imdbId: 'tt1', ts: now - 1000 } },
      { key: `${MUKAKU_CONFIG.PROBE_CACHE_KEY}:222`, record: { doubanId: 'd2', imdbId: null, ts: now - 1000 } },
      // expired → must be dropped
      { key: `${MUKAKU_CONFIG.PROBE_CACHE_KEY}:333`, record: { doubanId: 'd3', imdbId: 'tt3', ts: now - MUKAKU_CONFIG.PROBE_CACHE_TTL_MS - 1000 } },
      // malformed → must be dropped
      { key: `${MUKAKU_CONFIG.PROBE_CACHE_KEY}:444`, record: { doubanId: 'd4' } },
    ]
    const { store, calls } = createFakeStore({
      dbGetBulk: (_storeName, keys) => entries.filter((e) => keys.includes(e.key)),
    })

    const map = await probeCacheGetBulk(['111', '222', '333', '444'], store)

    expect(calls.dbGetBulk).toHaveLength(1)
    expect(calls.dbGetBulk[0]).toEqual([
      'ttl_cache',
      [
        `${MUKAKU_CONFIG.PROBE_CACHE_KEY}:111`,
        `${MUKAKU_CONFIG.PROBE_CACHE_KEY}:222`,
        `${MUKAKU_CONFIG.PROBE_CACHE_KEY}:333`,
        `${MUKAKU_CONFIG.PROBE_CACHE_KEY}:444`,
      ],
    ])
    expect([...map.keys()]).toEqual(['111', '222'])
    expect(map.get('111')).toEqual({ doubanId: 'd1', imdbId: 'tt1', ts: now - 1000 })
    expect(map.get('222')).toEqual({ doubanId: 'd2', imdbId: null, ts: now - 1000 })
  })

  test('empty input returns an empty Map without any DB call', async () => {
    const { store, calls } = createFakeStore()

    const map = await probeCacheGetBulk([], store)

    expect(map.size).toBe(0)
    expect(calls.dbGetBulk).toHaveLength(0)
  })
})

test.describe('getWatchedIdSets', () => {
  test('returns cached sets without any DB call while fresh (within 30s TTL)', async () => {
    const { store, calls } = createFakeStore()
    const cache: WatchedIdCache = {
      ts: Date.now() - 1000,
      movieDoubanIds: new Set(['d1']),
      imdbIds: new Set(['tt1']),
    }

    const sets = await getWatchedIdSets(cache, store)

    expect(calls.dbGetWatchedIds).toHaveLength(0)
    expect(sets.movieDoubanIds).toBe(cache.movieDoubanIds)
    expect(sets.imdbIds).toBe(cache.imdbIds)
  })

  test('refreshes after TTL with exactly ONE dbGetWatchedIds over both stores, parsing movie:: prefixes', async () => {
    const stale: WatchedIdCache = {
      ts: Date.now() - MUKAKU_CONFIG.WATCHED_ID_CACHE_TTL - 1,
      movieDoubanIds: new Set(['stale']),
      imdbIds: new Set(['ttStale']),
    }
    const { store, calls } = createFakeStore({
      dbGetWatchedIds: (storeNames) => ({
        douban_records: ['movie::d1', 'music::m1', 'movie::d2', 'unprefixed-key'],
        imdb_records: ['movie::tt1', 'movie::tt2'],
      }),
    })

    const sets = await getWatchedIdSets(stale, store)

    expect(calls.dbGetWatchedIds).toHaveLength(1)
    expect(calls.dbGetWatchedIds[0]).toEqual(['douban_records', 'imdb_records'])
    expect([...sets.movieDoubanIds].sort()).toEqual(['d1', 'd2'])
    expect([...sets.imdbIds].sort()).toEqual(['tt1', 'tt2'])
  })

  test('cache exactly at TTL age is refreshed (fresh requires strictly less than 30s)', async () => {
    const atTtl: WatchedIdCache = {
      ts: Date.now() - MUKAKU_CONFIG.WATCHED_ID_CACHE_TTL,
      movieDoubanIds: new Set(['stale']),
      imdbIds: new Set(['ttStale']),
    }
    const { store, calls } = createFakeStore({
      dbGetWatchedIds: () => ({
        douban_records: [],
        imdb_records: [],
      }),
    })

    await getWatchedIdSets(atTtl, store)

    expect(calls.dbGetWatchedIds).toHaveLength(1)
  })

  test('no cache param always refreshes (single message)', async () => {
    const { store, calls } = createFakeStore({
      dbGetWatchedIds: () => ({ douban_records: [], imdb_records: [] }),
    })

    await getWatchedIdSets(undefined, store)

    expect(calls.dbGetWatchedIds).toHaveLength(1)
  })
})

test.describe('writeBatchedSets', () => {
  test('flushes watched Set and unwatched map in exactly 2 writes with the stored shapes', async () => {
    const { store, calls } = createFakeStore()
    const watched = new Set(['mv1', 'mv2'])
    const unwatched = { mv3: 1_234_567_890 }

    await writeBatchedSets(watched, unwatched, store)

    expect(calls.dbPut).toHaveLength(2)
    // watched must be a string[] (the shape setAddItem persists), not a Set
    expect(calls.dbPut[0]).toEqual([
      'ttl_cache',
      MUKAKU_CONFIG.WATCHED_SET_KEY,
      ['mv1', 'mv2'],
    ])
    // unwatched must be the Record<string, number> shape expMapAdd persists
    expect(calls.dbPut[1]).toEqual([
      'ttl_cache',
      MUKAKU_CONFIG.UNWATCHED_TTL_KEY,
      { mv3: 1_234_567_890 },
    ])
  })

  test('accepts a plain array and preserves order', async () => {
    const { store, calls } = createFakeStore()

    await writeBatchedSets(['mv2', 'mv1'], {}, store)

    expect(calls.dbPut).toHaveLength(2)
    expect(calls.dbPut[0]).toEqual(['ttl_cache', MUKAKU_CONFIG.WATCHED_SET_KEY, ['mv2', 'mv1']])
    expect(calls.dbPut[1]).toEqual(['ttl_cache', MUKAKU_CONFIG.UNWATCHED_TTL_KEY, {}])
  })
})
