/**
 * LruCache — in-memory LRU cache with TTL support.
 *
 * Internal store is a plain Map. LRU eviction uses a linear scan
 * over entries (fine for ≤500 entries).  All operations are
 * synchronous — no I/O, no timers.
 */

export interface LruCacheOptions {
  maxSize: number
  defaultTtlMs: number
}

export interface LruCacheStats {
  entries: number
  hits: number
  misses: number
  evictions: number
  hitRate: number
  estimatedSizeBytes: number
}

interface LruEntry<T> {
  data: T
  expiresAt: number
  lastAccessed: number
}

const DEFAULT_OPTIONS: LruCacheOptions = {
  maxSize: 500,
  defaultTtlMs: 30_000,
}

export class LruCache<T = unknown> {
  private readonly map = new Map<string, LruEntry<T>>()
  private readonly opts: LruCacheOptions
  private hits = 0
  private misses = 0
  private evictions = 0

  constructor(opts?: Partial<LruCacheOptions>) {
    this.opts = { ...DEFAULT_OPTIONS, ...opts }
  }

  get size(): number {
    return this.map.size
  }

  get(key: string): T | undefined {
    const entry = this.map.get(key)
    if (!entry) {
      this.misses++
      return undefined
    }
    if (Date.now() >= entry.expiresAt) {
      this.map.delete(key)
      this.misses++
      return undefined
    }
    entry.lastAccessed = Date.now()
    this.hits++
    return entry.data
  }

  set(key: string, value: T, ttlMs?: number): void {
    if (this.map.size >= this.opts.maxSize && !this.map.has(key)) {
      this.evictLru()
    }
    const ttl = ttlMs ?? this.opts.defaultTtlMs
    this.map.set(key, {
      data: value,
      expiresAt: Date.now() + ttl,
      lastAccessed: Date.now(),
    })
  }

  has(key: string): boolean {
    const entry = this.map.get(key)
    if (!entry) return false
    if (Date.now() >= entry.expiresAt) {
      this.map.delete(key)
      return false
    }
    return true
  }

  delete(key: string): boolean {
    return this.map.delete(key)
  }

  /** Delete all entries whose key starts with the given prefix. */
  deleteByPrefix(prefix: string): number {
    let count = 0
    for (const key of this.map.keys()) {
      if (key.startsWith(prefix)) {
        this.map.delete(key)
        count++
      }
    }
    return count
  }

  clear(): void {
    this.map.clear()
    this.hits = 0
    this.misses = 0
    this.evictions = 0
  }

  getStats(): LruCacheStats {
    const total = this.hits + this.misses
    const estimatedSizeBytes = this.estimateSize()
    return {
      entries: this.map.size,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      hitRate: total > 0 ? this.hits / total : 0,
      estimatedSizeBytes,
    }
  }

  private evictLru(): void {
    let oldestKey: string | undefined
    let oldestTime = Infinity
    for (const [key, entry] of this.map) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed
        oldestKey = key
      }
    }
    if (oldestKey) {
      this.map.delete(oldestKey)
      this.evictions++
    }
  }

  private estimateSize(): number {
    let total = 0
    for (const [key, entry] of this.map) {
      total += key.length * 2
      try {
        total += JSON.stringify(entry.data).length * 2
      } catch {
        total += 128
      }
    }
    return total
  }
}