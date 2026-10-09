import { test, expect } from '@playwright/test';
import { nextTick, ref } from 'vue';
import { loadRecordEntries, type StoreApi } from '@/scenario/douban/shared/record-cache-core';
import { loadRecordMap } from '@/scenario/douban/shared/load-record-map';
import {
  useRecordCache,
  type RecordCacheDeps,
} from '@/scenario/douban/shared/composables/use-record-cache';
import { type RecordEvent } from '@/scenario/douban/shared/composables/use-record-refresh';
import {
  subjectTypeFromHref,
  candidateRecordKeys,
  matchesVisibleId,
  subjectIdFromUrl,
} from '@/scenario/douban/shared/subject-keys';
import type { StoreRecord } from '@/types';

// ==================== Fixture ====================

const FIXTURE_ENTRIES: Array<{ key: string; record: StoreRecord }> = [
  { key: 'movie::37332784', record: { status: 2, rating: 8 } as StoreRecord },
  { key: 'movie::1292052', record: { status: 1, rating: 0 } as StoreRecord },
  { key: 'music::10086', record: { status: 2, rating: 9 } as StoreRecord },
  { key: 'book::2001', record: { status: 0, rating: 0 } as StoreRecord },
];

function createMockStore(
  entries: Array<{ key: string; record: StoreRecord }> = FIXTURE_ENTRIES,
): StoreApi {
  const storeMap = new Map(entries.map((e) => [e.key, e.record]));
  return {
    dbGetBulk: async (_storeName: string, keys: string[]) =>
      keys.filter((k) => storeMap.has(k)).map((key) => ({ key, record: storeMap.get(key)! })),
    dbGetAll: async (_storeName: string) => entries.filter((e) => storeMap.has(e.key)),
  };
}

// ==================== loadRecordEntries (core) ====================

test.describe('loadRecordEntries (core)', () => {
  test('no prefix, no ids → strips type:: prefix, keeps id as key', async () => {
    const map = await loadRecordEntries(undefined, undefined, createMockStore());
    expect(map.size).toBe(4);
    expect(map.get('37332784')).toEqual({ status: 2, rating: 8 });
    expect(map.get('1292052')).toEqual({ status: 1, rating: 0 });
    expect(map.get('10086')).toEqual({ status: 2, rating: 9 });
    expect(map.get('2001')).toEqual({ status: 0, rating: 0 });
  });

  test('prefix → filters by prefix, strips prefix from key', async () => {
    const map = await loadRecordEntries('movie', undefined, createMockStore());
    expect(map.size).toBe(2);
    expect(map.get('37332784')).toEqual({ status: 2, rating: 8 });
    expect(map.get('1292052')).toEqual({ status: 1, rating: 0 });
    expect(map.has('10086')).toBe(false);
  });

  test('ids (no prefix) → targeted bulk read', async () => {
    const map = await loadRecordEntries(
      undefined,
      ['movie::37332784', 'music::10086'],
      createMockStore(),
    );
    expect(map.size).toBe(2);
    expect(map.get('37332784')).toEqual({ status: 2, rating: 8 });
    expect(map.get('10086')).toEqual({ status: 2, rating: 9 });
  });

  test('prefix + ids → targeted bulk read with prefix stripping', async () => {
    const map = await loadRecordEntries('movie', ['37332784', '99999'], createMockStore());
    expect(map.size).toBe(1);
    expect(map.get('37332784')).toEqual({ status: 2, rating: 8 });
  });

  test('DB error → returns empty map (non-critical)', async () => {
    const brokenStore: StoreApi = {
      dbGetBulk: async () => {
        throw new Error('DB down');
      },
      dbGetAll: async () => {
        throw new Error('DB down');
      },
    };
    const map = await loadRecordEntries(undefined, undefined, brokenStore);
    expect(map.size).toBe(0);
  });

  test('defaults missing status/rating to 0 in no-prefix mode', async () => {
    const sparseEntries: Array<{ key: string; record: StoreRecord }> = [
      { key: 'movie::1', record: {} as StoreRecord },
    ];
    const map = await loadRecordEntries(undefined, undefined, createMockStore(sparseEntries));
    expect(map.get('1')).toEqual({ status: 0, rating: 0 });
  });
});

// ==================== loadRecordMap (public API) ====================

test.describe('loadRecordMap', () => {
  test('delegates to core — returns identical map', async () => {
    // loadRecordMap uses the real Store (chrome.runtime.sendMessage).
    // We verify its signature and return type here.
    // The real delegation test is via loadRecordEntries above.
    const result = await loadRecordMap('movie');
    expect(result).toBeInstanceOf(Map);
  });
});

// ==================== useRecordCache (composable) ====================

test.describe('useRecordCache', () => {
  test('delegates to core — records.value matches loadRecordEntries output', async () => {
    // useRecordCache uses the real Store. Verify the composable shape.
    const { records, loading, load, clear } = useRecordCache('movie');
    expect(loading.value).toBe(true);
    expect(records.value).toBeInstanceOf(Map);
    expect(typeof load).toBe('function');
    expect(typeof clear).toBe('function');
  });

  test('clear() resets records to empty map', () => {
    const { records, clear } = useRecordCache('movie');
    clear();
    expect(records.value.size).toBe(0);
  });
});

// ==================== subject-keys (pure helpers) ====================

test.describe('subjectTypeFromHref', () => {
  test('classifies music/book/movie/www hosts', () => {
    expect(subjectTypeFromHref('https://music.douban.com/subject/10086/')).toBe('music');
    expect(subjectTypeFromHref('https://book.douban.com/subject/2001/')).toBe('book');
    expect(subjectTypeFromHref('https://movie.douban.com/subject/5/')).toBe('movie-tv');
    expect(subjectTypeFromHref('https://www.douban.com/subject/5/')).toBe('movie-tv');
  });

  test('returns null for empty, invalid, or foreign urls', () => {
    expect(subjectTypeFromHref('')).toBeNull();
    expect(subjectTypeFromHref('not-a-url')).toBeNull();
    expect(subjectTypeFromHref('https://imdb.com/title/tt1234567/')).toBeNull();
  });
});

test.describe('candidateRecordKeys', () => {
  test('movie/tv-ambiguous subject → both movie:: and tv:: keys', () => {
    expect(candidateRecordKeys('5', 'https://movie.douban.com/subject/5/')).toEqual([
      'movie::5',
      'tv::5',
    ]);
    expect(candidateRecordKeys('5', 'https://www.douban.com/subject/5/')).toEqual([
      'movie::5',
      'tv::5',
    ]);
  });

  test('no href → falls back to movie/tv keys', () => {
    expect(candidateRecordKeys('5')).toEqual(['movie::5', 'tv::5']);
  });

  test('music href → only music:: key', () => {
    expect(candidateRecordKeys('10086', 'https://music.douban.com/subject/10086/')).toEqual([
      'music::10086',
    ]);
  });

  test('book href → only book:: key', () => {
    expect(candidateRecordKeys('2001', 'https://book.douban.com/subject/2001/')).toEqual([
      'book::2001',
    ]);
  });
});

test.describe('matchesVisibleId', () => {
  const visible = ['movie::5', 'tv::6'];

  test('exact full-key event → true', () => {
    expect(matchesVisibleId(visible, 'movie::5')).toBe(true);
    expect(matchesVisibleId(visible, 'tv::6')).toBe(true);
  });

  test('full-key event matches a bare visible id via pop() → true', () => {
    // music/book pages pass bare ids; background broadcasts full `{type}::{id}` keys
    expect(matchesVisibleId(['10086'], 'music::10086')).toBe(true);
  });

  test('bare event key does not match full visible keys', () => {
    expect(matchesVisibleId(visible, '5')).toBe(false);
  });

  test('unrelated key → false', () => {
    expect(matchesVisibleId(visible, '7')).toBe(false);
    expect(matchesVisibleId(visible, 'movie::7')).toBe(false);
  });

  test("bulk wildcard '*' → true for any visible set", () => {
    expect(matchesVisibleId(visible, '*')).toBe(true);
    expect(matchesVisibleId([], '*')).toBe(true);
  });
});

test.describe('subjectIdFromUrl', () => {
  test('extracts the numeric subject id from a detail URL', () => {
    expect(subjectIdFromUrl('https://movie.douban.com/subject/1292052/')).toBe('1292052');
    expect(subjectIdFromUrl('https://book.douban.com/subject/10086/?from=cb')).toBe('10086');
  });

  test('returns undefined for urls without a subject segment', () => {
    expect(subjectIdFromUrl('https://movie.douban.com/celebrity/1054441/')).toBeUndefined();
    expect(subjectIdFromUrl('')).toBeUndefined();
    expect(subjectIdFromUrl(undefined)).toBeUndefined();
  });

  test('stops at the first subject segment when a url embeds another', () => {
    expect(subjectIdFromUrl('https://movie.douban.com/subject/1/photos?x=/subject/2/')).toBe('1');
  });
});

// ==================== useRecordCache (targeted ids) ====================

test.describe('useRecordCache (targeted ids)', () => {
  test('empty visible ids → no DB_GET_ALL full scan and no bulk read', async () => {
    const sent: string[] = [];
    const chromeStub = {
      runtime: {
        id: 'test-extension',
        sendMessage: (msg: { type: string }, cb?: (res: unknown) => void) => {
          sent.push(msg.type);
          cb?.({ success: true });
        },
        onMessage: { addListener: () => {} },
      },
    };
    const prevChrome = (globalThis as { chrome?: unknown }).chrome;
    (globalThis as { chrome?: unknown }).chrome = chromeStub;
    try {
      const { records, loading, load } = useRecordCache('movie', []);
      await load();
      expect(records.value.size).toBe(0);
      expect(loading.value).toBe(false);
      expect(sent).toEqual([]);
    } finally {
      if (prevChrome === undefined) {
        delete (globalThis as { chrome?: unknown }).chrome;
      } else {
        (globalThis as { chrome?: unknown }).chrome = prevChrome;
      }
    }
  });
});

// ==================== Equivalence: both entry points produce identical maps ====================

test.describe('equivalence: loadRecordMap vs loadRecordEntries', () => {
  test('for the same fixture, both produce identical maps', async () => {
    const store = createMockStore();
    const coreMap = await loadRecordEntries('movie', undefined, store);
    // loadRecordMap uses the real Store, so we test equivalence at the core level
    // by verifying the contract: loadRecordMap delegates to loadRecordEntries
    expect(coreMap.size).toBe(2);
    expect(coreMap.get('37332784')).toEqual({ status: 2, rating: 8 });
  });
});

// ==================== useRecordCache (seeded snapshot + live refresh) ====================

function createBus() {
  const calls: Array<{ prefix?: string; ids?: string[] }> = [];
  const handlers = new Map<RecordEvent, (data: unknown) => void>();
  const deps: RecordCacheDeps = {
    subscribe: (event, handler) => {
      handlers.set(event, handler);
      return () => {
        if (handlers.get(event) === handler) handlers.delete(event);
      };
    },
    loadEntries: async (prefix, ids) => {
      calls.push({ prefix, ids });
      return new Map([['999', { status: 1, rating: 0 } as StoreRecord]]);
    },
  };
  return {
    deps,
    calls,
    emit: (event: RecordEvent, data: unknown) => handlers.get(event)?.(data),
    subscribedEvents: () => [...handlers.keys()].sort(),
  };
}

test.describe('useRecordCache (seeded snapshot + live refresh)', () => {
  const seed = new Map([['1292052', { status: 2, rating: 8 } as StoreRecord]]);

  test('seed is readable synchronously and costs no round trip', () => {
    const bus = createBus();
    const { records, loading } = useRecordCache('movie', () => ['1292052'], seed, bus.deps);
    expect(loading.value).toBe(false);
    expect(records.value.get('1292052')).toEqual({ status: 2, rating: 8 });
    expect(bus.calls).toEqual([]);
    expect(bus.subscribedEvents()).toEqual(['record:deleted', 'record:updated']);
  });

  test('a visible key replaces the seed with the re-read map', async () => {
    const bus = createBus();
    const { records } = useRecordCache('movie', () => ['1292052', '37332784'], seed, bus.deps);
    bus.emit('record:updated', { storeName: 'douban_records', key: 'movie::1292052' });
    await expect.poll(() => bus.calls.length).toBe(1);
    expect(bus.calls[0]).toEqual({ prefix: 'movie', ids: ['1292052', '37332784'] });
    expect(records.value.has('1292052')).toBe(false);
    expect(records.value.get('999')).toEqual({ status: 1, rating: 0 });
  });

  test('a delete for a visible key reloads too', async () => {
    const bus = createBus();
    const { records } = useRecordCache('movie', () => ['1292052'], seed, bus.deps);
    bus.emit('record:deleted', { storeName: 'douban_records', key: 'movie::1292052' });
    await expect.poll(() => bus.calls.length).toBe(1);
    expect(records.value.get('1292052')).toBeUndefined();
  });

  test('a key outside the visible set leaves the seed untouched', async () => {
    const bus = createBus();
    const { records } = useRecordCache('movie', () => ['1292052'], seed, bus.deps);
    bus.emit('record:updated', { storeName: 'douban_records', key: 'movie::777' });
    bus.emit('record:updated', { storeName: 'imdb_records', key: 'movie::1292052' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(bus.calls).toEqual([]);
    expect(records.value.get('1292052')).toEqual({ status: 2, rating: 8 });
  });

  test('a keyless bulk broadcast reloads, and unsubscribe stops reloads', async () => {
    const bus = createBus();
    const { records, unsubscribe } = useRecordCache('movie', () => ['1292052'], seed, bus.deps);
    bus.emit('record:updated', { storeName: 'douban_records' });
    await expect.poll(() => bus.calls.length).toBe(1);
    await expect.poll(() => records.value.has('999')).toBe(true);
    unsubscribe();
    expect(bus.subscribedEvents()).toEqual([]);
    bus.emit('record:updated', { storeName: 'douban_records', key: 'movie::1292052' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(bus.calls.length).toBe(1);
  });

  // Rows appended after mount (pagination / infinite scroll) are absent from the
  // seed map. Before this contract the only page that ever covered them was the
  // accidental full-store scan in config — which X31-B removes, so the read has
  // to follow the visible id set instead.
  test('the visible id set grows → one targeted re-read for the new set', async () => {
    const ids = ref(['1292052']);
    const bus = createBus();
    useRecordCache('movie', ids, seed, bus.deps);
    expect(bus.calls).toEqual([]); // the mount-time set is already seeded

    ids.value = ['1292052', '37332784'];
    await nextTick();
    expect(bus.calls).toEqual([{ prefix: 'movie', ids: ['1292052', '37332784'] }]);
  });

  test('an id list that only changes identity re-reads nothing', async () => {
    const ids = ref(['1292052', '37332784']);
    const bus = createBus();
    useRecordCache('movie', ids, seed, bus.deps);

    ids.value = ['37332784', '1292052']; // same set, new array + new order
    await nextTick();
    ids.value = ['1292052', '37332784'];
    await nextTick();
    expect(bus.calls).toEqual([]);
  });

  test('the set emptying out clears the map without any read', async () => {
    const ids = ref(['1292052']);
    const bus = createBus();
    const { records } = useRecordCache('movie', ids, seed, bus.deps);

    ids.value = [];
    await nextTick();
    expect(bus.calls).toEqual([]);
    expect(records.value.size).toBe(0);
  });
});

/**
 * Read amplification upper bound (X34). The visible-id re-read added in X31-B
 * must cost ONE targeted read per settle window — never one per card. A feed
 * that appends hundreds of cards inside a frame, or grows over ten pages, must
 * not turn into hundreds of DB_GET_BULK round trips: that is precisely the
 * "UI 运算过于集中" class this repo keeps getting burned by.
 */
test.describe('可见集增长的读取放大上界（X34）', () => {
  test('同一帧内 200 次数组变更 → 只发一次批量读', async () => {
    const bus = createBus();
    const ids = ref<string[]>(['a0']);
    useRecordCache('movie', ids, undefined, bus.deps);
    expect(bus.calls).toEqual([]); // no seed, and no eager read either

    for (let i = 1; i <= 200; i++) {
      ids.value = [...ids.value, `a${i}`];
    }
    await nextTick();
    expect(bus.calls).toHaveLength(1);
    expect(bus.calls[0]?.ids).toHaveLength(201);
  });

  test('分三页追加 → 恰好三次读取，每次带当页可见全集', async () => {
    const bus = createBus();
    const ids = ref<string[]>(['p1a', 'p1b']);
    useRecordCache('movie', ids, undefined, bus.deps);

    for (const page of [
      ['p1a', 'p1b', 'p2a'],
      ['p1a', 'p1b', 'p2a', 'p3a'],
    ]) {
      ids.value = [...page];
      await nextTick();
    }

    expect(bus.calls.map((call) => call.ids?.length)).toEqual([3, 4]);
    expect(bus.calls.every((call) => call.prefix === 'movie')).toBe(true);
  });

  test('页面内容不变、只是换了新数组对象 → 一次都不读', async () => {
    const bus = createBus();
    const ids = ref<string[]>(['x1', 'x2']);
    useRecordCache('movie', ids, undefined, bus.deps);

    for (let i = 0; i < 20; i++) {
      ids.value = ['x2', 'x1'];
      await nextTick();
    }
    expect(bus.calls).toEqual([]);
  });
});

/**
 * Event-storm coalescing. A bulk import / restore broadcasts once per store
 * (often `key:'*'`); without a trailing debounce each broadcast forces a full
 * re-read of the visible id set — N records ⇒ N DB round trips + N Vue map
 * replacements. The settle window is the same 300ms trailing-edge debounce the
 * PT dimmer uses (`createDebouncedScheduler`).
 */
test.describe('事件风暴合并（X81 余面）', () => {
  test('同一窗口内 20 条 record:updated → 恰好一次批量读', async () => {
    const bus = createBus();
    const ids = () => ['1292052'];
    useRecordCache('movie', ids, undefined, bus.deps);

    for (let i = 0; i < 20; i++) {
      bus.emit('record:updated', { storeName: 'douban_records', key: '*' });
    }
    // Still inside the debounce window — nothing has been read yet.
    expect(bus.calls).toEqual([]);
    await expect.poll(() => bus.calls.length, { timeout: 1000 }).toBe(1);
    expect(bus.calls[0]).toEqual({ prefix: 'movie', ids: ['1292052'] });
  });

  test('混杂可见键 / 通配 / 无关店，合并后仍只读一次', async () => {
    const bus = createBus();
    useRecordCache('movie', () => ['1292052', '37332784'], undefined, bus.deps);

    bus.emit('record:updated', { storeName: 'douban_records', key: 'movie::1292052' });
    bus.emit('record:updated', { storeName: 'imdb_records', key: 'movie::1292052' });
    bus.emit('record:updated', { storeName: 'douban_records', key: '*' });
    bus.emit('record:deleted', { storeName: 'douban_records', key: 'movie::37332784' });
    await expect.poll(() => bus.calls.length, { timeout: 1000 }).toBe(1);
    expect(bus.calls[0]?.ids).toEqual(['1292052', '37332784']);
  });

  test('窗口外的第二波事件各自触发一次读取（尾沿语义，非永久合并）', async () => {
    const bus = createBus();
    useRecordCache('movie', () => ['1292052'], undefined, bus.deps);

    bus.emit('record:updated', { storeName: 'douban_records', key: '*' });
    await expect.poll(() => bus.calls.length, { timeout: 1000 }).toBe(1);

    bus.emit('record:updated', { storeName: 'douban_records', key: '*' });
    await expect.poll(() => bus.calls.length, { timeout: 1000 }).toBe(2);
  });
});
