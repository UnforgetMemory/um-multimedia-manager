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

export interface DbHandlerContext {
  db: MediaDatabase
  scheduler: DataScheduler
  recordService: RecordService | null
}

// ==================== Core CRUD ====================

export async function handleDbGet(
  payload: { storeName: string; key: string },
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
  payload: { storeName: string; key: string; record: any },
  ctx: DbHandlerContext,
) {
  if (!isAllowedStore(payload.storeName)) return { success: false, error: 'Invalid store name' }
  const putStore = payload.storeName
  const putKey = payload.key
  await ctx.scheduler.schedule(
    () => ctx.db.put(putStore, putKey, payload.record),
    { priority: 'HIGH', storeName: putStore, cacheKey: `put:${putStore}:${putKey}`, invalidateCache: true },
  )
  ctx.scheduler.cacheManager?.invalidate('scheduler', `get:${putStore}:${putKey}`)
  ctx.scheduler.cacheManager?.invalidate('scheduler', `all:${putStore}`)
  broadcast('record:updated', { storeName: putStore, key: putKey })
  return { success: true }
}

export async function handleDbDelete(
  payload: { storeName: string; key: string },
  ctx: DbHandlerContext,
) {
  if (!isAllowedStore(payload.storeName)) return { success: false, error: 'Invalid store name' }
  const delStore = payload.storeName
  const delKey = payload.key
  await ctx.scheduler.schedule(
    () => ctx.db.delete(delStore, delKey),
    { priority: 'HIGH', storeName: delStore, cacheKey: `delete:${delStore}:${delKey}`, invalidateCache: true },
  )
  ctx.scheduler.cacheManager?.invalidate('scheduler', `get:${delStore}:${delKey}`)
  ctx.scheduler.cacheManager?.invalidate('scheduler', `all:${delStore}`)
  broadcast('record:deleted', { storeName: delStore, key: delKey })
  return { success: true }
}

export async function handleDbGetAll(
  payload: { storeName: string },
  ctx: DbHandlerContext,
) {
  if (!isAllowedStore(payload.storeName)) return { success: false, error: 'Invalid store name' }
  const entries = await ctx.scheduler.schedule(
    () => ctx.db.getAll(payload.storeName),
    { priority: 'MEDIUM', storeName: payload.storeName, cacheKey: `all:${payload.storeName}`, cacheTTL: 5000 },
  )
  return { success: true, entries }
}

export async function handleDbQuery(
  payload: { storeName: string; indexName: string; value: any },
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
  payload: { storeName: string },
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
  payload: { storeNames: string[] },
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
  payload: { platform: string; key: string; record: any; linked?: Array<{ platform: string; key: string; url: string }> },
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
  ctx.scheduler.cacheManager?.invalidate('scheduler', `get:${syncStoreName}:${syncKey}`)
  ctx.scheduler.cacheManager?.invalidate('scheduler', `all:${syncStoreName}`)
  broadcast('record:updated', { storeName: syncStoreName, key: syncKey })
  return { success: true, result: syncResult }
}

// ==================== PT ID Cache ====================

export async function handlePtIdCacheGet(
  payload: { ptUrl: string },
  ctx: DbHandlerContext,
) {
  const entry = await ctx.scheduler.schedule(
    () => ctx.db.getCacheEntry(payload.ptUrl),
    { priority: 'HIGH', cacheKey: `ptcache:${payload.ptUrl}`, cacheTTL: 5000 },
  )
  return { success: true, entry }
}

export async function handlePtIdCachePut(
  payload: { entry: any },
  ctx: DbHandlerContext,
) {
  await ctx.scheduler.schedule(
    () => ctx.db.putCacheEntry(payload.entry),
    { priority: 'HIGH', cacheKey: `ptcache:${payload.entry.ptUrl}`, invalidateCache: true },
  )
  return { success: true }
}

export async function handlePtIdCacheGetBulk(
  payload: { ptUrls: string[] },
  ctx: DbHandlerContext,
) {
  const { ptUrls } = payload
  const entries: Record<string, any> = {}
  for (const ptUrl of ptUrls) {
    const entry = await ctx.scheduler.schedule(
      () => ctx.db.getCacheEntry(ptUrl),
      { priority: 'MEDIUM', cacheKey: `ptcache:${ptUrl}`, cacheTTL: 5000 },
    )
    if (entry) entries[ptUrl] = entry
  }
  return { success: true, entries }
}
