import { test, expect } from '@playwright/test';
import { LruCache, DEFAULT_LRU_TTL_MS } from '@/engine/cache/lru-cache';

/**
 * X12-A coverage wave — LruCache (engine/cache/lru-cache.ts).
 *
 * The module doc pins the contract: synchronous Map-backed LRU with TTL, linear
 * eviction scan. The only time source is Date.now, so the whole spec runs on a
 * stubbed clock — TTL boundaries are then exact, no sleeps.
 */

const T0 = 1_700_000_000_000;
const REAL_NOW = Date.now;

let now = T0;

function advance(ms: number): void {
  now += ms;
}

test.beforeEach(() => {
  now = T0;
  Date.now = () => now;
});

test.afterEach(() => {
  Date.now = REAL_NOW;
});

test.describe('get / set basics', () => {
  test('set then get round-trips the stored value by identity', () => {
    const cache = new LruCache<{ n: number }>();
    const value = { n: 42 };
    cache.set('k', value);
    expect(cache.get('k')).toBe(value);
    expect(cache.size).toBe(1);
  });

  test('a get on a missing key returns undefined and counts a miss, not a hit', () => {
    const cache = new LruCache();
    expect(cache.get('absent')).toBeUndefined();
    const stats = cache.getStats();
    expect(stats.misses).toBe(1);
    expect(stats.hits).toBe(0);
  });

  test('the default TTL is DEFAULT_LRU_TTL_MS: alive one ms before, dead at the boundary', () => {
    const cache = new LruCache<string>();
    cache.set('k', 'v');
    advance(DEFAULT_LRU_TTL_MS - 1);
    expect(cache.get('k')).toBe('v');
    // Expiry check is `Date.now() >= expiresAt` — the boundary ms is already dead.
    advance(1);
    expect(cache.get('k')).toBeUndefined();
    expect(cache.size).toBe(0); // expired read lazily deletes
  });

  test('a per-call ttlMs overrides the default; ttl 0 expires on the same tick', () => {
    const cache = new LruCache<string>({ defaultTtlMs: 60_000 });
    cache.set('short', 'v', 10);
    cache.set('zero', 'v', 0);
    expect(cache.get('zero')).toBeUndefined();
    advance(9);
    expect(cache.get('short')).toBe('v');
    advance(1);
    expect(cache.get('short')).toBeUndefined();
    advance(50_000);
    expect(cache.get('zero')).toBeUndefined();
    expect(cache.get('short')).toBeUndefined();
  });

  test('a partial options object keeps the other defaults', () => {
    const cache = new LruCache<string>({ maxSize: 2 });
    cache.set('a', 'x');
    cache.set('b', 'y');
    cache.set('c', 'z'); // maxSize 2 enforced, default TTL untouched
    expect(cache.size).toBe(2);
    expect(cache.get('a')).toBeUndefined();
    advance(DEFAULT_LRU_TTL_MS - 1);
    expect(cache.get('c')).toBe('z');
  });
});

test.describe('has / delete / deleteByPrefix', () => {
  test('has mirrors the TTL boundary and lazily deletes an expired entry', () => {
    const cache = new LruCache<string>({ defaultTtlMs: 100 });
    expect(cache.has('absent')).toBe(false);
    cache.set('k', 'v');
    advance(99);
    expect(cache.has('k')).toBe(true);
    advance(1);
    expect(cache.has('k')).toBe(false);
    expect(cache.size).toBe(0);
  });

  test('has does not touch the hit/miss counters', () => {
    const cache = new LruCache<string>();
    cache.set('k', 'v');
    cache.has('k');
    cache.has('absent');
    const stats = cache.getStats();
    expect([stats.hits, stats.misses]).toEqual([0, 0]);
  });

  test('delete reports whether a row was removed', () => {
    const cache = new LruCache<string>();
    cache.set('k', 'v');
    expect(cache.delete('k')).toBe(true);
    expect(cache.delete('k')).toBe(false);
    expect(cache.size).toBe(0);
  });

  test('deleteByPrefix returns the number of removed keys and 0 when nothing matches', () => {
    const cache = new LruCache<number>();
    cache.set('douban_records::movie::1', 1);
    cache.set('douban_records::movie::2', 2);
    cache.set('imdb_records::movie::1', 3);
    expect(cache.deleteByPrefix('douban_records::')).toBe(2);
    expect(cache.deleteByPrefix('douban_records::')).toBe(0);
    expect(cache.deleteByPrefix('nothing::')).toBe(0);
    expect(cache.size).toBe(1);
    // Exact prefix semantics: only the fully-matching store namespace goes.
    expect(cache.get('imdb_records::movie::1')).toBe(3);
  });

  test('the empty prefix deletes every entry', () => {
    const cache = new LruCache<number>();
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.deleteByPrefix('')).toBe(2);
    expect(cache.size).toBe(0);
  });
});

test.describe('LRU eviction', () => {
  test('at capacity the least-recently-ACCESSED (not inserted) entry is evicted', () => {
    const cache = new LruCache<string>({ maxSize: 2, defaultTtlMs: 10_000 });
    cache.set('a', 'A');
    cache.set('b', 'B');
    advance(5);
    expect(cache.get('a')).toBe('A'); // refreshes 'a'; 'b' is now the stalest
    advance(5);
    cache.set('c', 'C');

    expect(cache.size).toBe(2);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe('A');
    expect(cache.get('c')).toBe('C');
    expect(cache.getStats().evictions).toBe(1);
  });

  test('overwriting an existing key at capacity evicts nothing', () => {
    const cache = new LruCache<string>({ maxSize: 2 });
    cache.set('a', 'A1');
    cache.set('b', 'B');
    cache.set('a', 'A2');
    expect(cache.size).toBe(2);
    expect(cache.get('a')).toBe('A2');
    expect(cache.getStats().evictions).toBe(0);
  });

  test('an eviction is counted in stats and the entry count drops', () => {
    const cache = new LruCache<number>({ maxSize: 1 });
    cache.set('x', 1);
    advance(1);
    cache.set('y', 2);
    const stats = cache.getStats();
    expect(stats.evictions).toBe(1);
    expect(stats.entries).toBe(1);
    expect(cache.get('x')).toBeUndefined();
    expect(cache.get('y')).toBe(2);
  });

  test('an empty-string key is a normal LRU candidate: maxSize is a hard cap', () => {
    // The '' key used to be skipped by a truthiness check in evictLru, so it survived
    // every trim and the map grew unboundedly past maxSize. Corrected contract:
    // size never exceeds maxSize, whatever the key spells.
    const cache = new LruCache<string>({ maxSize: 2 });
    cache.set('', 'empty'); // oldest lastAccessed, evictable in principle
    cache.set('z', 'z');
    advance(1);
    cache.set('b', 'b');
    expect(cache.size).toBe(2);
    expect(cache.get('')).toBeUndefined();
    expect(cache.getStats().evictions).toBe(1);

    // Keep inserting: '' must not act as an immortal entry that blocks all future evictions.
    for (let i = 0; i < 5; i++) {
      advance(1);
      cache.set(`k${i}`, 'v');
    }
    expect(cache.size).toBe(2);
    expect(cache.getStats().evictions).toBe(6);
  });
});

test.describe('getStats', () => {
  test('hitRate is 0 with no operations and hits/(hits+misses) after', () => {
    const cache = new LruCache<string>();
    expect(cache.getStats().hitRate).toBe(0);

    cache.set('k', 'v');
    cache.get('k'); // hit
    cache.get('miss-1');
    cache.get('miss-2');
    cache.get('miss-3');
    const stats = cache.getStats();
    expect([stats.hits, stats.misses, stats.hitRate]).toEqual([1, 3, 0.25]);
  });

  test('an expired get counts as a miss (the entry vanishes from `entries`)', () => {
    const cache = new LruCache<string>({ defaultTtlMs: 10 });
    cache.set('k', 'v');
    advance(10);
    expect(cache.get('k')).toBeUndefined();
    const stats = cache.getStats();
    expect(stats.misses).toBe(1);
    expect(stats.hits).toBe(0);
    expect(stats.entries).toBe(0);
  });

  test('clear drops entries and resets every counter', () => {
    const cache = new LruCache<number>({ maxSize: 1 });
    cache.set('a', 1);
    cache.get('a');
    cache.get('miss');
    advance(1);
    cache.set('b', 2); // evicts 'a'
    cache.clear();
    expect(cache.getStats()).toEqual({
      entries: 0,
      hits: 0,
      misses: 0,
      evictions: 0,
      hitRate: 0,
      estimatedSizeBytes: 0,
    });
    expect(cache.size).toBe(0);
  });
});

test.describe('estimatedSizeBytes', () => {
  test('2 bytes per UTF-16 char of key and JSON value', () => {
    const cache = new LruCache<{ a: number }>();
    cache.set('ab', { a: 1 });
    // key 'ab' → 2*2=4; value '{"a":1}' → 7*2=14.
    expect(cache.getStats().estimatedSizeBytes).toBe(18);
  });

  test('a JSON.stringify failure (circular ref) contributes the fixed 128-byte fallback', () => {
    const cache = new LruCache<Record<string, unknown>>();
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    cache.set('k', circular);
    // key 'k' → 1*2=2; unserializable value → +128.
    expect(cache.getStats().estimatedSizeBytes).toBe(130);
  });
});
