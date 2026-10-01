import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { calculateStoreHash } from '@/libraries/utils/hash-utils';
import type { StoreRecord } from '@/types';

/**
 * calculateStoreHash — WebDAV change-detection digest.
 * Contracts pinned:
 * 1. [] → literal 'empty';
 * 2. only key/status/rating/linkedIds/url participate, in that exact per-entry
 *    serialization order — updatedAt and comment NEVER affect the hash;
 * 3. input order does not matter (sorted by key via localeCompare);
 * 4. canonical chain: entries → JSON.stringify → UTF-8 bytes → SHA-256 hex,
 *    cross-checked against node:crypto as an independent oracle (this is what
 *    pins the UTF-8 encoding policy for non-ASCII payloads).
 */

function record(overrides: Partial<StoreRecord> = {}): StoreRecord {
  return {
    url: 'https://movie.douban.com/subject/37332784/',
    status: 2,
    rating: 8,
    updatedAt: '2026-01-01T00:00:00.000Z',
    linkedIds: { imdb: 'movie::tt1375666' },
    ...overrides,
  };
}

interface Entry {
  key: string;
  record: StoreRecord;
}

/** Independent oracle: reproduce the documented serialization + SHA-256 chain. */
function oracleHash(entries: Entry[]): string {
  const sorted = [...entries].sort((a, b) => a.key.localeCompare(b.key));
  const data = sorted.map(({ key, record: r }) => ({
    key,
    status: r.status,
    rating: r.rating,
    linkedIds: r.linkedIds,
    url: r.url,
  }));
  return createHash('sha256').update(JSON.stringify(data), 'utf8').digest('hex');
}

/** Same chain without sorting — pins which comparator's output order the digest follows. */
function oracleHashOrdered(entries: Entry[]): string {
  const data = entries.map(({ key, record: r }) => ({
    key,
    status: r.status,
    rating: r.rating,
    linkedIds: r.linkedIds,
    url: r.url,
  }));
  return createHash('sha256').update(JSON.stringify(data), 'utf8').digest('hex');
}

test.describe('calculateStoreHash', () => {
  test('empty store yields the sentinel string, not a digest', async () => {
    expect(await calculateStoreHash([])).toBe('empty');
  });

  test('output is a 64-char lowercase SHA-256 hex digest', async () => {
    const hash = await calculateStoreHash([{ key: 'movie::1', record: record() }]);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test('matches an independent node:crypto oracle (ASCII + CJK payloads)', async () => {
    const ascii: Entry[] = [
      { key: 'movie::123', record: record({ status: 2, rating: 8 }) },
      { key: 'tv::456', record: record({ url: 'https://example.com/x', status: 1 }) },
    ];
    expect(await calculateStoreHash(ascii)).toBe(oracleHash(ascii));

    // UTF-8 policy pin: Chinese text in url/linkedIds must hash from UTF-8
    // bytes — node's createHash(..., 'utf8') path is the independent oracle.
    const cjk: Entry[] = [
      {
        key: 'movie::26378826',
        record: record({
          url: 'https://movie.douban.com/subject/26378826/ 大鱼海棠',
          linkedIds: { bangumi: 'subject::大鱼海棠' },
        }),
      },
    ];
    expect(await calculateStoreHash(cjk)).toBe(oracleHash(cjk));
  });

  test('entry order does not affect the digest (sorted by key)', async () => {
    const a: Entry = { key: 'movie::1', record: record() };
    const b: Entry = { key: 'book::2', record: record({ status: 1, rating: 0 }) };
    expect(await calculateStoreHash([a, b])).toBe(await calculateStoreHash([b, a]));
  });

  test('sorting is key-based: record↔key pairing participates in the digest', async () => {
    const e1: Entry = { key: 'movie::AAA', record: record({ status: 1 }) };
    const e2: Entry = { key: 'movie::BBB', record: record({ status: 2 }) };
    const direct = await calculateStoreHash([e1, e2]);

    // Reordered input for the same pairing must collide.
    expect(await calculateStoreHash([e2, e1])).toBe(direct);

    // The same two records attached to swapped keys are a different store and
    // must NOT collide — a digest that hashed content alone would pass this only
    // by accident.
    const swapped = await calculateStoreHash([
      { key: 'movie::AAA', record: record({ status: 2 }) },
      { key: 'movie::BBB', record: record({ status: 1 }) },
    ]);
    expect(swapped).not.toBe(direct);
  });

  test('ordering uses locale collation, not code-unit order (comparator is part of the contract)', async () => {
    const lower: Entry = { key: 'movie::aa', record: record({ status: 1 }) };
    const upper: Entry = { key: 'movie::AAA', record: record({ status: 2 }) };
    // locale puts 'aa' before 'AAA'; code-unit order puts 'AAA' first.
    const digest = await calculateStoreHash([upper, lower]);
    expect(digest).toBe(oracleHashOrdered([lower, upper]));
    expect(digest).not.toBe(oracleHashOrdered([upper, lower]));
  });

  test('updatedAt churn does NOT change the digest (false-mismatch guard)', async () => {
    const base: Entry = { key: 'movie::1', record: record() };
    const bumped: Entry = {
      key: 'movie::1',
      record: record({ updatedAt: '2099-12-31T23:59:59.999Z' }),
    };
    expect(await calculateStoreHash([base])).toBe(await calculateStoreHash([bumped]));
  });

  test('comment does NOT change the digest (not part of the sync contract)', async () => {
    const base: Entry = { key: 'movie::1', record: record() };
    const commented: Entry = { key: 'movie::1', record: record({ comment: '神作' }) };
    expect(await calculateStoreHash([base])).toBe(await calculateStoreHash([commented]));
  });

  const mutatedFields: ReadonlyArray<readonly [string, () => StoreRecord]> = [
    ['status', () => record({ status: 3 })],
    ['rating', () => record({ rating: 9 })],
    ['url', () => record({ url: 'https://movie.douban.com/subject/99999999/' })],
    ['linkedIds', () => record({ linkedIds: { neodb: 'movie::777' } })],
  ];
  for (const [field, makeRecord] of mutatedFields) {
    test(`changing ${field} changes the digest`, async () => {
      const base: Entry = { key: 'movie::1', record: record() };
      const changed: Entry = { key: 'movie::1', record: makeRecord() };
      expect(await calculateStoreHash([changed])).not.toBe(await calculateStoreHash([base]));
    });
  }

  test('changing the key changes the digest', async () => {
    const a: Entry = { key: 'movie::1', record: record() };
    const b: Entry = { key: 'movie::2', record: record() };
    expect(await calculateStoreHash([a])).not.toBe(await calculateStoreHash([b]));
  });

  test('input array is not mutated (toSorted, not sort)', async () => {
    const entries: Entry[] = [
      { key: 'z::9', record: record() },
      { key: 'a::1', record: record() },
    ];
    await calculateStoreHash(entries);
    expect(entries[0]?.key).toBe('z::9');
    expect(entries[1]?.key).toBe('a::1');
  });

  test('is deterministic across repeated calls', async () => {
    const entries: Entry[] = [
      { key: 'movie::1', record: record() },
      { key: 'music::2', record: record({ status: 1, linkedIds: {} }) },
    ];
    expect(await calculateStoreHash(entries)).toBe(await calculateStoreHash(entries));
  });
});
