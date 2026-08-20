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
 * Pure module: imports only the CacheManager type and the session-cache
 * helper (which itself imports nothing from db.ts/background.ts), so there
 * are no import cycles.
 */

import type { CacheManager } from '@/features/cache/cache-manager'
import * as sessionCache from '@/features/cache/session-cache'

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
 *
 * L1.5 (ADR-014): the session-layer `watched:{storeName}` entry is also
 * dropped here. chrome.storage.session.remove is async, so this is a
 * fire-and-forget invalidation — the L1 cache is already gone synchronously
 * and the session area's write-through on the next watched-ids read will
 * repopulate it. Browser restart (which clears chrome.storage.session) is the
 * backstop for any rare lost remove — the session layer carries no TTL.
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
  // L1.5: drop the session-layer watched-ids entry so a post-write SW wake
  // doesn't read stale ids. Fire-and-forget; browser restart is the backstop.
  void sessionCache.remove(sessionCache.SESSION_CACHE_KEYS.watched(storeName))
}
