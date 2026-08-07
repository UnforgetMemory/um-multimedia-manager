import { test, expect } from '@playwright/test'
import {
  probeCacheKey,
  filterFreshProbe,
  probeCacheGetBulk,
  getWatchedIdSets,
  cleanupLegacyMukakuCaches,
  type MukakuStoreApi,
  type WatchedIdCache,
} from '@/entrypoints/content/handlers/mukaku/cache'
import { MUKAKU_CONFIG } from '@/entrypoints/content/handlers/mukaku/config'

/**
 * S2/S3 — mukaku dimmer batch cache APIs.
 *
 * The judgment caches (watched/unwatched sets) were removed project-wide; the
 * remaining surface is the probe mapping cache + realtime watched-id reads:
 *  - probeCacheKey / filterFreshProbe are the pure building blocks;
 *  - probeCacheGetBulk collapses N probeCacheGet messages into ONE dbGetBulk;
 *  - getWatchedIdSets collapses the two per-provider lookups into ONE
 *    dbGetWatchedIds message with a 30s in-memory cache;
 *  - cleanupLegacyMukakuCaches deletes the two legacy judgment-cache keys
 *    (umm:cache:mukaku:watched / unwatched) exactly once each.
 *
 * The judgment caches are gone: a probe entry with BOTH ids null is never
 * trusted — it is a cache miss at read time (re-probe), both via
 * filterFreshProbe and probeCacheGetBulk.
 *
 * The store is injected via the MukakuStoreApi seam (same pattern as
 * record-cache-core's StoreApi) so every test observes exact message counts.
 */

interface FakeCalls {
  dbGetBulk: Array<[storeName: string, keys: string[]]>
  dbGetWatchedIds: Array<[storeNames: string[]]>
  dbPut: Array<[storeName: string, key: string, value: unknown]>
  dbDelete: Array<[storeName: string, key: string]>
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
    dbDelete: [],
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
    dbDelete: async (storeName, key) => {
      calls.dbDelete.push([storeName, key])
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
    const boundary = { doubanId: 'd1', imdbId: 'tt1', ts: now - MUKAKU_CONFIG.PROBE_CACHE_TTL_MS }
    expect(filterFreshProbe(boundary, now)).toEqual(boundary)
  })

  test('returns null for a fresh entry with both ids null (null-null is never trusted as a hit)', () => {
    const now = 1_000_000_000
    const nullNull = { doubanId: null, imdbId: null, ts: now - 1000 }
    expect(filterFreshProbe(nullNull, now)).toBeNull()
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

  test('drops a fresh {doubanId:null, imdbId:null} entry from the result Map (null-null is a cache miss)', async () => {
    const now = Date.now()
    const entries = [
      { key: `${MUKAKU_CONFIG.PROBE_CACHE_KEY}:111`, record: { doubanId: 'd1', imdbId: null, ts: now - 1000 } },
      { key: `${MUKAKU_CONFIG.PROBE_CACHE_KEY}:222`, record: { doubanId: null, imdbId: null, ts: now - 1000 } },
    ]
    const { store } = createFakeStore({
      dbGetBulk: (_storeName, keys) => entries.filter((e) => keys.includes(e.key)),
    })

    const map = await probeCacheGetBulk(['111', '222'], store)

    expect([...map.keys()]).toEqual(['111'])
    expect(map.has('222')).toBe(false)
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

test.describe('cleanupLegacyMukakuCaches', () => {
  test('deletes exactly the two legacy judgment-cache keys from ttl_cache', async () => {
    const { store, calls } = createFakeStore()

    await cleanupLegacyMukakuCaches(store)

    expect(calls.dbDelete).toHaveLength(2)
    expect(calls.dbDelete[0]).toEqual(['ttl_cache', 'umm:cache:mukaku:watched'])
    expect(calls.dbDelete[1]).toEqual(['ttl_cache', 'umm:cache:mukaku:unwatched'])
  })
})
