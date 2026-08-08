/**
 * IndexedDB schema migration (extracted from MediaDatabase.init, 2026-08-07 D1).
 *
 * All version-bump logic v6→v13 lives here. The function runs inside
 * onupgradeneeded on the LIVE versionchange upgrade transaction
 * (request.transaction) — calling db.transaction() here throws
 * InvalidStateError per spec, which aborts the upgrade and bricks the DB.
 * Every request error is preventDefault()ed so a mid-migration failure only
 * logs a warning and does NOT abort the upgrade.
 *
 * Dependencies are injected (deps param) so this module never imports
 * models.ts — no import cycle.
 */

export interface MigrationStoreNames {
  DOUBAN: string
  IMDB: string
  NEODB: string
  TMDB: string
  BILIBILI: string
  YOUTUBE: string
  BANGUMI: string
  TTL_CACHE: string
  PT_ID_CACHE: string
  JAV_IDS: string
}

export interface MigrateDeps {
  DB_VERSION: number
  STORE_NAMES: MigrationStoreNames
  RECORD_STORES: readonly string[]
  normalizeVideoKey: (oldKey: string) => string
}

/**
 * Apply all schema migrations for the current DB_VERSION.
 * Mutates `db` via the upgrade transaction; returns nothing.
 */
export function migrateSchema(
  db: IDBDatabase,
  oldVersion: number,
  request: IDBOpenDBRequest,
  deps: MigrateDeps,
): void {
  const { DB_VERSION, STORE_NAMES, RECORD_STORES, normalizeVideoKey } = deps

  console.log(`[DB] Upgrading from v${oldVersion} to v${DB_VERSION}`)

  if (oldVersion < 6) {
    // Fresh install or pre-v6: drop everything and create all stores
    const existing = Array.from(db.objectStoreNames)
    for (const name of existing) {
      db.deleteObjectStore(name)
    }

    for (const name of RECORD_STORES) {
      const store = db.createObjectStore(name)
      store.createIndex('status', 'status', { unique: false })
      store.createIndex('updatedAt', 'updatedAt', { unique: false })
    }

    const ttlCache = db.createObjectStore(STORE_NAMES.TTL_CACHE)
    ttlCache.createIndex('expiry', 'expiry', { unique: false })

    // L8: sync_logs was a dead store (never written by any code path) and
    // is no longer created for fresh installs. Existing databases keep a
    // harmless empty sync_logs store — deliberately NO version bump to
    // avoid forcing a migration on every existing user.

    console.log(`[DB] Created v6 schema from scratch`)
  }

  // v6→v7: add pt_id_cache store, preserve existing data
  if (oldVersion < 7) {
    if (!db.objectStoreNames.contains(STORE_NAMES.PT_ID_CACHE)) {
      const ptCache = db.createObjectStore(STORE_NAMES.PT_ID_CACHE)
      ptCache.createIndex('updatedAt', 'updatedAt', { unique: false })
      console.log('[DB] Added pt_id_cache store')
    }
  }

  // v7→v8: add sehuatang_avids store (legacy name). Only created for databases
  // that actually had v7 — fresh installs (oldVersion < 6) already dropped
  // everything and must not carry this legacy-named dead store (L8 policy: no
  // dead stores for fresh installs, mirroring the sync_logs decision).
  if (oldVersion >= 6 && oldVersion < 8) {
    if (!db.objectStoreNames.contains('sehuatang_avids')) {
      const avStore = db.createObjectStore('sehuatang_avids')
      avStore.createIndex('updatedAt', 'updatedAt', { unique: false })
      console.log('[DB] Added sehuatang_avids store')
    }
  }

  // v8→v9: rename sehuatang_avids → jav_ids, migrate data
  if (oldVersion < 9) {
    if (!db.objectStoreNames.contains(STORE_NAMES.JAV_IDS)) {
      const avStore = db.createObjectStore(STORE_NAMES.JAV_IDS)
      avStore.createIndex('updatedAt', 'updatedAt', { unique: false })
      console.log('[DB] Created jav_ids store')
    }
  }

  // v9→v10: add bilibili_records store
  if (oldVersion < 10) {
    if (!db.objectStoreNames.contains(STORE_NAMES.BILIBILI)) {
      const biliStore = db.createObjectStore(STORE_NAMES.BILIBILI)
      biliStore.createIndex('status', 'status', { unique: false })
      biliStore.createIndex('updatedAt', 'updatedAt', { unique: false })
      console.log('[DB] Added bilibili_records store')
    }
  }

  // v10→v11: add youtube_records store
  if (oldVersion < 11) {
    if (!db.objectStoreNames.contains(STORE_NAMES.YOUTUBE)) {
      const ytStore = db.createObjectStore(STORE_NAMES.YOUTUBE)
      ytStore.createIndex('status', 'status', { unique: false })
      ytStore.createIndex('updatedAt', 'updatedAt', { unique: false })
      console.log('[DB] Added youtube_records store')
    }
  }

  // v11→v12: add bangumi_records store
  if (oldVersion < 12) {
    if (!db.objectStoreNames.contains(STORE_NAMES.BANGUMI)) {
      const bangumiStore = db.createObjectStore(STORE_NAMES.BANGUMI)
      bangumiStore.createIndex('status', 'status', { unique: false })
      bangumiStore.createIndex('updatedAt', 'updatedAt', { unique: false })
      console.log('[DB] Added bangumi_records store')
    }
  }

  // v12→v13: jav_ids data copy (M4) + bilibili/youtube key normalization (decision-3)
  if (oldVersion < 13) {
    // Runs on the LIVE versionchange upgrade transaction (request.transaction).
    // Calling db.transaction() inside onupgradeneeded throws InvalidStateError
    // per spec — the upgrade transaction is still active — which aborts the
    // upgrade (AbortError) and bricks the DB open. The cursor chains below
    // keep the versionchange transaction alive until they finish, and every
    // request error is preventDefault()ed so a mid-migration failure only
    // logs a warning and does NOT abort the upgrade (the store schema itself
    // is already in place from the createObjectStore blocks above).
    const upgradeTx = request.transaction
    if (!upgradeTx) {
      console.warn('[DB] v13: no upgrade transaction available, skipping data migration')
    } else {
      try {
        // M4: The v8→v9 block only created jav_ids without copying data from
        // the legacy sehuatang_avids store (the comment claimed "migrate data"
        // but no copy was performed). sehuatang_avids was never deleted, so for
        // databases that upgraded through v8 both stores now exist. Copy every
        // entry from sehuatang_avids into jav_ids on the upgrade tx.
        // Defensive: existing jav_ids entries win — a key already present in
        // jav_ids (added after the v9 upgrade) is NOT overwritten by the stale
        // sehuatang_avids copy.
        if (
          db.objectStoreNames.contains('sehuatang_avids') &&
          db.objectStoreNames.contains(STORE_NAMES.JAV_IDS)
        ) {
          const srcStore = upgradeTx.objectStore('sehuatang_avids')
          const dstStore = upgradeTx.objectStore(STORE_NAMES.JAV_IDS)
          const cursorReq = srcStore.openCursor()
          let copied = 0
          cursorReq.onsuccess = () => {
            const cursor = cursorReq.result
            if (!cursor) {
              console.log(`[DB] v13: copied ${copied} entries from sehuatang_avids to jav_ids`)
              return
            }
            const existingReq = dstStore.get(cursor.key)
            existingReq.onsuccess = () => {
              if (existingReq.result === undefined) {
                const putReq = dstStore.put(cursor.value, cursor.key)
                putReq.onsuccess = () => {
                  copied++
                }
                putReq.onerror = (ev) => {
                  // preventDefault keeps the upgrade transaction alive —
                  // an unhandled failed request would abort it, freezing
                  // the DB version and re-running this migration on every open.
                  ev.preventDefault()
                  console.warn('[DB] v13: sehuatang_avids → jav_ids write failed, skipping key:', cursor.key, putReq.error)
                }
              }
              cursor.continue()
            }
            existingReq.onerror = (ev) => {
              // preventDefault keeps the upgrade transaction alive —
              // an unhandled failed request would abort it.
              ev.preventDefault()
              console.warn('[DB] v13: sehuatang_avids → jav_ids read failed, skipping key:', cursor.key)
              cursor.continue()
            }
          }
          cursorReq.onerror = (ev) => {
            ev.preventDefault()
            console.warn('[DB] v13: sehuatang_avids → jav_ids copy partial/failed:', cursorReq.error)
          }
        }

        // decision-3: rewrite legacy video keys in bilibili_records and
        // youtube_records from 'video::X' / bare 'X' to the canonical
        // 'movie::X' format. Runs on the same upgrade transaction.
        const normalizeStoreKeys = (storeName: string): void => {
          const store = upgradeTx.objectStore(storeName)
          const cursorReq = store.openCursor()
          let moved = 0
          cursorReq.onsuccess = () => {
            const cursor = cursorReq.result
            if (!cursor) {
              console.log(`[DB] v13: normalized ${moved} keys in ${storeName}`)
              return
            }
            const oldKey = cursor.key
            if (typeof oldKey !== 'string') {
              cursor.continue()
              return
            }
            const newKey = normalizeVideoKey(oldKey)
            if (newKey === oldKey) {
              // 'movie::…' is already canonical; any other prefixed key
              // ('tv::…', 'music::…', …) is untouched — report it so the
              // unexpected-format key is visible in the logs.
              if (!oldKey.startsWith('movie::')) {
                console.log(`[DB] v13: key with unrecognized prefix left as-is in ${storeName}: ${oldKey}`)
              }
              cursor.continue()
              return
            }
            const collisionReq = store.get(newKey)
            collisionReq.onsuccess = () => {
              if (collisionReq.result === undefined) {
                // No collision: move the value to the canonical key. Only
                // drop the legacy key AFTER the move succeeds — a failed
                // write keeps the legacy entry so no data is lost.
                const putReq = store.put(cursor.value, newKey)
                putReq.onsuccess = () => {
                  const deleteReq = store.delete(oldKey)
                  deleteReq.onerror = (ev) => {
                    ev.preventDefault()
                    console.warn(`[DB] v13: legacy key delete failed in ${storeName}: ${oldKey}`, deleteReq.error)
                  }
                  moved++
                  cursor.continue()
                }
                putReq.onerror = (ev) => {
                  ev.preventDefault()
                  console.warn(`[DB] v13: write failed in ${storeName}, keeping legacy key ${oldKey}:`, putReq.error)
                  cursor.continue()
                }
                return
              }
              // Collision: keep the existing newKey entry, drop the legacy key.
              const deleteReq = store.delete(oldKey)
              deleteReq.onerror = (ev) => {
                ev.preventDefault()
                console.warn(`[DB] v13: collision-case legacy key delete failed in ${storeName}: ${oldKey}`, deleteReq.error)
              }
              moved++
              cursor.continue()
            }
            collisionReq.onerror = (ev) => {
              ev.preventDefault()
              console.warn(`[DB] v13: collision check failed in ${storeName}, keeping legacy key ${oldKey}:`, collisionReq.error)
              cursor.continue()
            }
          }
          cursorReq.onerror = (ev) => {
            ev.preventDefault()
            console.warn(`[DB] v13: key normalization partial/failed for ${storeName}:`, cursorReq.error)
          }
        }
        if (db.objectStoreNames.contains(STORE_NAMES.BILIBILI)) normalizeStoreKeys(STORE_NAMES.BILIBILI)
        if (db.objectStoreNames.contains(STORE_NAMES.YOUTUBE)) normalizeStoreKeys(STORE_NAMES.YOUTUBE)
      } catch (err: unknown) {
        // Failure-safe: a mid-migration error must NOT abort the upgrade.
        // The store schema is already correct from the createObjectStore
        // blocks above, so the DB stays usable even if the data copy / key
        // rewrite is skipped.
        console.warn('[DB] v13 migration partial/failed:', err)
      }
    }
  }

  console.log(`[DB] Upgrade complete: now at v${DB_VERSION}`)
}
