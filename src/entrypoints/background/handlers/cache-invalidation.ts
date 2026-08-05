/**
 * Shared scheduler-cache invalidation for handlers without a DbHandlerContext.
 *
 * The DataScheduler's L1 LRU cache is created inside background.ts main() and
 * only reachable via ctx.scheduler.cacheManager in DB handlers. Bulk-write
 * handlers (IMPORT_DATA, WebDAV download/sync, adult-av) receive no context,
 * so the shared CacheManager is registered once at startup and invalidations
 * flow through this module instead — identical key semantics to DB_PUT /
 * DB_DELETE / DB_SYNC_PAGE_RECORD.
 *
 * Pure module: imports only the CacheManager type — no db.ts/background.ts
 * imports, so there are no import cycles.
 */

import type { CacheManager } from '@/features/cache/cache-manager'

let registeredCacheManager: CacheManager | null = null

/** Register the shared CacheManager (called once in background.ts main()). */
export function registerCacheManager(cm: CacheManager): void {
  registeredCacheManager = cm
}

/** The registered shared CacheManager, or null before registration. */
export function getCacheManager(): CacheManager | null {
  return registeredCacheManager
}

/**
 * Invalidate the scheduler cache entries affected by writes to a record store.
 *
 * Byte-compatible with the former invalidateStoreCaches body (db.ts):
 * - keys provided → exact `get:{store}:{key}` invalidate per key
 * - no keys → whole `get:{store}:` prefix via pattern invalidation
 * - always: `all:{store}`, `count:{store}`, `watched:{store}` exact + the
 *   whole `bulk:{store}:` prefix (a write can stale any key-set combination).
 *
 * LruCache operations are synchronous internally, so entries are removed
 * before this returns even though CacheManager.invalidate is async.
 */
export function invalidateSchedulerStore(cm: CacheManager, storeName: string, keys?: string[]): void {
  if (keys && keys.length > 0) {
    for (const key of keys) {
      cm.invalidate('scheduler', `get:${storeName}:${key}`)
    }
  } else {
    cm.invalidateByPattern('scheduler', `get:${storeName}:`)
  }
  cm.invalidate('scheduler', `all:${storeName}`)
  cm.invalidate('scheduler', `count:${storeName}`)
  cm.invalidate('scheduler', `watched:${storeName}`)
  cm.invalidateByPattern('scheduler', `bulk:${storeName}:`)
}
