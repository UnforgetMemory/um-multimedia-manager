/**
 * IndexedDB Database Manager v6
 *
 * Architecture:
 * - Each platform gets its own object store: douban_records, imdb_records, neodb_records, tmdb_records
 * - Record key format: "type::providerId" (e.g. "movie::37332784")
 * - Cross-platform links stored in `linkedIds` map on each record
 * - TTL cache and sync logs stores maintained for supporting functionality
 *
 * v6 migration drops all old stores (records, quarantine, migration-log, etc.)
 * and creates fresh per-platform stores. No data migration — user approved wipe.
 */

import type { StoreRecord } from '../types'

export const DB_NAME = 'umm-media-db'
export const DB_VERSION = 6

export const STORE_NAMES = {
  DOUBAN: 'douban_records',
  IMDB: 'imdb_records',
  NEODB: 'neodb_records',
  TMDB: 'tmdb_records',
  TTL_CACHE: 'ttl_cache',
  SYNC_LOGS: 'sync_logs',
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

        // Drop ALL old stores from any previous version
        const existing = Array.from(db.objectStoreNames)
        for (const name of existing) {
          db.deleteObjectStore(name)
        }

        // Create v6 per-platform record stores
        for (const name of RECORD_STORES) {
          const store = db.createObjectStore(name)
          store.createIndex('status', 'status', { unique: false })
          store.createIndex('updatedAt', 'updatedAt', { unique: false })
        }

        // TTL cache store (string key, value with expiry)
        const ttlCache = db.createObjectStore(STORE_NAMES.TTL_CACHE)
        ttlCache.createIndex('expiry', 'expiry', { unique: false })

        // Sync logs store (auto-increment key)
        db.createObjectStore(STORE_NAMES.SYNC_LOGS, { autoIncrement: true })

        console.log(`[DB] Created v6 schema with ${RECORD_STORES.length} record stores`)
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

  // ==================== Public API ====================

  /** Get a single record by key. Returns null if not found. */
  async get(storeName: string, key: string): Promise<StoreRecord | null> {
    const result = await this.storeOp(storeName, 'readonly', store => store.get(key))
    return (result as StoreRecord) || null
  }

  /** Put (insert or update) a record. */
  async put(storeName: string, key: string, record: StoreRecord): Promise<void> {
    record.updatedAt = record.updatedAt || new Date().toISOString()
    await this.storeOp(storeName, 'readwrite', store => store.put(record, key))
  }

  /** Delete a record by key. */
  async delete(storeName: string, key: string): Promise<void> {
    await this.storeOp(storeName, 'readwrite', store => store.delete(key))
  }

  /** Get all records from a store. */
  async getAll(storeName: string): Promise<Array<{ key: string; record: StoreRecord }>> {
    const db = await this.ensureDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly')
      const store = tx.objectStore(storeName)
      const request = store.openCursor()
      const results: Array<{ key: string; record: StoreRecord }> = []

      request.onsuccess = () => {
        const cursor = request.result
        if (cursor) {
          results.push({ key: cursor.key as string, record: cursor.value as StoreRecord })
          cursor.continue()
        } else {
          resolve(results)
        }
      }
      request.onerror = () => reject(request.error)
      tx.onerror = () => reject(tx.error)
    })
  }

  /** Query records by an index value. */
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
          results.push({ key: cursor.primaryKey as string, record: cursor.value as StoreRecord })
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
      // Has existing data → check if status or rating changed
      const statusChanged = existingPrimary.status !== record.status
      const ratingChanged = existingPrimary.rating !== record.rating
      if (statusChanged || ratingChanged) {
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

    // 2. Linked platforms
    if (linked) {
      for (const link of linked) {
        const linkedStore = storeNameForPlatform(link.platform)
        const linkedExisting = await this.get(linkedStore, link.key)

        // Build backward-linkedIds
        const backwardLinkedIds: Record<string, string> = {}
        backwardLinkedIds[platform] = key

        if (!linkedExisting) {
          // No existing → write with linkedIds pointing back to primary
          await this.put(linkedStore, link.key, {
            url: link.url,
            status: record.status,
            rating: record.rating,
            updatedAt: new Date().toISOString(),
            linkedIds: backwardLinkedIds,
          })
          changed = true
          syncedPlatforms.push(link.platform)
        } else if (linkedExisting.status !== 2) {
          // Has data but status != 2 (not watched) → sync status only
          // Preserve the linked platform's URL and rating
          await this.put(linkedStore, link.key, {
            ...linkedExisting,
            status: record.status,           // Sync status from primary
            rating: linkedExisting.rating,    // NEVER overwrite linked rating
            updatedAt: new Date().toISOString(),
            linkedIds: { ...linkedExisting.linkedIds, ...backwardLinkedIds },
          })
          changed = true
          syncedPlatforms.push(link.platform)
        }
        // If status == 2 → skip (user watched on this platform, don't overwrite)
      }
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
      tx.oncomplete = () => resolve()
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
