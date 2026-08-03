/**
 * CacheManager — L1 in-memory LRU cache orchestrator.
 */

import { LruCache, type LruCacheOptions } from './lru-cache'

export interface CacheManagerOptions {
  maxSize?: number
  defaultTtlMs?: number
}

export interface CacheOptions {
  /** Per-entry TTL in ms. Falls back to defaultTtlMs. */
  ttlMs?: number
}

export class CacheManager {
  readonly l1: LruCache

  constructor(opts?: CacheManagerOptions) {
    const lruOpts: Partial<LruCacheOptions> = {}
    if (opts?.maxSize) lruOpts.maxSize = opts.maxSize
    if (opts?.defaultTtlMs) lruOpts.defaultTtlMs = opts.defaultTtlMs
    this.l1 = new LruCache(lruOpts)
  }

  async get<T>(namespace: string, key: string): Promise<T | undefined> {
    const k = `${namespace}::${key}`
    const l1Val = this.l1.get(k) as T | undefined
    if (l1Val !== undefined) return l1Val

    return undefined
  }

  async set<T>(namespace: string, key: string, value: T, opts?: CacheOptions): Promise<void> {
    const k = `${namespace}::${key}`
    const ttlMs = opts?.ttlMs
    this.l1.set(k, value, ttlMs)
  }

  has(namespace: string, key: string): boolean {
    return this.l1.has(`${namespace}::${key}`)
  }

  async invalidate(namespace: string, key?: string): Promise<void> {
    if (key) {
      const k = `${namespace}::${key}`
      this.l1.delete(k)
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
  }

  getStats() {
    return this.l1.getStats()
  }
}
