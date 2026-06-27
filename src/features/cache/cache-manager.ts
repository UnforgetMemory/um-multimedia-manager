/**
 * CacheManager — unified L1 (in-memory LRU) → L2 (IndexedDB TTL) orchestrator.
 *
 * L1 is always present.  L2 is optional — only used when a TtlCacheStore
 * is provided and the `persist` flag is set on individual operations.
 */

import { LruCache, type LruCacheOptions } from './lru-cache'
import type { TtlCacheStore } from './ttl-cache-store'

export interface CacheManagerOptions {
  maxSize?: number
  defaultTtlMs?: number
}

export interface CacheOptions {
  /** If true, also persist to L2 (IndexedDB). */
  persist?: boolean
  /** Per-entry TTL in ms. Falls back to defaultTtlMs. */
  ttlMs?: number
}

export class CacheManager {
  readonly l1: LruCache
  private readonly l2?: TtlCacheStore

  constructor(opts?: CacheManagerOptions, l2?: TtlCacheStore) {
    const lruOpts: Partial<LruCacheOptions> = {}
    if (opts?.maxSize) lruOpts.maxSize = opts.maxSize
    if (opts?.defaultTtlMs) lruOpts.defaultTtlMs = opts.defaultTtlMs
    this.l1 = new LruCache(lruOpts)
    this.l2 = l2
  }

  async get<T>(namespace: string, key: string): Promise<T | undefined> {
    const k = `${namespace}::${key}`
    const l1Val = this.l1.get(k) as T | undefined
    if (l1Val !== undefined) return l1Val

    if (!this.l2) return undefined
    const l2Val = await this.l2.get<T>(k)
    if (l2Val !== null) {
      this.l1.set(k, l2Val)
      return l2Val
    }
    return undefined
  }

  async set<T>(namespace: string, key: string, value: T, opts?: CacheOptions): Promise<void> {
    const k = `${namespace}::${key}`
    const ttlMs = opts?.ttlMs
    this.l1.set(k, value, ttlMs)
    if (opts?.persist && this.l2) {
      await this.l2.set(k, value, ttlMs ?? 30_000)
    }
  }

  has(namespace: string, key: string): boolean {
    return this.l1.has(`${namespace}::${key}`)
  }

  async invalidate(namespace: string, key?: string): Promise<void> {
    if (key) {
      const k = `${namespace}::${key}`
      this.l1.delete(k)
      await this.l2?.delete(k)
    } else {
      this.l1.deleteByPrefix(`${namespace}::`)
    }
  }

  async invalidateByPattern(namespace: string, prefix: string): Promise<void> {
    const fullPrefix = `${namespace}::${prefix}`
    this.l1.deleteByPrefix(fullPrefix)
  }

  async clear(): Promise<void> {
    this.l1.clear()
    await this.l2?.clear()
  }

  getStats() {
    return this.l1.getStats()
  }
}