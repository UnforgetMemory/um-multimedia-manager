import { test, expect } from '@playwright/test';
import {
  MAX_ENTRIES,
  TTL_MS,
  isEntryFresh,
  planEvictionExcess,
  type SehuatangDetailCacheEntry,
} from '@/provider/sehuatang-cache/mapping';

/**
 * Sehuatang cache pure seam (mapping.ts) — TTL and LRU policy predicates
 * the IndexedDB transport (transport.ts) now delegates to.
 */

function entry(tid: string, cachedAt: number): SehuatangDetailCacheEntry {
  return { tid, imageUrl: null, magnetLink: null, cachedAt };
}

test.describe('isEntryFresh', () => {
  test('entry younger than TTL is fresh', () => {
    const now = 1_000_000_000;
    expect(isEntryFresh(entry('1', now - 1), now)).toBe(true);
  });

  test('strict boundary: age === TTL is a miss (stale)', () => {
    const now = 1_000_000_000;
    expect(isEntryFresh(entry('1', now - TTL_MS), now)).toBe(false);
  });

  test('older than TTL is stale, future timestamp is fresh', () => {
    const now = 1_000_000_000;
    expect(isEntryFresh(entry('1', now - TTL_MS - 1), now)).toBe(false);
    expect(isEntryFresh(entry('1', now + 1), now)).toBe(true);
  });
});

test.describe('planEvictionExcess', () => {
  test('at or below the cap evicts nothing', () => {
    expect(planEvictionExcess(MAX_ENTRIES)).toBe(0);
    expect(planEvictionExcess(MAX_ENTRIES - 1)).toBe(0);
    expect(planEvictionExcess(0)).toBe(0);
  });

  test('over the cap reports the exact excess', () => {
    expect(planEvictionExcess(MAX_ENTRIES + 1)).toBe(1);
    expect(planEvictionExcess(MAX_ENTRIES + 42)).toBe(42);
  });
});
