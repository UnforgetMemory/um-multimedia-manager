import { test, expect } from '@playwright/test';
import {
  SHELF_CACHE_TTL_MS,
  buildShelfMarkPayload,
  extractBusinessMessage,
  isShelfCacheEntryStale,
  sanitizeBearerToken,
  toCatalogFetchResult,
  toShelfItemResponse,
} from '@/provider/neodb/mapping';

/**
 * NeoDB pure seam (mapping.ts) — direct unit tests for payload↔domain
 * transforms and policy that used to be welded into the fetch transport.
 */

test.describe('sanitizeBearerToken', () => {
  test('trims whitespace and strips control characters, keeps printable text', () => {
    expect(sanitizeBearerToken('  tok\n')).toBe('tok');
    expect(sanitizeBearerToken('a\x00b\x1Fc\x7Fd')).toBe('abcd');
    expect(sanitizeBearerToken('令牌-Ö×')).toBe('令牌-Ö×');
  });

  test('all-control token collapses to empty string', () => {
    expect(sanitizeBearerToken('\x01\x02')).toBe('');
  });
});

test.describe('buildShelfMarkPayload', () => {
  test('base payload only carries shelf_type + visibility', () => {
    expect(buildShelfMarkPayload('wishlist')).toEqual({
      shelf_type: 'wishlist',
      visibility: 0,
    });
  });

  test('rating 0/undefined is omitted, positive rating is carried', () => {
    expect(buildShelfMarkPayload('complete', 0).rating_grade).toBeUndefined();
    expect(buildShelfMarkPayload('complete', 8).rating_grade).toBe(8);
  });

  test('empty comment is omitted, non-empty comment is carried', () => {
    expect(buildShelfMarkPayload('progress', 5, '').comment_text).toBeUndefined();
    expect(buildShelfMarkPayload('progress', 5, 'nice').comment_text).toBe('nice');
  });
});

test.describe('toShelfItemResponse', () => {
  test('keeps exactly the six consumed fields', () => {
    const data = {
      uuid: 's1',
      item: 'i1',
      shelf_type: 'complete',
      rating: 7,
      created_time: 'c',
      updated_time: 'u',
      visibility: 3,
      note: 'dropped',
    };
    expect(toShelfItemResponse(data)).toEqual({
      uuid: 's1',
      item: 'i1',
      shelf_type: 'complete',
      rating: 7,
      created_time: 'c',
      updated_time: 'u',
    });
  });
});

test.describe('extractBusinessMessage', () => {
  test('precedence detail > error > message', () => {
    expect(extractBusinessMessage({ detail: 'd', error: 'e', message: 'm' })).toBe('d');
    expect(extractBusinessMessage({ error: 'e', message: 'm' })).toBe('e');
    expect(extractBusinessMessage({ message: 'm' })).toBe('m');
  });

  test('empty body yields empty string', () => {
    expect(extractBusinessMessage({})).toBe('');
    expect(extractBusinessMessage({ detail: '' })).toBe('');
  });
});

test.describe('toCatalogFetchResult', () => {
  test('preserves payload and guarantees a uuid key', () => {
    const result = toCatalogFetchResult({ uuid: 'x', name: 'Film' });
    expect(result.uuid).toBe('x');
    expect(result['name']).toBe('Film');
  });

  test('missing uuid falls back to empty string', () => {
    expect(toCatalogFetchResult({ name: 'NoId' }).uuid).toBe('');
  });

  test('falsy payload uuid overwrites the fallback (spread wins, as before split)', () => {
    expect(toCatalogFetchResult({ uuid: null }).uuid).toBeNull();
  });
});

test.describe('isShelfCacheEntryStale', () => {
  test('strict TTL boundary: exactly at TTL is still fresh', () => {
    const now = 1_000_000_000;
    expect(isShelfCacheEntryStale(now - SHELF_CACHE_TTL_MS, now)).toBe(false);
  });

  test('one millisecond past TTL is stale', () => {
    const now = 1_000_000_000;
    expect(isShelfCacheEntryStale(now - SHELF_CACHE_TTL_MS - 1, now)).toBe(true);
  });
});
