import { test, expect } from '@playwright/test'
import { CacheManager } from '@/features/cache/cache-manager'
import { DataScheduler } from '@/features/data-scheduler/data-scheduler'
import { handleDbGetBulk, handleDbPut, handleDbSyncPageRecord, type DbHandlerContext } from '@/entrypoints/background/handlers/db'
import type { MediaDatabase } from '@/features/database/models'
import { RecordService } from '@/domain/record/RecordService'
import type { IRecordRepository } from '@/domain/record/IRecordRepository'
import type { StoreRecord } from '@/types'

/**
 * T8 — DB_GET_BULK cache invalidation regression.
 *
 * bulk: entries (`bulk:{store}:{key1,key2,...}`) were cached with a 5s TTL
 * but never invalidated on writes, so a just-marked status didn't show on
 * list pages for up to 5s. The fix clears the whole `bulk:{store}:` prefix
 * via invalidateByPattern on every write (handleDbPut/handleDbDelete/
 * handleDbSyncPageRecord all route through invalidateStoreCaches).
 *
 * These tests drive the REAL background handlers (handleDbGetBulk +
 * handleDbPut) against a real CacheManager + DataScheduler with a stubbed
 * IndexedDB — exercising the exact regression path without a browser.
 */

// ==================== Fixture ====================

/** IndexedDB stub: batchGet returns a record for every requested key; put is a no-op. */
function createStubDb(): MediaDatabase {
  return {
    batchGet: async (_storeName: string, keys: IDBValidKey[]) => {
      const map = new Map<IDBValidKey, StoreRecord>()
      for (const k of keys) map.set(k, { status: 2, rating: 8 } as StoreRecord)
      return map
    },
    put: async () => {},
  } as unknown as MediaDatabase
}

function createContext(): DbHandlerContext {
  const cacheManager = new CacheManager()
  const scheduler = new DataScheduler(cacheManager)
  return { db: createStubDb(), scheduler, recordService: null }
}

const PUT_RECORD = { status: 3, rating: 0 } as StoreRecord

// ==================== Regression: bulk cache must die on write ====================

test.describe('bulk: cache invalidation on write (T8 regression)', () => {
  test('DB_PUT clears a previously-cached bulk entry for that store immediately', async () => {
    const ctx = createContext()
    const bulkKey = 'bulk:douban_records:movie::1,movie::2'

    // 1. A list page does a bulk read → entry cached with 5s TTL
    await handleDbGetBulk({ storeName: 'douban_records', keys: ['movie::1', 'movie::2'] }, ctx)
    expect(ctx.scheduler.cacheManager!.has('scheduler', bulkKey)).toBe(true)

    // 2. User marks a status → DB_PUT write
    await handleDbPut({ storeName: 'douban_records', key: 'movie::1', record: PUT_RECORD }, ctx)

    // 3. Bulk entry must be gone right away — no 5s stale window
    expect(ctx.scheduler.cacheManager!.has('scheduler', bulkKey)).toBe(false)
  })

  test('bulk invalidation is scoped to the written store', async () => {
    const ctx = createContext()
    const cm = ctx.scheduler.cacheManager!

    await handleDbGetBulk({ storeName: 'douban_records', keys: ['movie::1'] }, ctx)
    await handleDbGetBulk({ storeName: 'imdb_records', keys: ['tt0111161'] }, ctx)

    await handleDbPut({ storeName: 'douban_records', key: 'movie::1', record: PUT_RECORD }, ctx)

    // Written store → cleared
    expect(cm.has('scheduler', 'bulk:douban_records:movie::1')).toBe(false)
    // Unrelated store → untouched
    expect(cm.has('scheduler', 'bulk:imdb_records:tt0111161')).toBe(true)
  })

  test('ptcache-bulk entries survive (deliberately TTL-capped)', async () => {
    const ctx = createContext()
    const cm = ctx.scheduler.cacheManager!
    const ptKey = 'ptcache-bulk:https://pt.example.org/details.php?id=1,https://pt.example.org/details.php?id=2'

    // Seed the PT batch lookup the way handlePtIdCacheGetBulk would
    await cm.set('scheduler', ptKey, { 'https://pt.example.org/details.php?id=1': { id: '1' } })

    await handleDbPut({ storeName: 'douban_records', key: 'movie::1', record: PUT_RECORD }, ctx)

    // `bulk:{store}:` pattern must not collide with the `ptcache-bulk:` prefix
    expect(cm.has('scheduler', ptKey)).toBe(true)
  })
})

// ==================== Guard: existing invalidation behavior intact ====================

// ==================== Regression: linked-store invalidation on sync ====================

/** EVENT_BUS message captured from broadcast() via a stubbed chrome.runtime. */
interface RecordedMessage {
  type: string
  event?: string
  data?: unknown
}

test.describe('linked-store invalidation + broadcast on DB_SYNC_PAGE_RECORD', () => {
  const sent: RecordedMessage[] = []

  test.beforeEach(() => {
    sent.length = 0
    const stub: { runtime: { sendMessage: (msg: RecordedMessage) => void } } = {
      runtime: { sendMessage: (msg) => { sent.push(msg) } },
    }
    Reflect.set(globalThis, 'chrome', stub)
  })

  test.afterEach(() => {
    Reflect.deleteProperty(globalThis, 'chrome')
  })

  test('sync invalidates linked imdb store cache keys and broadcasts record:updated', async () => {
    const ctx = createContext()
    const cm = ctx.scheduler.cacheManager!
    const savedStores: string[] = []
    const repo: IRecordRepository = {
      findByKey: async () => null,
      save: async (storeName: string) => { savedStores.push(storeName) },
    }
    ctx.recordService = new RecordService(repo)

    // Seed the linked store the way the PT dimmer's watched:/bulk: reads would
    await cm.set('scheduler', 'get:imdb_records:tt0111161', { status: 2 })
    await cm.set('scheduler', 'all:imdb_records', [{ key: 'tt0111161' }])
    await cm.set('scheduler', 'count:imdb_records', 1)
    await cm.set('scheduler', 'watched:imdb_records', ['tt0111161'])
    await cm.set('scheduler', 'bulk:imdb_records:tt0111161', [{ key: 'tt0111161' }])
    // ... and the primary store
    await cm.set('scheduler', 'watched:douban_records', ['movie::1'])

    const result = await handleDbSyncPageRecord({
      platform: 'douban',
      key: 'movie::1',
      record: { status: 2, rating: 8 } as StoreRecord,
      linked: [{ platform: 'imdb', key: 'tt0111161', url: 'https://www.imdb.com/title/tt0111161/' }],
    }, ctx)

    expect(result.success).toBe(true)
    // RecordService side-effect wrote the linked platform record
    expect(savedStores).toEqual(['douban', 'imdb'])

    // Linked store cache entries must be gone — a stale watched: read would
    // keep the PT dimmer from dimming the just-created imdb record
    for (const key of [
      'get:imdb_records:tt0111161',
      'all:imdb_records',
      'count:imdb_records',
      'watched:imdb_records',
      'bulk:imdb_records:tt0111161',
    ]) {
      expect(cm.has('scheduler', key), `${key} must be invalidated for the linked store`).toBe(false)
    }
    // Primary store still invalidated
    expect(cm.has('scheduler', 'watched:douban_records')).toBe(false)

    // Broadcasts: primary first, then linked store
    const updates = sent.filter((m) => m.event === 'record:updated')
    expect(updates).toEqual([
      { type: 'EVENT_BUS', event: 'record:updated', data: { storeName: 'douban_records', key: 'movie::1' } },
      { type: 'EVENT_BUS', event: 'record:updated', data: { storeName: 'imdb_records', key: 'tt0111161' } },
    ])
  })
})

test.describe('existing per-store invalidation still applies on write', () => {
  test('get:/all:/count:/watched: keys are cleared by DB_PUT', async () => {
    const ctx = createContext()
    const cm = ctx.scheduler.cacheManager!
    const store = 'douban_records'

    await cm.set('scheduler', `get:${store}:movie::1`, { status: 2 })
    await cm.set('scheduler', `all:${store}`, [{ key: 'movie::1' }])
    await cm.set('scheduler', `count:${store}`, 1)
    await cm.set('scheduler', `watched:${store}`, ['movie::1'])

    await handleDbPut({ storeName: store, key: 'movie::1', record: PUT_RECORD }, ctx)

    for (const key of [`get:${store}:movie::1`, `all:${store}`, `count:${store}`, `watched:${store}`]) {
      expect(cm.has('scheduler', key), `${key} must be invalidated on write`).toBe(false)
    }
  })
})
