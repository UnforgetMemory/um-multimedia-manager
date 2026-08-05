import { test, expect } from '@playwright/test'
import { BACKUP_STORES, RECORD_STORES, STORE_NAMES } from '@/features/database/models'
import { Platform } from '@/domain/platform/Platform'

/**
 * BACKUP_STORES — the WebDAV backup/restore whitelist.
 *
 * Locks the contract: exactly the 7 per-platform record stores + jav_ids
 * (adult records). javdb/sehuatang records live in jav_ids — they have no
 * `{id}_records` store of their own — and mukaku is a scan-only helper
 * platform that persists no media records at all.
 */
test.describe('BACKUP_STORES (backup whitelist)', () => {
  test('contains all 7 RECORD_STORES + jav_ids (exactly 8)', () => {
    expect(RECORD_STORES).toHaveLength(7)
    expect(BACKUP_STORES).toHaveLength(8)
    for (const store of RECORD_STORES) {
      expect(BACKUP_STORES).toContain(store)
    }
    expect(BACKUP_STORES).toContain(STORE_NAMES.JAV_IDS)
  })

  test('every record-bearing Platform.KNOWN platform has its record home in BACKUP_STORES', () => {
    // Douban/imdb/neodb/tmdb/bilibili/youtube/bangumi → own `{id}_records` store.
    // javdb + sehuatang → jav_ids (adult records share one store).
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
    // pt_id_cache + jav_ids. Every backup store must be a store the
    // background can actually write to — a backup whitelist entry outside
    // the DB whitelist would be dead (download would be rejected).
    const allowed = new Set<string>([
      ...RECORD_STORES,
      STORE_NAMES.TTL_CACHE,
      STORE_NAMES.PT_ID_CACHE,
      STORE_NAMES.JAV_IDS,
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
