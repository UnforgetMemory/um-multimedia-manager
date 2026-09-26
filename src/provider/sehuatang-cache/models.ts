/**
 * Sehuatang detail cache — standalone IndexedDB layer (ADR-024 D2).
 *
 * Fully isolated from the main `umm-media-db` database:
 * - own database `umm-sehuatang-cache` (v1, objectStore `details`, keyPath `tid`)
 * - NOT registered in STORE_NAMES / BACKUP_STORES / migrate chain
 * - NOT routed through DataScheduler — the background handlers call this
 *   module directly and bypass the main-DB readiness gate
 *
 * The cache is an optimization layer, never a correctness layer: callers
 * degrade to a direct fetch on any failure.
 */

export interface SehuatangDetailCacheEntry {
  tid: string
  imageUrl: string | null
  magnetLink: string | null
  cachedAt: number
}

export const SEHUATANG_CACHE_DB_NAME = 'umm-sehuatang-cache'
export const SEHUATANG_CACHE_DB_VERSION = 1
export const DETAIL_STORE_NAME = 'details'

/** Cache TTL: 7 days (exported for tests). */
export const TTL_MS = 7 * 24 * 60 * 60 * 1000

/** LRU cap: entries beyond this limit are evicted oldest-first by cachedAt. */
export const MAX_ENTRIES = 500

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
  })
}

export class SehuatangDetailCacheDB {
  private db: IDBDatabase | null = null
  private openPromise: Promise<IDBDatabase> | null = null
  private readonly dbName: string

  constructor(dbName: string = SEHUATANG_CACHE_DB_NAME) {
    this.dbName = dbName
  }

  /** Lazy open with a cached promise so concurrent callers share one open. */
  private open(): Promise<IDBDatabase> {
    if (this.db) return Promise.resolve(this.db)
    if (this.openPromise) return this.openPromise

    this.openPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.dbName, SEHUATANG_CACHE_DB_VERSION)

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains(DETAIL_STORE_NAME)) {
          db.createObjectStore(DETAIL_STORE_NAME, { keyPath: 'tid' })
        }
      }

      request.onsuccess = () => {
        const db = request.result
        db.onversionchange = () => {
          db.close()
          this.db = null
          this.openPromise = null
        }
        this.db = db
        resolve(db)
      }

      request.onerror = () => {
        this.openPromise = null
        reject(request.error ?? new Error(`Failed to open ${this.dbName}`))
      }
    })

    return this.openPromise
  }

  /**
   * Batch read. Expired entries (age >= TTL_MS) are treated as misses and
   * deleted inline. Missing tids are simply absent from the result.
   */
  async getBatch(tids: string[]): Promise<Record<string, SehuatangDetailCacheEntry>> {
    const result: Record<string, SehuatangDetailCacheEntry> = {}
    if (tids.length === 0) return result

    const db = await this.open()
    const now = Date.now()
    const tx = db.transaction(DETAIL_STORE_NAME, 'readwrite')
    const store = tx.objectStore(DETAIL_STORE_NAME)

    await Promise.all(
      tids.map(
        (tid) =>
          new Promise<void>((resolve, reject) => {
            const request = store.get(tid)
            request.onsuccess = () => {
              const entry = request.result as SehuatangDetailCacheEntry | undefined
              if (entry && now - entry.cachedAt < TTL_MS) {
                result[tid] = entry
              } else if (entry) {
                // Expired → miss, and evict inline.
                store.delete(tid)
              }
              resolve()
            }
            request.onerror = () => reject(request.error ?? new Error('get failed'))
          }),
      ),
    )

    await transactionDone(tx)
    return result
  }

  /**
   * Batch write, then LRU eviction: when the store exceeds MAX_ENTRIES,
   * delete the oldest entries by cachedAt until the cap is restored.
   */
  async putBatch(entries: SehuatangDetailCacheEntry[]): Promise<void> {
    if (entries.length === 0) return

    const db = await this.open()
    const tx = db.transaction(DETAIL_STORE_NAME, 'readwrite')
    const store = tx.objectStore(DETAIL_STORE_NAME)

    for (const entry of entries) {
      store.put(entry)
    }

    // LRU eviction — reads inside the same transaction see the pending puts.
    const all = await requestToPromise(store.getAll() as IDBRequest<SehuatangDetailCacheEntry[]>)
    if (all.length > MAX_ENTRIES) {
      const excess = all.length - MAX_ENTRIES
      const oldestFirst = [...all].sort((a, b) => a.cachedAt - b.cachedAt)
      for (const stale of oldestFirst.slice(0, excess)) {
        store.delete(stale.tid)
      }
    }

    await transactionDone(tx)
  }

  /** Close the connection (tests and teardown only). */
  close(): void {
    this.db?.close()
    this.db = null
    this.openPromise = null
  }
}

/** Module-level lazy singleton used by the background message handlers. */
const singleton = new SehuatangDetailCacheDB()

export async function getDetailCacheBatch(
  tids: string[],
): Promise<Record<string, SehuatangDetailCacheEntry>> {
  return singleton.getBatch(tids)
}

export async function putDetailCacheBatch(
  entries: SehuatangDetailCacheEntry[],
): Promise<void> {
  return singleton.putBatch(entries)
}
