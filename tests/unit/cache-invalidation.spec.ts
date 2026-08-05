import { test, expect } from '@playwright/test'
import { CacheManager } from '@/features/cache/cache-manager'
import {
  registerCacheManager,
  getCacheManager,
  invalidateSchedulerStore,
} from '@/entrypoints/background/handlers/cache-invalidation'

/**
 * Shared scheduler-cache invalidation helper.
 *
 * invalidateSchedulerStore is the extraction of the former
 * invalidateStoreCaches body (db.ts) so bulk-write handlers that lack a
 * DbHandlerContext (IMPORT_DATA, WebDAV download/sync, adult-av) can
 * invalidate the DataScheduler L1 LRU cache identically to DB_PUT /
 * DB_DELETE / DB_SYNC_PAGE_RECORD.
 *
 * Semantics under test (byte-compatible with the original):
 * - keys provided → exact `get:{store}:{key}` invalidate per key
 * - no keys → whole `get:{store}:` prefix via pattern invalidation
 * - always: `all:{store}`, `count:{store}`, `watched:{store}` exact, plus
 *   the whole `bulk:{store}:` prefix (a write can stale any key-set combo)
 *
 * LruCache ops are synchronous internally, so entries must be gone
 * immediately after the (void) call — no await, no TTL grace.
 */

const STORE = 'douban_records'

async function seedStore(cm: CacheManager): Promise<void> {
  await cm.set('scheduler', `get:${STORE}:movie::1`, { status: 2 })
  await cm.set('scheduler', `get:${STORE}:movie::2`, { status: 3 })
  await cm.set('scheduler', `all:${STORE}`, [{ key: 'movie::1' }])
  await cm.set('scheduler', `count:${STORE}`, 1)
  await cm.set('scheduler', `watched:${STORE}`, ['movie::1'])
  await cm.set('scheduler', `bulk:${STORE}:movie::1,movie::2`, [{ key: 'movie::1' }])
}

test.describe('invalidateSchedulerStore', () => {
  test('removes get:/all:/count:/watched:/bulk: entries for that store (no keys → get: prefix)', async () => {
    const cm = new CacheManager()
    await seedStore(cm)

    invalidateSchedulerStore(cm, STORE)

    for (const key of [
      `get:${STORE}:movie::1`,
      `get:${STORE}:movie::2`,
      `all:${STORE}`,
      `count:${STORE}`,
      `watched:${STORE}`,
      `bulk:${STORE}:movie::1,movie::2`,
    ]) {
      expect(cm.has('scheduler', key), `${key} must be invalidated`).toBe(false)
    }
  })

  test('unrelated store and ptcache-bulk entries survive', async () => {
    const cm = new CacheManager()
    await seedStore(cm)
    await cm.set('scheduler', 'get:imdb_records:tt0111161', { status: 2 })
    await cm.set('scheduler', 'all:imdb_records', [{ key: 'tt0111161' }])
    await cm.set('scheduler', 'count:imdb_records', 0)
    await cm.set('scheduler', 'watched:imdb_records', [])
    await cm.set('scheduler', 'bulk:imdb_records:tt0111161', [{ key: 'tt0111161' }])
    const ptKey = 'ptcache-bulk:https://pt.example.org/details.php?id=1,https://pt.example.org/details.php?id=2'
    await cm.set('scheduler', ptKey, { 'https://pt.example.org/details.php?id=1': { id: '1' } })

    invalidateSchedulerStore(cm, STORE)

    // Unrelated store untouched
    for (const key of [
      'get:imdb_records:tt0111161',
      'all:imdb_records',
      'count:imdb_records',
      'watched:imdb_records',
      'bulk:imdb_records:tt0111161',
    ]) {
      expect(cm.has('scheduler', key), `${key} must survive`).toBe(true)
    }
    // `bulk:{store}:` pattern must not collide with the `ptcache-bulk:` prefix
    expect(cm.has('scheduler', ptKey)).toBe(true)
  })

  test('key-specific form removes only the given key get: entry, other keys survive', async () => {
    const cm = new CacheManager()
    await seedStore(cm)

    invalidateSchedulerStore(cm, STORE, ['movie::1'])

    // Written key's get: entry gone
    expect(cm.has('scheduler', `get:${STORE}:movie::1`)).toBe(false)
    // Other key's get: entry survives (exact-key semantics, not prefix)
    expect(cm.has('scheduler', `get:${STORE}:movie::2`)).toBe(true)
    // Aggregate entries still invalidated
    expect(cm.has('scheduler', `all:${STORE}`)).toBe(false)
    expect(cm.has('scheduler', `count:${STORE}`)).toBe(false)
    expect(cm.has('scheduler', `watched:${STORE}`)).toBe(false)
    expect(cm.has('scheduler', `bulk:${STORE}:movie::1,movie::2`)).toBe(false)
  })
})

test.describe('registerCacheManager / getCacheManager', () => {
  test('roundtrip returns the registered shared manager', () => {
    const cm = new CacheManager()
    registerCacheManager(cm)
    expect(getCacheManager()).toBe(cm)
  })
})
