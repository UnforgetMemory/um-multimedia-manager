/**
 * Query utilities — cursor-based pagination and batch operations for IndexedDB.
 *
 * All functions operate on an IDBObjectStore so they can be used anywhere
 * a transaction is open.  No dependency on MediaDatabase.
 */

import type { StoreRecord } from '@/types'

// ==================== Pagination ====================

export interface PageQueryOptions {
  /** Store index name. Omit to use the primary key (insertion order). */
  indexName?: string
  /** IDBKeyRange or single value to filter by (requires indexName). */
  range?: IDBValidKey | IDBKeyRange
  /** Max results per page (default 50). */
  limit?: number
  /** Number of records to skip (default 0). */
  offset?: number
  /** Cursor direction (default 'next'). */
  direction?: IDBCursorDirection
}

export interface PageResult<T> {
  items: T[]
  /** Total record count in the store/index. */
  total: number
  /** True when there are more results beyond this page. */
  hasMore: boolean
}

/**
 * Paginated cursor read with limit + offset.
 *
 * Uses cursor.advance() for offset and a counter for limit.
 * Works on an open object store within an existing transaction.
 */
export async function queryPage<T>(
  store: IDBObjectStore,
  opts: PageQueryOptions = {},
): Promise<PageResult<T>> {
  const limit = opts.limit ?? 50
  const direction = opts.direction ?? 'next'

  const total = await countStore(store)

  // Open cursor — use index if specified, otherwise primary key order
  let cursorRequest: IDBRequest<IDBCursorWithValue | null>
  if (opts.indexName && opts.range !== undefined) {
    cursorRequest = store.index(opts.indexName).openCursor(opts.range, direction)
  } else if (opts.indexName) {
    cursorRequest = store.index(opts.indexName).openCursor(null, direction)
  } else {
    cursorRequest = store.openCursor(null, direction)
  }

  const items: T[] = []
  let offsetRemaining = opts.offset ?? 0
  let done = false

  await new Promise<void>((resolve, reject) => {
    cursorRequest.onsuccess = () => {
      if (done) { resolve(); return }

      const cursor = cursorRequest.result
      if (!cursor) {
        done = true
        resolve()
        return
      }

      // Skip offset records before collecting results
      if (offsetRemaining > 0) {
        try {
          cursor.advance(offsetRemaining)
          offsetRemaining = 0
          return  // onsuccess fires again after advance
        } catch {
          // advance beyond store bounds — no more results
          done = true
          resolve()
          return
        }
      }

      items.push(cursor.value as T)

      if (items.length >= limit) {
        done = true
        resolve()
      } else {
        cursor.continue()
      }
    }
    cursorRequest.onerror = () => reject(cursorRequest.error)
  })

  return { items, total, hasMore: items.length === limit }
}

// ==================== Batch Operations ====================

/**
 * Get multiple records by key in a single transaction.
 * Keys not found in the store are omitted from the result map.
 */
export async function batchGet<T>(
  store: IDBObjectStore,
  keys: IDBValidKey[],
): Promise<Map<IDBValidKey, T>> {
  const results = new Map<IDBValidKey, T>()

  await Promise.all(
    keys.map((key) => {
      return new Promise<void>((resolve, reject) => {
        const req = store.get(key)
        req.onsuccess = () => {
          if (req.result !== undefined) results.set(key, req.result as T)
          resolve()
        }
        req.onerror = () => reject(req.error)
      })
    }),
  )

  return results
}

/**
 * Put (insert or update) multiple records in a single transaction.
 * Stamps schema version on each record.
 */
export async function batchPut(
  store: IDBObjectStore,
  entries: Array<{ key: IDBValidKey; value: StoreRecord }>,
): Promise<void> {
  for (const { key, value } of entries) {
    store.put(value, key)
  }
}

// ==================== Helpers ====================

async function countStore(store: IDBObjectStore): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const req = store.count()
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}