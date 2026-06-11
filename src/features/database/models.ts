/**
 * IndexedDB Database Manager v7
 *
 * Architecture:
 * - Each platform gets its own object store: douban_records, imdb_records, neodb_records, tmdb_records
 * - Record key format: "type::providerId" (e.g. "movie::37332784")
 * - Cross-platform links stored in `linkedIds` map on each record
 * - TTL cache and sync logs stores maintained for supporting functionality
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

export const DB_NAME = 'umm-media-db'
export const DB_VERSION = 7

export const STORE_NAMES = {
  DOUBAN: 'douban_records',
  IMDB: 'imdb_records',
  NEODB: 'neodb_records',
  TMDB: 'tmdb_records',
  TTL_CACHE: 'ttl_cache',
  SYNC_LOGS: 'sync_logs',
  PT_ID_CACHE: 'pt_id_cache',
} as const

/** All per-platform record store names */
export const RECORD_STORES: readonly string[] = [
  STORE_NAMES.DOUBAN,
  STORE_NAMES.IMDB,
  STORE_NAMES.NEODB,
  STORE_NAMES.TMDB,
]

/** Helper: get the store name for a platform */
export function storeNameForPlatform(platform: string): string {
  return `${platform}_records`
}

class MediaDatabase {
  private db: IDBDatabase | null = null
  private initPromise: Promise<void> | null = null
  private readCache = new Map<string, { data: any; timestamp: number }>()
  private readonly READ_CACHE_TTL = 30_000  // 30s for single reads
  private readonly LIST_CACHE_TTL = 5_000   // 5s for list reads

  // ==================== Initialization ====================

  async init(): Promise<void> {
    if (this.db) return
    if (this.initPromise) return this.initPromise

    this.initPromise = new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        const oldVersion = event.oldVersion

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

          db.createObjectStore(STORE_NAMES.SYNC_LOGS, { autoIncrement: true })

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

        console.log(`[DB] Upgrade complete: now at v${DB_VERSION}`)
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
    for (const k of this.readCache.keys()) {
      if (k.startsWith(storeName + '::') || k === `__list__${storeName}`) {
        this.readCache.delete(k)
      }
    }
  }

  // ==================== Public API ====================

  /** Get a single record by key. Returns null if not found. Normalizes on read. */
  async get(storeName: string, key: string): Promise<StoreRecord | null> {
    const cacheKey = `${storeName}::${key}`
    const cached = this.readCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < this.READ_CACHE_TTL) {
      return cached.data as StoreRecord | null
    }

    const result = await this.storeOp(storeName, 'readonly', store => store.get(key))
    if (!result) {
      this.readCache.set(cacheKey, { data: null, timestamp: Date.now() })
      return null
    }

    try {
      const { record, migrated } = normalizeStoreRecord(result)
      if (migrated) {
        this.put(storeName, key, record).catch(err => {
          console.warn(`[DB] Failed to write back migrated record ${key}:`, err)
        })
      }
      this.readCache.set(cacheKey, { data: record, timestamp: Date.now() })
      return record
    } catch (err) {
      if (err instanceof MigrationError) {
        console.error(`[DB] Migration failed for ${storeName}/${key}:`, err.message, err.details)
        return result as StoreRecord
      }
      throw err
    }
  }

  /** Put (insert or update) a record. Stamps schema version. */
  async put(storeName: string, key: string, record: StoreRecord): Promise<void> {
    record.updatedAt = record.updatedAt || new Date().toISOString()
    const stamped = stampRecordVersion(record)
    await this.storeOp(storeName, 'readwrite', store => store.put(stamped, key))
    this.invalidateStoreCache(storeName)
  }

  /** Delete a record by key. */
  async delete(storeName: string, key: string): Promise<void> {
    await this.storeOp(storeName, 'readwrite', store => store.delete(key))
    this.invalidateStoreCache(storeName)
  }

  /** Get all records from a store. Normalizes each record on read. */
  async getAll(storeName: string): Promise<Array<{ key: string; record: StoreRecord }>> {
    const listCacheKey = `__list__${storeName}`
    const cached = this.readCache.get(listCacheKey)
    if (cached && Date.now() - cached.timestamp < this.LIST_CACHE_TTL) {
      return cached.data as Array<{ key: string; record: StoreRecord }>
    }

    const db = await this.ensureDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly')
      const store = tx.objectStore(storeName)
      const request = store.openCursor()
      const results: Array<{ key: string; record: StoreRecord }> = []

      request.onsuccess = () => {
        const cursor = request.result
        if (cursor) {
          try {
            const { record, migrated } = normalizeStoreRecord(cursor.value)
            results.push({ key: cursor.key as string, record })
            if (migrated) {
              this.put(storeName, cursor.key as string, record).catch(err => {
                console.warn(`[DB] Failed to write back migrated record ${cursor.key}:`, err)
              })
            }
          } catch (err) {
            if (err instanceof MigrationError) {
              console.error(`[DB] Migration failed for ${storeName}/${cursor.key}:`, err.message)
              results.push({ key: cursor.key as string, record: cursor.value as StoreRecord })
            } else {
              throw err
            }
          }
          cursor.continue()
        } else {
          this.readCache.set(listCacheKey, { data: results, timestamp: Date.now() })
          resolve(results)
        }
      }
      request.onerror = () => reject(request.error)
      tx.onerror = () => reject(tx.error)
    })
  }

  /** Query records by an index value. Normalizes each record on read. */
  async query(
    storeName: string,
    indexName: string,
    value: any
  ): Promise<Array<{ key: string; record: StoreRecord }>> {
    const db = await this.ensureDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly')
      const store = tx.objectStore(storeName)
      const index = store.index(indexName)
      const request = index.openCursor(value)
      const results: Array<{ key: string; record: StoreRecord }> = []

      request.onsuccess = () => {
        const cursor = request.result
        if (cursor) {
          try {
            const { record, migrated } = normalizeStoreRecord(cursor.value)
            results.push({ key: cursor.primaryKey as string, record })
            if (migrated) {
              this.put(storeName, cursor.primaryKey as string, record).catch(err => {
                console.warn(`[DB] Failed to write back migrated record ${cursor.primaryKey}:`, err)
              })
            }
          } catch (err) {
            if (err instanceof MigrationError) {
              console.error(`[DB] Migration failed for ${storeName}/${cursor.primaryKey}:`, err.message)
              results.push({ key: cursor.primaryKey as string, record: cursor.value as StoreRecord })
            } else {
              throw err
            }
          }
          cursor.continue()
        } else {
          resolve(results)
        }
      }
      request.onerror = () => reject(request.error)
      tx.onerror = () => reject(tx.error)
    })
  }

  /** Count records in a store. */
  async count(storeName: string): Promise<number> {
    return this.storeOp(storeName, 'readonly', store => store.count())
  }

  /**
   * Get all keys with status >= 1 (wish/watched).
   *
   * Uses a store cursor + JS status check instead of the status index because:
   * - Old records may have string status ("done", "wish") saved from earlier code
   * - IndexedDB key ranges are type-sensitive (numeric lowerBound won't match string keys)
   * - JS comparison handles both numeric (1, 2) and string ("done", "wish") formats
   *
   * Returns a Set of record primary keys (e.g., "movie::37332784").
   */
  async getWatchedIds(storeName: string): Promise<Set<string>> {
    const db = await this.ensureDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly')
      const store = tx.objectStore(storeName)
      const request = store.openCursor()
      const ids = new Set<string>()
      let count = 0

      request.onsuccess = () => {
        const cursor = request.result
        if (cursor) {
          const record = cursor.value
          const rawStatus = record?.status
          // JS status check — handles numeric (0/1/2) and legacy string ("done"/"wish") formats
          const status = typeof rawStatus === 'number' ? rawStatus
            : rawStatus === 'done' ? 2
            : rawStatus === 'wish' ? 1
            : 0
          if (status >= 1) {
            ids.add(cursor.primaryKey as string)
          }
          count++
          cursor.continue()
        } else {
          console.log(`[DB] getWatchedIds(${storeName}): scanned ${count} records, found ${ids.size} watched`)
          resolve(ids)
        }
      }
      request.onerror = () => reject(request.error)
      tx.onerror = () => reject(tx.error)
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
        } catch (err) {
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

  /** Put a PT ID cache entry. Stamps schema version. */
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

  /**
   * Core cross-platform sync logic.
   *
   * Decision tree:
   * 1. Primary platform:
   *    - No existing data → write
   *    - Has data + status/rating changed → update
   *    - Same → skip
   * 2. Each linked platform:
   *    - No existing data → write (with linkedIds pointing to primary)
   *    - Has data + status != 2 → sync status from primary (rating NEVER overwritten)
   *    - Has data + status == 2 (已看) → skip (don't overwrite watched)
   *
   * @returns Object describing what changed and which platforms were synced
   */
  async syncPageRecord(
    platform: string,
    key: string,
    record: StoreRecord,
    linked?: Array<{ platform: string; key: string; url: string }>
  ): Promise<{ changed: boolean; syncedPlatforms: string[] }> {
    const primaryStore = storeNameForPlatform(platform)
    const syncedPlatforms: string[] = []
    let changed = false

    // 1. Primary platform
    const existingPrimary = await this.get(primaryStore, key)

    if (!existingPrimary) {
      // No existing data → write
      await this.put(primaryStore, key, {
        ...record,
        linkedIds: record.linkedIds || {},
        updatedAt: new Date().toISOString(),
      })
      changed = true
      syncedPlatforms.push(platform)
    } else {
      // Has existing data → check if status, rating, or comment changed
      const statusChanged = existingPrimary.status !== record.status
      const ratingChanged = existingPrimary.rating !== record.rating
      const commentChanged = existingPrimary.comment !== record.comment
      if (statusChanged || ratingChanged || commentChanged) {
        await this.put(primaryStore, key, {
          ...existingPrimary,
          ...record,
          linkedIds: { ...existingPrimary.linkedIds, ...record.linkedIds },
          updatedAt: new Date().toISOString(),
        })
        changed = true
        syncedPlatforms.push(platform)
      }
    }

    // 2. Linked platforms — single transaction for all reads + writes
    if (linked && linked.length > 0) {
      const db = await this.ensureDB()
      const allStoreNames = [...RECORD_STORES]
      const tx = db.transaction(allStoreNames, 'readwrite')

      const results: Array<{
        link: { platform: string; key: string; url: string };
        existing: StoreRecord | null;
      }> = []

      // Batch all reads
      for (const link of linked) {
        const linkedStoreName = storeNameForPlatform(link.platform)
        const linkedStore = tx.objectStore(linkedStoreName)
        const getReq = linkedStore.get(link.key)

        await new Promise<void>((resolve) => {
          getReq.onsuccess = () => {
            results.push({ link, existing: getReq.result || null })
            resolve()
          }
          getReq.onerror = () => {
            results.push({ link, existing: null })
            resolve()
          }
        })
      }

      // Process and write in same transaction
      const now = new Date().toISOString()
      for (const { link, existing } of results) {
        const linkedStoreName = storeNameForPlatform(link.platform)
        const linkedStore = tx.objectStore(linkedStoreName)

        // Build backward-linkedIds
        const backwardLinkedIds: Record<string, string> = { [platform]: key }

        if (!existing) {
          // No existing → write with linkedIds pointing back to primary
          linkedStore.put({
            url: link.url,
            status: record.status,
            rating: record.rating,
            comment: record.comment,
            updatedAt: now,
            linkedIds: backwardLinkedIds,
          }, link.key)
          changed = true
          syncedPlatforms.push(link.platform)
        } else if (existing.status !== 2) {
          // Has data but status != 2 (not watched) → sync status only
          linkedStore.put({
            ...existing,
            status: record.status,           // Sync status from primary
            rating: existing.rating,          // NEVER overwrite linked rating
            comment: record.comment ?? existing.comment,  // Sync comment if provided
            updatedAt: now,
            linkedIds: { ...existing.linkedIds, ...backwardLinkedIds },
          }, link.key)
          changed = true
          syncedPlatforms.push(link.platform)
        }
        // If status == 2 → skip (user watched on this platform, don't overwrite)
      }

      // Wait for transaction to complete
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error)
      })
    }

    return { changed, syncedPlatforms }
  }

  // ==================== Bulk Operations ====================

  /** Get all records from all record stores (for export). */
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
