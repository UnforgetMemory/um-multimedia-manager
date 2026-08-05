/**
 * Database CRUD message handlers for background Service Worker.
 *
 * Handles all DB_* message types: GET, PUT, DELETE, GET_ALL, QUERY,
 * COUNT, GET_WATCHED_IDS, SYNC_PAGE_RECORD, and PT_ID_CACHE operations.
 */

import type { DataScheduler } from '@/features/data-scheduler/data-scheduler'
import type { MediaDatabase } from '@/features/database/models'
import { RECORD_STORES, STORE_NAMES } from '@/features/database/models'
import { broadcast } from '@/utils/event-bus'
import { warnLog } from '@/utils/logger'
import { RecordService } from '@/domain/record/RecordService'
import { StoreRecord } from '@/domain/record/StoreRecord'
import type { MessagePayloadMap } from '@/types'

/** Allowed store names for generic DB message handlers */
const ALLOWED_DB_STORES = new Set<string>([
  ...RECORD_STORES,
  STORE_NAMES.TTL_CACHE,
  STORE_NAMES.PT_ID_CACHE,
  STORE_NAMES.JAV_IDS,
])

function isAllowedStore(storeName: string): boolean {
  return ALLOWED_DB_STORES.has(storeName)
}

/**
 * Invalidate scheduler caches affected by a write to a record store.
 *
 * L5: writes used to invalidate only get:/all: keys, leaving count: and
 * watched: stale until their TTL (~5-10s). T8: bulk: entries (keyed by
 * key-set, `bulk:{store}:{key1,key2,...}`) were never invalidated — a write
 * could leave them stale for the full 5s TTL, so a just-marked status didn't
 * show on list pages. Since a write can affect any subset of keys, the whole
 * `bulk:{store}:` prefix is cleared via pattern invalidation. ptcache-bulk
 * deliberately stays TTL-capped (short-lived PT lookups, batch key churn
 * makes invalidation uneconomical).
 */
function invalidateStoreCaches(ctx: DbHandlerContext, storeName: string, key: string): void {
  ctx.scheduler.cacheManager?.invalidate('scheduler', `get:${storeName}:${key}`)
  ctx.scheduler.cacheManager?.invalidate('scheduler', `all:${storeName}`)
  ctx.scheduler.cacheManager?.invalidate('scheduler', `count:${storeName}`)
  ctx.scheduler.cacheManager?.invalidate('scheduler', `watched:${storeName}`)
  // bulk: keys embed the requested key-set — a single write can stale any
  // combination, so clear by store prefix (matches `bulk:{store}:{keys}`).
  ctx.scheduler.cacheManager?.invalidateByPattern('scheduler', `bulk:${storeName}:`)
}

export interface DbHandlerContext {
  db: MediaDatabase
  scheduler: DataScheduler
  recordService: RecordService | null
}

// ==================== Core CRUD ====================

export async function handleDbGet(
  payload: MessagePayloadMap['DB_GET'],
  ctx: DbHandlerContext,
) {
  if (!isAllowedStore(payload.storeName)) return { success: false, error: 'Invalid store name' }
  const record = await ctx.scheduler.schedule(
    () => ctx.db.get(payload.storeName, payload.key),
    { priority: 'HIGH', storeName: payload.storeName, cacheKey: `get:${payload.storeName}:${payload.key}`, cacheTTL: 5000 },
  )
  return { success: true, record }
}

export async function handleDbPut(
  payload: MessagePayloadMap['DB_PUT'],
  ctx: DbHandlerContext,
) {
  if (!isAllowedStore(payload.storeName)) return { success: false, error: 'Invalid store name' }
  const putStore = payload.storeName
  const putKey = payload.key
  await ctx.scheduler.schedule(
    () => ctx.db.put(putStore, putKey, payload.record),
    { priority: 'HIGH', storeName: putStore, cacheKey: `put:${putStore}:${putKey}`, invalidateCache: true },
  )
  invalidateStoreCaches(ctx, putStore, putKey)
  broadcast('record:updated', { storeName: putStore, key: putKey })
  return { success: true }
}

export async function handleDbDelete(
  payload: MessagePayloadMap['DB_DELETE'],
  ctx: DbHandlerContext,
) {
  if (!isAllowedStore(payload.storeName)) return { success: false, error: 'Invalid store name' }
  const delStore = payload.storeName
  const delKey = payload.key
  await ctx.scheduler.schedule(
    () => ctx.db.delete(delStore, delKey),
    { priority: 'HIGH', storeName: delStore, cacheKey: `delete:${delStore}:${delKey}`, invalidateCache: true },
  )
  invalidateStoreCaches(ctx, delStore, delKey)
  broadcast('record:deleted', { storeName: delStore, key: delKey })
  return { success: true }
}

export async function handleDbGetAll(
  payload: MessagePayloadMap['DB_GET_ALL'],
  ctx: DbHandlerContext,
) {
  if (!isAllowedStore(payload.storeName)) return { success: false, error: 'Invalid store name' }
  const entries = await ctx.scheduler.schedule(
    () => ctx.db.getAll(payload.storeName),
    { priority: 'MEDIUM', storeName: payload.storeName, cacheKey: `all:${payload.storeName}`, cacheTTL: 5000 },
  )
  return { success: true, entries }
}

export async function handleDbGetBulk(
  payload: MessagePayloadMap['DB_GET_BULK'],
  ctx: DbHandlerContext,
) {
  if (!isAllowedStore(payload.storeName)) return { success: false, error: 'Invalid store name' }
  const { storeName, keys } = payload
  if (keys.length === 0) return { success: true, entries: [] }
  const recordMap = await ctx.scheduler.schedule(
    () => ctx.db.batchGet(storeName, keys),
    { priority: 'MEDIUM', storeName, cacheKey: `bulk:${storeName}:${keys.join(',')}`, cacheTTL: 5000 },
  )
  // Missing keys are omitted — batchGet only returns found records.
  const entries = Array.from(recordMap, ([key, record]) => ({ key: String(key), record }))
  return { success: true, entries }
}

export async function handleDbQuery(
  payload: MessagePayloadMap['DB_QUERY'],
  ctx: DbHandlerContext,
) {
  if (!isAllowedStore(payload.storeName)) return { success: false, error: 'Invalid store name' }
  const entries = await ctx.scheduler.schedule(
    () => ctx.db.query(payload.storeName, payload.indexName, payload.value),
    { priority: 'MEDIUM', storeName: payload.storeName },
  )
  return { success: true, entries }
}

export async function handleDbCount(
  payload: MessagePayloadMap['DB_COUNT'],
  ctx: DbHandlerContext,
) {
  if (!isAllowedStore(payload.storeName)) return { success: false, error: 'Invalid store name' }
  const count = await ctx.scheduler.schedule(
    () => ctx.db.count(payload.storeName),
    { priority: 'LOW', storeName: payload.storeName, cacheKey: `count:${payload.storeName}`, cacheTTL: 5000 },
  )
  return { success: true, count }
}

export async function handleDbGetWatchedIds(
  payload: MessagePayloadMap['DB_GET_WATCHED_IDS'],
  ctx: DbHandlerContext,
) {
  const { storeNames } = payload
  const results: Record<string, string[]> = {}
  for (const storeName of storeNames) {
    if (!isAllowedStore(storeName)) {
      warnLog(`DB_GET_WATCHED_IDS: skipped disallowed store "${storeName}"`)
      continue
    }
    const ids = await ctx.scheduler.schedule(
      () => ctx.db.getWatchedIds(storeName),
      { priority: 'HIGH', storeName, cacheKey: `watched:${storeName}`, cacheTTL: 10000 },
    )
    results[storeName] = Array.from(ids as Set<string>)
  }
  return { success: true, results }
}

export async function handleDbSyncPageRecord(
  payload: MessagePayloadMap['DB_SYNC_PAGE_RECORD'],
  ctx: DbHandlerContext,
) {
  const syncPlatform = payload.platform
  if (!isAllowedStore(`${syncPlatform}_records`)) return { success: false, error: 'Invalid platform' }
  if (payload.linked && Array.isArray(payload.linked)) {
    for (const link of payload.linked) {
      if (!isAllowedStore(`${link.platform}_records`)) {
        return { success: false, error: 'Invalid linked platform' }
      }
    }
  }
  const syncStoreName = `${syncPlatform}_records`
  const syncKey = payload.key
  if (!ctx.recordService) return { success: false, error: 'Service not ready' }
  const rs = ctx.recordService
  const domainRecord = StoreRecord.fromSnapshot(payload.record)
  const syncResult = await ctx.scheduler.schedule(
    () => rs.syncRecord(
      syncPlatform,
      syncKey,
      domainRecord,
      payload.linked?.map(l => ({ platform: l.platform, key: l.key, url: l.url })),
    ),
    { priority: 'HIGH', storeName: syncStoreName, cacheKey: `sync:${syncPlatform}:${syncKey}`, invalidateCache: true },
  )
  invalidateStoreCaches(ctx, syncStoreName, syncKey)
  broadcast('record:updated', { storeName: syncStoreName, key: syncKey })
  return { success: true, result: syncResult }
}

// ==================== PT ID Cache ====================

export async function handlePtIdCacheGet(
  payload: MessagePayloadMap['PT_ID_CACHE_GET'],
  ctx: DbHandlerContext,
) {
  const entry = await ctx.scheduler.schedule(
    () => ctx.db.getCacheEntry(payload.ptUrl),
    { priority: 'HIGH', cacheKey: `ptcache:${payload.ptUrl}`, cacheTTL: 5000 },
  )
  return { success: true, entry }
}

export async function handlePtIdCachePut(
  payload: MessagePayloadMap['PT_ID_CACHE_PUT'],
  ctx: DbHandlerContext,
) {
  await ctx.scheduler.schedule(
    () => ctx.db.putCacheEntry(payload.entry),
    { priority: 'HIGH', cacheKey: `ptcache:${payload.entry.ptUrl}`, invalidateCache: true },
  )
  return { success: true }
}

export async function handlePtIdCacheGetBulk(
  payload: MessagePayloadMap['PT_ID_CACHE_GET_BULK'],
  ctx: DbHandlerContext,
) {
  const { ptUrls } = payload
  // Single-transaction batch read — avoids N sequential scheduler round-trips
  const entries = await ctx.scheduler.schedule(
    () => ctx.db.getCacheEntries(ptUrls),
    { priority: 'MEDIUM', cacheKey: `ptcache-bulk:${ptUrls.join(',')}`, cacheTTL: 5000 },
  )
  return { success: true, entries }
}
