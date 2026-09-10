import { test, expect } from '@playwright/test'
import { BACKUP_STORES, RECORD_STORES, STORE_NAMES, ADULT_STORES } from '@/features/database/models'
import { Platform } from '@/domain/platform/Platform'

/**
 * BACKUP_STORES — the WebDAV backup/restore whitelist.
 *
 * Locks the contract (ADR-025): exactly the 7 per-platform record stores + the
 * 3 adult stores (jav_ids 日系 / usav_ids 美欧 / sehuatang_ids 帖子浏览记录).
 * javdb/sehuatang codes have no `{id}_records` store of their own — they live
 * in the adult stores; mukaku is a scan-only helper that persists nothing.
 * sehuatang_ids holds user data (帖子已看), so it MUST be backed up.
 */
test.describe('BACKUP_STORES (backup whitelist)', () => {
  test('contains all 7 RECORD_STORES + 3 adult stores (exactly 10)', () => {
    expect(RECORD_STORES).toHaveLength(7)
    expect(ADULT_STORES).toHaveLength(3)
    expect(BACKUP_STORES).toHaveLength(10)
    for (const store of RECORD_STORES) {
      expect(BACKUP_STORES).toContain(store)
    }
    expect(BACKUP_STORES).toContain(STORE_NAMES.JAV_IDS)
    expect(BACKUP_STORES).toContain(STORE_NAMES.USAV_IDS)
    expect(BACKUP_STORES).toContain(STORE_NAMES.SEHUATANG_IDS)
  })

  test('every record-bearing Platform.KNOWN platform has its record home in BACKUP_STORES', () => {
    // Douban/imdb/neodb/tmdb/bilibili/youtube/bangumi → own `{id}_records` store.
    // javdb + sehuatang → jav_ids (日系番号；美欧番号另落 usav_ids)。
    // mukaku → deliberately absent: scan-only helper, persists no media records.
    for (const id of Platform.KNOWN) {
      const home = id === 'javdb' || id === 'sehuatang' ? 'jav_ids' : `${id}_records`
      if (id === 'mukaku') continue // no record store by design
      expect(BACKUP_STORES, `${id} records must be backed up under '${home}'`).toContain(home)
    }
    // Document the exception explicitly so a future platform addition
    // re-evaluates whether it needs a record store / backup entry.
    expect(Platform.KNOWN).toContain('mukaku')
  })

  test('all BACKUP_STORES entries are valid DB stores (ALLOWED_DB_STORES whitelist semantics)', () => {
    // The background whitelist (handlers/db.ts) = RECORD_STORES + ttl_cache +
    // pt_id_cache + jav_ids + usav_ids + sehuatang_ids. Every backup store must
    // be a store the background can actually write to — a backup whitelist
    // entry outside the DB whitelist would be dead (download rejected).
    const allowed = new Set<string>([
      ...RECORD_STORES,
      STORE_NAMES.TTL_CACHE,
      STORE_NAMES.PT_ID_CACHE,
      STORE_NAMES.JAV_IDS,
      STORE_NAMES.USAV_IDS,
      STORE_NAMES.SEHUATANG_IDS,
    ])
    for (const store of BACKUP_STORES) {
      expect(allowed.has(store), `${store} must be an allowed DB store`).toBe(true)
    }
  })

  test('cache-only stores are NOT in the backup whitelist', () => {
    // ttl_cache / pt_id_cache are derived/transient data — never backed up.
    expect(BACKUP_STORES).not.toContain(STORE_NAMES.TTL_CACHE)
    expect(BACKUP_STORES).not.toContain(STORE_NAMES.PT_ID_CACHE)
  })
})
