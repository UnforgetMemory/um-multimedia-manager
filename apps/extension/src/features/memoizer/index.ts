/**
 * Memoizer — computation result caching with TTL.
 *
 * Prevents repeated expensive computation by caching results
 * keyed by a string identifier.  Entries expire after a configurable TTL.
 * The cache is in-memory only (ephemeral, resets on SW wake).
 */

export interface MemoizerOptions {
  defaultTtlMs: number
}

interface MemoEntry {
  result: unknown
  expiresAt: number
}

const DEFAULT_OPTIONS: MemoizerOptions = { defaultTtlMs: 5_000 }

export class Memoizer {
  private readonly cache = new Map<string, MemoEntry>()
  private readonly opts: MemoizerOptions

  constructor(opts?: Partial<MemoizerOptions>) {
    this.opts = { ...DEFAULT_OPTIONS, ...opts }
  }

  /**
   * Get a memoized result.  Returns undefined when the key is missing
   * or the entry has expired.
   */
  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key)
    if (!entry) return undefined
    if (Date.now() >= entry.expiresAt) {
      this.cache.delete(key)
      return undefined
    }
    return entry.result as T
  }

  /**
   * Set a memoized result.
   */
  set<T>(key: string, result: T, ttlMs?: number): void {
    this.cache.set(key, {
      result,
      expiresAt: Date.now() + (ttlMs ?? this.opts.defaultTtlMs),
    })
  }

  /**
   * Memoize — get or compute.
   * If the key exists and is not expired, return the cached value.
   * Otherwise call `fn()`, cache the result, and return it.
   */
  memoize<T>(key: string, fn: () => T, ttlMs?: number): T {
    const cached = this.get<T>(key)
    if (cached !== undefined) return cached
    const result = fn()
    this.set(key, result, ttlMs)
    return result
  }

  /**
   * Async variant of memoize.
   */
  async memoizeAsync<T>(key: string, fn: () => Promise<T>, ttlMs?: number): Promise<T> {
    const cached = this.get<T>(key)
    if (cached !== undefined) return cached
    const result = await fn()
    this.set(key, result, ttlMs)
    return result
  }

  /** Invalidate a specific key. */
  invalidate(key: string): void {
    this.cache.delete(key)
  }

  /** Invalidate all keys matching a prefix. */
  invalidateByPrefix(prefix: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) this.cache.delete(key)
    }
  }

  /** Clear all memoized results. */
  clear(): void {
    this.cache.clear()
  }

  /** Number of cached entries. */
  get size(): number {
    return this.cache.size
  }
}