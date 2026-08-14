/**
 * IndexedDB Database Manager v7
 *
 * Architecture:
 * - Each platform gets its own object store: douban_records, imdb_records, neodb_records, tmdb_records
 * - Record key format: "type::providerId" (e.g. "movie::37332784")
 * - Cross-platform links stored in `linkedIds` map on each record
 * - TTL cache store maintained for supporting functionality
 * - PT ID cache stores PT→platform ID mappings from detail pages
 *
 * Record-level schema migration:
 * - Records carry a `schemaVersion` field (0 or undefined = legacy)
 * - On read, records are normalized via iterative migration steps
 * - On write, records are stamped with CURRENT_RECORD_VERSION
 * - Migration errors are logged and surfaced to the user
 *
 * v7 adds pt_id_cache store for caching PT torrent → platform ID associations.
 * v6 migration drops all old stores and creates fresh per-platform stores.
 */

import type { StoreRecord, PtIdCacheEntry } from '@/types'
import { normalizeStoreRecord, stampRecordVersion, normalizeCacheEntry, stampCacheVersion, MigrationError } from '@/features/migration/models'
import { LruCache } from '@/features/cache/lru-cache'
import { queryPage as queryPageUtil, batchGet as batchGetUtil } from './query-utils'
import type { PageQueryOptions, PageResult } from './query-utils'
import type { WriteResult } from '@/features/optimistic-lock/types'
import { migrateSchema } from './migrate'

export const DB_NAME = 'umm-media-db'
export const DB_VERSION = 13

export const STORE_NAMES = {
  DOUBAN: 'douban_records',
  IMDB: 'imdb_records',
  NEODB: 'neodb_records',
  TMDB: 'tmdb_records',
  BILIBILI: 'bilibili_records',
  YOUTUBE: 'youtube_records',
  BANGUMI: 'bangumi_records',
  TTL_CACHE: 'ttl_cache',
  PT_ID_CACHE: 'pt_id_cache',
  JAV_IDS: 'jav_ids',
} as const

/** All per-platform record store names */
export const RECORD_STORES: readonly string[] = [
  STORE_NAMES.DOUBAN,
  STORE_NAMES.IMDB,
  STORE_NAMES.NEODB,
  STORE_NAMES.TMDB,
  STORE_NAMES.BILIBILI,
  STORE_NAMES.YOUTUBE,
  STORE_NAMES.BANGUMI,
]

/** All per-platform record stores PLUS jav_ids (adult records) for backup/export */
export const BACKUP_STORES: readonly string[] = [...RECORD_STORES, STORE_NAMES.JAV_IDS]

/**
 * Public semantic contract for the watched-status gate (status === 2 or legacy 'done').
 *
 * Referenced by tests/unit/watched-status.spec.ts; not called by getWatchedIds (which
 * queries the `status` index directly) — keep in sync with that index query.
 *
 * Returns true ONLY for status=2 (done/watched). Doing (3) and wishlist (1)
 * are excluded: in-progress records must not trigger PT dimming or watched
 * badges. Accepts legacy string statuses from earlier code ("done"→2,
 * "wish"→1) and treats any other value (missing, null, unknown string) as
 * status 0 (none).
 */
export function isWatchedStatus(rawStatus: unknown): boolean {
  const status = typeof rawStatus === 'number' ? rawStatus
    : rawStatus === 'done' ? 2
    : rawStatus === 'wish' ? 1
    : 0
  return status === 2
}

/**
 * Normalize a legacy video record key to the canonical movie format (decision-3).
 *
 * Bilibili/youtube content scripts historically keyed records as 'video::X' or
 * bare 'X'; the canonical key format is 'type::providerId' where video content
 * belongs under 'movie::X' (v13 migration rewrites stored keys accordingly).
 *
 * Rules:
 * - 'video::X'  → 'movie::X'  (legacy video prefix)
 * - bare 'X'    → 'movie::X'  (legacy un-prefixed key)
 * - 'movie::X'  → unchanged
 * - any other prefixed key ('tv::X', 'music::X', …) → unchanged (callers may report)
 */
export function normalizeVideoKey(oldKey: string): string {
  if (oldKey.startsWith('video::')) return `movie::${oldKey.slice('video::'.length)}`
  if (!oldKey.includes('::')) return `movie::${oldKey}`
  return oldKey
}

/**
 * Normalize a record key for a specific store (video platforms only).
 * Single source of truth for WebDAV download/sync and import paths.
 */
export function normalizeStoreRecordKey(storeName: string, recordKey: string): string {
  if (storeName !== STORE_NAMES.BILIBILI && storeName !== STORE_NAMES.YOUTUBE) return recordKey
  return normalizeVideoKey(recordKey)
}

export class MediaDatabase {
  private db: IDBDatabase | null = null
  private initPromise: Promise<void> | null = null
  private readCache = new LruCache<StoreRecord | null | Array<{ key: string; record: StoreRecord }>>({
    maxSize: 500,
    defaultTtlMs: 30_000,
  })

  // ==================== Initialization ====================

  async init(): Promise<void> {
    if (this.db) return
    if (this.initPromise) return this.initPromise

    this.initPromise = new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        const oldVersion = event.oldVersion

        migrateSchema(db, oldVersion, request, {
          DB_VERSION,
          STORE_NAMES,
          RECORD_STORES,
          normalizeVideoKey,
        })
      }

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result

        // Handle unexpected close (e.g. extension update)
        this.db.onversionchange = () => {
          this.db?.close()
          this.db = null
          this.initPromise = null
        }

        // Handle error events on db
        this.db.onerror = () => {
          console.warn('[DB] Unhandled database error event')
        }

        resolve()
      }

      request.onerror = (event) => {
        this.initPromise = null
        const error = (event.target as IDBOpenDBRequest).error
        console.error('[DB] Failed to open database:', error)
        reject(error || new Error('Failed to open IndexedDB'))
      }

      request.onblocked = () => {
        console.warn('[DB] Database open blocked — close other tabs/windows')
      }
    })

    return this.initPromise
  }

  /** Re-initialize after close */
  private async ensureDB(): Promise<IDBDatabase> {
    if (!this.db) await this.init()
    return this.db!
  }

  /** Create a transaction and return the object store helper */
  private async storeOp<T>(
    storeName: string,
    mode: IDBTransactionMode,
    cb: (store: IDBObjectStore) => IDBRequest<T>
  ): Promise<T> {
    const db = await this.ensureDB()
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(storeName, mode)
      const store = tx.objectStore(storeName)
      const request = cb(store)

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => {
        console.error(`[DB] Error on ${storeName}:`, request.error)
        reject(request.error)
      }
      tx.onerror = () => {
        console.error(`[DB] Transaction error on ${storeName}:`, tx.error)
        reject(tx.error)
      }
    })
  }

  private invalidateStoreCache(storeName: string): void {
    this.readCache.deleteByPrefix(`${storeName}::`)
    this.readCache.delete(`__list__${storeName}`)
  }

  // ==================== Public API ====================

  /** Get a single record by key. Returns null if not found. Normalizes on read. */
  async get(storeName: string, key: string): Promise<StoreRecord | null> {
    const cacheKey = `${storeName}::${key}`
    const cached = this.readCache.get(cacheKey) as StoreRecord | null | undefined
    if (cached !== undefined) return cached

    const result = await this.storeOp(storeName, 'readonly', store => store.get(key))
    if (!result) {
      this.readCache.set(cacheKey, null)
      return null
    }

    try {
      const { record, migrated } = normalizeStoreRecord(result)
      if (migrated) {
        this.batchPut(storeName, [{ key, record }]).catch(err => {
          console.warn(`[DB] Failed to write back migrated record ${key}:`, err)
        })
      }
      this.readCache.set(cacheKey, record)
      return record
    } catch (err: unknown) {
      if (err instanceof MigrationError) {
        console.error(`[DB] Migration failed for ${storeName}/${key}:`, err.message, err.details)
        return result as StoreRecord
      }
      throw err
    }
  }

  /** Put (insert or update) a record. Stamps schema + record version. */
  async put(storeName: string, key: string, record: StoreRecord): Promise<void> {
    record.updatedAt = record.updatedAt || new Date().toISOString()

    // Read version and write in a single transaction to prevent race condition
    // where two concurrent calls both read version 0 and both write version 1.
    const db = await this.ensureDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite')
      const store = tx.objectStore(storeName)

      const getReq = store.get(key)
      getReq.onsuccess = () => {
        const current = (getReq.result as StoreRecord | null) ?? null
        const nextVersion = (current?.recordVersion ?? 0) + 1
        record.recordVersion = nextVersion
        store.put(stampRecordVersion(record), key)
      }
      getReq.onerror = () => {
        // Fallback: write without version check
        record.recordVersion = 1
        store.put(stampRecordVersion(record), key)
      }

      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })

    this.invalidateStoreCache(storeName)
  }

  /**
   * Put multiple records in a single readwrite transaction.
   * Each record is versioned exactly like put(): reads the current
   * recordVersion inside the same transaction and increments it (missing
   * keys start at 1). The store cache is invalidated once after commit.
   */
  async batchPut(storeName: string, records: Array<{ key: string; record: StoreRecord }>): Promise<void> {
    if (records.length === 0) return

    const db = await this.ensureDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite')
      const store = tx.objectStore(storeName)

      for (const { key, record } of records) {
        record.updatedAt = record.updatedAt || new Date().toISOString()

        const getReq = store.get(key)
        getReq.onsuccess = () => {
          const current = (getReq.result as StoreRecord | null) ?? null
          const nextVersion = (current?.recordVersion ?? 0) + 1
          record.recordVersion = nextVersion
          store.put(stampRecordVersion(record), key)
        }
        getReq.onerror = () => {
          // Fallback: write without version check
          record.recordVersion = 1
          store.put(stampRecordVersion(record), key)
        }
      }

      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })

    this.invalidateStoreCache(storeName)
  }

  /**
   * Optimistic put — only writes if the record's version matches expectedVersion.
   * Prevents last-write-wins data loss when multiple content scripts write concurrently.
   *
   * Returns WriteResult: { ok: true, version } on success, { ok: false, conflict } on mismatch.
   */
  async optimisticPut(
    storeName: string,
    key: string,
    record: StoreRecord,
    expectedVersion: number,
  ): Promise<WriteResult> {
    const current = await this.get(storeName, key)
    const currentVersion = current?.recordVersion ?? 0

    if (currentVersion !== expectedVersion) {
      console.warn(
        `[OptimisticLock] Conflict ${storeName}::${key}: ` +
        `current=v${currentVersion}, expected=v${expectedVersion}`,
      )
      return {
        ok: false,
        conflict: { currentVersion, expectedVersion },
      }
    }

    record.recordVersion = expectedVersion + 1
    await this.put(storeName, key, record)
    return { ok: true, version: expectedVersion + 1 }
  }


  /** Delete a record by key. */
  async delete(storeName: string, key: string): Promise<void> {
    await this.storeOp(storeName, 'readwrite', store => store.delete(key))
    this.invalidateStoreCache(storeName)
  }

  /** Get all records from a store. Normalizes each record on read. */
  async getAll(storeName: string): Promise<Array<{ key: string; record: StoreRecord }>> {
    const listCacheKey = `__list__${storeName}`
    const cached = this.readCache.get(listCacheKey) as Array<{ key: string; record: StoreRecord }> | undefined
    if (cached !== undefined) return cached

    const db = await this.ensureDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly')
      const store = tx.objectStore(storeName)
      const request = store.openCursor()
      const results: Array<{ key: string; record: StoreRecord }> = []
      // L7: collect migrated records during the cursor pass and write them
      // back in a single batchPut after the readonly tx completes, instead of
      // fire-and-forget put() per record (storm on first read after upgrade).
      const migratedRecords: Array<{ key: string; record: StoreRecord }> = []

      request.onsuccess = () => {
        const cursor = request.result
        if (cursor) {
          try {
            const { record, migrated } = normalizeStoreRecord(cursor.value)
            results.push({ key: cursor.key as string, record })
            if (migrated) {
              migratedRecords.push({ key: cursor.key as string, record })
            }
          } catch (err: unknown) {
            if (err instanceof MigrationError) {
              console.error(`[DB] Migration failed for ${storeName}/${cursor.key}:`, err.message)
              results.push({ key: cursor.key as string, record: cursor.value as StoreRecord })
            } else {
              throw err
            }
          }
          cursor.continue()
        } else {
          this.readCache.set(listCacheKey, results, 5_000)
          if (migratedRecords.length > 0) {
            this.batchPut(storeName, migratedRecords).catch(err => {
              console.warn(`[DB] Failed to write back ${migratedRecords.length} migrated records in ${storeName}:`, err)
            })
          }
          resolve(results)
        }
      }
      request.onerror = () => reject(request.error)
      tx.onerror = () => reject(tx.error)
    })
  }

  // ==================== Paginated Query ====================

  /**
   * Cursor-based paginated query with limit and offset.
   * Supports optional index + key range filtering.
   */
  async queryPage<T = StoreRecord>(
    storeName: string,
    opts?: PageQueryOptions,
  ): Promise<PageResult<T>> {
    const db = await this.ensureDB()
    const tx = db.transaction(storeName, 'readonly')
    const store = tx.objectStore(storeName)
    return queryPageUtil<T>(store, opts)
  }

  // ==================== Batch Operations ====================

  /**
   * Get multiple records by key in a single transaction.
   * Keys not found are omitted from the result.
   */
  async batchGet<T = StoreRecord>(
    storeName: string,
    keys: IDBValidKey[],
  ): Promise<Map<IDBValidKey, T>> {
    const db = await this.ensureDB()
    const tx = db.transaction(storeName, 'readonly')
    const store = tx.objectStore(storeName)
    return batchGetUtil<T>(store, keys)
  }

  /** Count records in a store. */
  async count(storeName: string): Promise<number> {
    return this.storeOp(storeName, 'readonly', store => store.count())
  }

  /**
   * Get all keys with status == 2 (watched/done only).
   *
   * Uses the `status` index with two key-range cursors (numeric 2 and legacy
   * string "done") instead of a full-store cursor scan:
   * - Old records may have string status ("done", "wish") saved from earlier code
   * - IndexedDB key ranges are type-sensitive (numeric 2 and string 'done' are
   *   DIFFERENT index keys), so both keys are queried explicitly
   * - isWatchedStatus accepts only numeric 2 and string 'done' as watched, so
   *   the union of these two index cursors is exactly the watched set
   *
   * CRITICAL: this MUST use `openKeyCursor` (plain IDBCursor, index key +
   * primary key only). `index.openCursor()` returns IDBCursorWithValue and the
   * browser structured-clones the FULL record value for every visited entry
   * even when `cursor.value` is never read — a large watched library then
   * takes seconds and blows the 8s scheduler task budget (DB_GET_WATCHED_IDS
   * timeout cascade on PT sites). Key cursors never deserialize values, so the
   * cost is strictly O(watched) with zero per-record clone.
   *
   * NOTE: Only status=2 (watched) is returned — wishlist (status=1) and doing (status=3)
   * records are excluded because they should NOT trigger PT site dimming or UI
   * "watched" badges.
   *
   * Returns a Set of record primary keys (e.g., "movie::37332784").
   */
  async getWatchedIds(storeName: string): Promise<Set<string>> {
    const db = await this.ensureDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly')
      const store = tx.objectStore(storeName)
      const index = store.index('status')
      const ids = new Set<string>()
      let count = 0
      let pending = 2
      // Guard against double settlement (e.g. one cursor errors while the
      // other finishes, or tx.onerror fires after resolve) — JS ignores the
      // second call, but the finish() log would mislead.
      let settled = false

      const finish = () => {
        pending--
        if (pending === 0) {
          console.log(`[DB] getWatchedIds(${storeName}): scanned ${count} records, found ${ids.size} watched`)
          if (!settled) {
            settled = true
            resolve(ids)
          }
        }
      }

      // Key-only cursor: `cursor.primaryKey` is the record's primary key.
      const walk = (request: IDBRequest<IDBCursor | null>): void => {
        request.onsuccess = () => {
          const cursor = request.result
          if (cursor) {
            count++
            ids.add(cursor.primaryKey as string)
            cursor.continue()
          } else {
            finish()
          }
        }
        request.onerror = () => {
          console.error(`[DB] getWatchedIds(${storeName}) status-index cursor failed:`, request.error)
          if (!settled) {
            settled = true
            reject(request.error)
          }
        }
      }

      // Cursor 1: numeric status 2 (watched). Cursor 2: legacy string 'done'.
      // A record cannot have both statuses, so the union is the exact watched set.
      walk(index.openKeyCursor(IDBKeyRange.only(2)))
      walk(index.openKeyCursor(IDBKeyRange.only('done')))

      tx.onerror = () => {
        console.error(`[DB] Transaction error on ${storeName}:`, tx.error)
        if (!settled) {
          settled = true
          reject(tx.error)
        }
      }
    })
  }

  // ==================== PT ID Cache ====================

  /** Get a PT ID cache entry by URL. Normalizes on read. */
  async getCacheEntry(ptUrl: string): Promise<PtIdCacheEntry | null> {
    const db = await this.ensureDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAMES.PT_ID_CACHE, 'readonly')
      const store = tx.objectStore(STORE_NAMES.PT_ID_CACHE)
      const request = store.get(ptUrl)

      request.onsuccess = () => {
        if (!request.result) {
          resolve(null)
          return
        }
        try {
          const { record, migrated } = normalizeCacheEntry(request.result)
          if (migrated) {
            this.putCacheEntry(record).catch(err => {
              console.warn(`[DB] Failed to write back migrated cache entry ${ptUrl}:`, err)
            })
          }
          resolve(record)
        } catch (err: unknown) {
          if (err instanceof MigrationError) {
            console.error(`[DB] Cache migration failed for ${ptUrl}:`, err.message)
            resolve(request.result as PtIdCacheEntry)
          } else {
            reject(err)
          }
        }
      }
      request.onerror = () => reject(request.error)
      tx.onerror = () => reject(tx.error)
    })
  }

  /** Batch get PT ID cache entries by URL in a single transaction. Missing keys are omitted. */
  async getCacheEntries(ptUrls: string[]): Promise<Record<string, PtIdCacheEntry>> {
    if (ptUrls.length === 0) return {}
    const db = await this.ensureDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAMES.PT_ID_CACHE, 'readonly')
      const store = tx.objectStore(STORE_NAMES.PT_ID_CACHE)
      const entries: Record<string, PtIdCacheEntry> = {}

      for (const ptUrl of ptUrls) {
        const request = store.get(ptUrl)
        request.onsuccess = () => {
          if (!request.result) return
          try {
            const { record, migrated } = normalizeCacheEntry(request.result)
            if (migrated) {
              this.putCacheEntry(record).catch(err => {
                console.warn(`[DB] Failed to write back migrated cache entry ${ptUrl}:`, err)
              })
            }
            entries[ptUrl] = record
          } catch (err: unknown) {
            if (err instanceof MigrationError) {
              console.error(`[DB] Cache migration failed for ${ptUrl}:`, err.message)
              entries[ptUrl] = request.result as PtIdCacheEntry
            } else {
              reject(err)
            }
          }
        }
      }

      tx.oncomplete = () => resolve(entries)
      tx.onerror = () => reject(tx.error)
    })
  }
  async putCacheEntry(entry: PtIdCacheEntry): Promise<void> {
    const db = await this.ensureDB()
    const stamped = stampCacheVersion(entry)
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAMES.PT_ID_CACHE, 'readwrite')
      const store = tx.objectStore(STORE_NAMES.PT_ID_CACHE)
      const request = store.put(stamped, stamped.ptUrl)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
      tx.onerror = () => reject(tx.error)
    })
  }
  // ==================== Bulk Operations ====================

  /** Get all records from all record stores + jav_ids (for export). */
  async getAllStores(): Promise<Record<string, Record<string, StoreRecord>>> {
    const result: Record<string, Record<string, StoreRecord>> = {}

    for (const storeName of RECORD_STORES) {
      const entries = await this.getAll(storeName)
      const map: Record<string, StoreRecord> = {}
      for (const entry of entries) {
        map[entry.key] = entry.record
      }
      result[storeName] = map
    }

    // Include jav_ids store (not in RECORD_STORES but needs export support)
    const javEntries = await this.getAll(STORE_NAMES.JAV_IDS)
    if (javEntries.length > 0) {
      const javMap: Record<string, StoreRecord> = {}
      for (const entry of javEntries) {
        javMap[entry.key] = entry.record
      }
      result[STORE_NAMES.JAV_IDS] = javMap
    }

    return result
  }

  /** Clear all records from all stores. */
  async clearAll(): Promise<void> {
    const db = await this.ensureDB()
    const allStoreNames = Array.from(db.objectStoreNames)
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(allStoreNames, 'readwrite')
      for (const name of allStoreNames) {
        tx.objectStore(name).clear()
      }
      tx.oncomplete = () => {
        this.readCache.clear()
        resolve()
      }
      tx.onerror = () => reject(tx.error)
    })
  }

  /** Close the database connection. */
  close(): void {
    if (this.db) {
      this.db.close()
      this.db = null
      this.initPromise = null
    }
  }
}

/** Singleton instance */
export const mediaDB = new MediaDatabase()
