/**
 * TtlCacheStore — IndexedDB-backed persistent cache (L2 layer).
 *
 * Wraps the existing `ttl_cache` store with get/set/delete/cleanup.
 * The store has an `expiry` index that this class uses for efficient
 * expired-entry cleanup.
 */

export interface TtlCacheRow {
  value: unknown
  expiry: number    // absolute timestamp in ms
}

/** Minimal DB interface so callers can inject a mock for tests. */
export interface DbAdapter {
  get<T>(key: string): Promise<T | null>
  put(key: string, value: unknown): Promise<void>
  delete(key: string): Promise<void>
  clear(): Promise<void>
}

export class TtlCacheStore {
  constructor(private readonly db: DbAdapter) {}

  async get<T>(key: string): Promise<T | null> {
    const row = await this.db.get<TtlCacheRow>(key)
    if (!row) return null
    if (Date.now() >= row.expiry) {
      await this.db.delete(key)
      return null
    }
    return row.value as T
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    await this.db.put(key, {
      value,
      expiry: Date.now() + ttlMs,
    })
  }

  async delete(key: string): Promise<void> {
    await this.db.delete(key)
  }

  async clear(): Promise<void> {
    await this.db.clear()
  }
}