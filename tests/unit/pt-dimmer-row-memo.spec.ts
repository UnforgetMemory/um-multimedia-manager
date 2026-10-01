import { test, expect } from '@playwright/test';
import { JSDOM } from 'jsdom';
import {
  memoRowIds,
  memoOwnsRecordKey,
  shouldClearRowForRecordKey,
} from '@/entrypoints/content/enhancers/pt/dimmer/row-id-memo';
import { clearResolvedMarkersForRows } from '@/entrypoints/content/enhancers/pt/dimmer/index';
import { rowMightMatchKey } from '@/entrypoints/content/enhancers/pt/dimmer/refresh';
import { NexusPHPHandler } from '@/entrypoints/content/enhancers/pt/dimmer/nexusphp';
import { MTeamHandler } from '@/entrypoints/content/enhancers/pt/dimmer/mteam';
import {
  applyCacheFallback,
  resetPtBulkMemo,
} from '@/entrypoints/content/enhancers/pt/dimmer/cache';
import type { PtIdCacheEntry } from '@/types';

/**
 * D2 — id-memo for the resolved-marker clear pass.
 *
 * Defect: on scan-type PT sites the row's douban/imdb id is NOT in the DOM
 * (it comes from the pt_id_cache bulk lookup / background scan), so the
 * text+href haystack in clearResolvedMarkers can never match — a single-key
 * record:updated / record:deleted event left the stale resolved marker for
 * the whole page lifetime (only bulk `*` or a reload recovered).
 *
 * Fix: rows memoize the ids they actually resolved to (WeakMap keyed by the
 * row element, populated at every resolve site in nexusphp.ts / mteam.ts /
 * cache.ts), and the clear pass consults the memo first; the haystack stays
 * as fallback for never-memoized rows; bulk `*` short-circuits both.
 */

const HAN_LIST_URL = 'https://hhanclub.net/torrents.php?cat[]=401';
const HAN_ORIGIN = 'https://hhanclub.net';
const HAN_DETAIL_URL = `${HAN_ORIGIN}/details.php?id=213423`;
const DOUBAN_ID = '1292052';

const noop = (): void => {};

/** Synchronous "frame": every runChunked chunk executes inline. */
const syncSchedule = (task: () => void): (() => void) => {
  task();
  return () => {};
};

function makeDoc(bodyHtml: string): Document {
  return new JSDOM(`<!doctype html><html><body>${bodyHtml}</body></html>`).window.document;
}

/** Scan-type row: torrent title + detail link, no provider id anywhere in DOM. */
function scanStyleRow(doc: Document, detailUrl = HAN_DETAIL_URL): HTMLElement {
  const tr = doc.createElement('tr');
  tr.innerHTML = `<td><a href="${detailUrl}">Inception 2010 BluRay 1080p</a></td>`;
  return tr;
}

function haystackOf(el: Element): string {
  const hrefs = Array.from(el.querySelectorAll('a[href]'))
    .map((a) => a.getAttribute('href') ?? '')
    .join(' ');
  return `${el.textContent ?? ''} ${hrefs}`;
}

function setResolvedMarkers(el: Element): void {
  el.setAttribute('data-umm-resolved', 'true');
  el.setAttribute('data-umm-mteam-resolved', 'true');
}

async function clearPass(rows: Element[], key: string): Promise<void> {
  await clearResolvedMarkersForRows(rows, key, { schedule: syncSchedule }).promise;
}

// ——— Global stubs (restored; specs run in a shared worker) ———

let prevLocation: unknown;
let prevDocument: unknown;

test.beforeAll(() => {
  const g = globalThis as { location?: unknown; document?: unknown };
  prevLocation = g.location;
  prevDocument = g.document;
});

test.afterAll(() => {
  const g = globalThis as { location?: unknown; document?: unknown };
  g.location = prevLocation;
  g.document = prevDocument;
});

function setLocation(href: string, origin: string): void {
  (globalThis as { location?: unknown }).location = { href, origin };
}

/** chrome.runtime.sendMessage stub for DB_GET_WATCHED_IDS + PT_ID_CACHE_GET_BULK. */
function installChromeStub(
  watched: { douban: string[]; imdb: string[] },
  cacheEntries: Record<string, PtIdCacheEntry>,
): () => void {
  const g = globalThis as { chrome?: unknown };
  const prev = g.chrome;
  g.chrome = {
    runtime: {
      id: 'test-extension',
      lastError: null,
      sendMessage: (
        msg: { type: string; payload?: Record<string, unknown> },
        cb?: (res: unknown) => void,
      ) => {
        if (msg.type === 'DB_GET_WATCHED_IDS') {
          cb?.({
            success: true,
            results: { douban_records: watched.douban, imdb_records: watched.imdb },
          });
        } else if (msg.type === 'PT_ID_CACHE_GET_BULK') {
          const urls = (msg.payload as { ptUrls?: string[] } | undefined)?.ptUrls ?? [];
          const found: Record<string, PtIdCacheEntry> = {};
          for (const url of urls) {
            const entry = cacheEntries[url];
            if (entry) found[url] = entry;
          }
          cb?.({ success: true, entries: found });
        } else {
          cb?.({ success: true });
        }
      },
      onMessage: { addListener: () => {} },
    },
  };
  return () => {
    g.chrome = prev;
  };
}

let restoreChrome: (() => void) | null = null;

test.beforeEach(() => {
  // pt_id_cache bulk memo is a module singleton — isolate per test.
  resetPtBulkMemo();
});

test.afterEach(() => {
  restoreChrome?.();
  restoreChrome = null;
});

test.describe('row-id-memo decision core', () => {
  test('scan-type row (id absent from DOM) IS cleared by a single-key event via memo', async () => {
    const doc = makeDoc('');
    const row = scanStyleRow(doc);
    setResolvedMarkers(row);
    memoRowIds(row, { doubanId: DOUBAN_ID });

    // The pre-fix haystack provably cannot match — this is the defect pin.
    expect(rowMightMatchKey(haystackOf(row), `movie::${DOUBAN_ID}`)).toBe(false);
    expect(shouldClearRowForRecordKey(row, `movie::${DOUBAN_ID}`)).toBe(true);

    await clearPass([row], `movie::${DOUBAN_ID}`);
    expect(row.hasAttribute('data-umm-resolved')).toBe(false);
    expect(row.hasAttribute('data-umm-mteam-resolved')).toBe(false);
  });

  test('row memoized to a DIFFERENT id is not cleared (no over-clearing)', async () => {
    const doc = makeDoc('');
    const row = scanStyleRow(doc);
    setResolvedMarkers(row);
    memoRowIds(row, { doubanId: DOUBAN_ID });

    expect(shouldClearRowForRecordKey(row, 'movie::999999')).toBe(false);
    await clearPass([row], 'movie::999999');
    expect(row.getAttribute('data-umm-resolved')).toBe('true');
    expect(row.getAttribute('data-umm-mteam-resolved')).toBe('true');
  });

  test('memo is authoritative over an accidental haystack hit', () => {
    const doc = makeDoc('');
    const row = scanStyleRow(doc);
    // Title text happens to contain the unrelated id 999999 (coincidence).
    row.querySelector('a')!.textContent = 'Movie 999999 Edition';
    memoRowIds(row, { doubanId: DOUBAN_ID });

    expect(rowMightMatchKey(haystackOf(row), 'movie::999999')).toBe(true);
    expect(shouldClearRowForRecordKey(row, 'movie::999999')).toBe(false);
  });

  test('never-memoized rows keep the haystack fallback (both directions)', async () => {
    const doc = makeDoc('');
    const matching = scanStyleRow(doc);
    matching.querySelector('a')!.textContent = `Movie subject ${DOUBAN_ID}`;
    const unrelated = scanStyleRow(doc, `${HAN_ORIGIN}/details.php?id=777`);
    for (const row of [matching, unrelated]) setResolvedMarkers(row);

    expect(shouldClearRowForRecordKey(matching, `movie::${DOUBAN_ID}`)).toBe(true);
    expect(shouldClearRowForRecordKey(unrelated, `movie::${DOUBAN_ID}`)).toBe(false);

    await clearPass([matching, unrelated], `movie::${DOUBAN_ID}`);
    expect(matching.hasAttribute('data-umm-resolved')).toBe(false);
    expect(unrelated.hasAttribute('data-umm-resolved')).toBe(true);
  });

  test("bulk '*' clears every resolved row without touching memo or haystack", async () => {
    const doc = makeDoc('');
    const plain = scanStyleRow(doc);
    const memoized = scanStyleRow(doc, `${HAN_ORIGIN}/details.php?id=888`);
    setResolvedMarkers(plain);
    setResolvedMarkers(memoized);
    memoRowIds(memoized, { doubanId: DOUBAN_ID });

    let hayAccesses = 0;
    const spy = new Proxy(plain, {
      get(target, prop, _receiver) {
        if (prop === 'querySelectorAll' || prop === 'textContent') hayAccesses++;
        const value = Reflect.get(target, prop, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });

    await clearPass([spy, memoized], '*');
    expect(plain.hasAttribute('data-umm-resolved')).toBe(false);
    expect(plain.hasAttribute('data-umm-mteam-resolved')).toBe(false);
    expect(memoized.hasAttribute('data-umm-mteam-resolved')).toBe(false);
    expect(hayAccesses).toBe(0);
  });

  test("memo + key normalize pt_id_cache's 'movie::' prefixes", () => {
    const doc = makeDoc('');
    const row = scanStyleRow(doc);
    memoRowIds(row, { doubanId: `movie::${DOUBAN_ID}`, imdbId: 'movie::tt1234567' });

    expect(memoOwnsRecordKey(row, `movie::${DOUBAN_ID}`)).toBe(true);
    expect(memoOwnsRecordKey(row, `music::${DOUBAN_ID}`)).toBe(true);
    expect(memoOwnsRecordKey(row, 'movie::tt1234567')).toBe(true);
    expect(memoOwnsRecordKey(row, '2002')).toBe(false);
    expect(memoOwnsRecordKey(doc.createElement('tr'), `movie::${DOUBAN_ID}`)).toBeUndefined();
  });

  test('memo is element-keyed with the minimal {doubanId, imdbId} value shape', () => {
    const doc = makeDoc('');
    const row = scanStyleRow(doc);
    const empty = scanStyleRow(doc, `${HAN_ORIGIN}/details.php?id=999`);

    const originalSet = WeakMap.prototype.set;
    const seen: Array<{ key: unknown; value: unknown }> = [];
    WeakMap.prototype.set = function (
      this: WeakMap<object, unknown>,
      key: object,
      value: unknown,
    ): WeakMap<object, unknown> {
      seen.push({ key, value });
      return originalSet.call(this, key, value);
    };
    try {
      memoRowIds(row, { doubanId: '1001', imdbId: 'tt2002' });
      memoRowIds(row, { doubanId: '3003' });
      memoRowIds(empty, {});
    } finally {
      WeakMap.prototype.set = originalSet;
    }

    // One slot per element (overwrite, never append), keyed by the element itself,
    // and id-less rows never insert → no secondary collections can grow.
    expect(seen).toHaveLength(2);
    expect(seen[0]!.key).toBe(row);
    expect(seen[1]!.key).toBe(row);
    expect(seen.every((s) => s.key === row)).toBe(true);
    const first = seen[0]!.value as Record<string, unknown>;
    expect(Object.keys(first).sort()).toEqual(['doubanId', 'imdbId']);
    expect(first.doubanId).toBe('1001');
    expect(first.imdbId).toBe('tt2002');
    expect(memoOwnsRecordKey(row, 'movie::1001')).toBe(false);
    expect(memoOwnsRecordKey(row, 'movie::3003')).toBe(true);
  });
});

test.describe('NexusPHP scan-site integration (resolve → memo → single-key clear)', () => {
  test('cache-bulk resolved row keeps no id in DOM yet is cleared by its key', async () => {
    setLocation(HAN_LIST_URL, HAN_ORIGIN);
    const doc = makeDoc(
      `<table class="torrents"><tbody>
         <tr><td><a href="${HAN_DETAIL_URL}">Inception 2010 BluRay 1080p</a></td></tr>
       </tbody></table>`,
    );
    (globalThis as { document?: unknown }).document = doc;
    restoreChrome = installChromeStub(
      { douban: [`movie::${DOUBAN_ID}`], imdb: [] },
      {
        [HAN_DETAIL_URL]: { ptUrl: HAN_DETAIL_URL, doubanId: `movie::${DOUBAN_ID}`, updatedAt: '' },
      },
    );

    const handler = new NexusPHPHandler();
    await handler.process(
      { debug: noop, idCache: null, cacheTimestamp: 0 },
      { schedule: syncSchedule },
    );

    const row = doc.querySelector('tr')!;
    expect(row.getAttribute('data-umm-resolved')).toBe('true');
    expect(row.classList.contains('umm-dimmed')).toBe(true);
    // Pre-fix proof: the haystack can never see this row's id.
    expect(rowMightMatchKey(haystackOf(row), `movie::${DOUBAN_ID}`)).toBe(false);

    const targets = () =>
      Array.from(
        doc.querySelectorAll('[data-umm-resolved="true"], [data-umm-mteam-resolved="true"]'),
      );

    // Wrong single key: marker survives (no churn).
    await clearPass(targets(), 'movie::999999');
    expect(targets()).toHaveLength(1);

    // Right single key: memo clears it so the next round re-evaluates.
    await clearPass(targets(), `movie::${DOUBAN_ID}`);
    expect(targets()).toHaveLength(0);
  });
});

test.describe('MTeam populate sites', () => {
  test('processMTeamRows memoizes direct ids; single-key event clears the marker', async () => {
    setLocation('https://m-team.cc/#/browse', 'https://m-team.cc');
    const doc = makeDoc('');
    const row = doc.createElement('tr');
    row.innerHTML =
      '<td><a href="https://www.douban.com/subject/3003/">Movie</a>' +
      '<a href="https://m-team.cc/detail/abc">detail</a></td>';
    const unrelated = doc.createElement('tr');
    unrelated.innerHTML =
      '<td><a href="https://www.douban.com/subject/4004/">Other</a>' +
      '<a href="https://m-team.cc/detail/def">detail</a></td>';

    const handler = new MTeamHandler();
    // Both rows matched → both resolved-marked → both memoized; the clear pass
    // must then pick exactly the one owning the event key.
    await handler.processMTeamRows(
      [row, unrelated],
      new Set(['3003', '4004']),
      new Set(),
      new Set(),
      { schedule: syncSchedule },
    );

    expect(row.getAttribute('data-umm-mteam-resolved')).toBe('true');
    expect(memoOwnsRecordKey(row, 'movie::3003')).toBe(true);
    expect(memoOwnsRecordKey(unrelated, 'movie::4004')).toBe(true);

    await clearPass([row, unrelated], 'movie::4004');
    expect(row.hasAttribute('data-umm-mteam-resolved')).toBe(true);
    expect(unrelated.hasAttribute('data-umm-mteam-resolved')).toBe(false);
  });

  test('applyCacheFallback memoizes the cache entry ids for id-less rows', async () => {
    setLocation('https://m-team.cc/#/browse', 'https://m-team.cc');
    const doc = makeDoc('');
    const row = scanStyleRow(doc, 'https://m-team.cc/detail/xyz');
    // applyCacheFallback matches entry ids against the sets verbatim (no prefix
    // strip on this pass) — the memo normalizes either way.
    restoreChrome = installChromeStub(
      { douban: [], imdb: [] },
      {
        'https://m-team.cc/detail/xyz': {
          ptUrl: 'https://m-team.cc/detail/xyz',
          doubanId: DOUBAN_ID,
          updatedAt: '',
        },
      },
    );

    await applyCacheFallback(
      noop,
      [row],
      (r) => r.querySelector('a[href*="detail"]')?.getAttribute('href') ?? null,
      new Set([DOUBAN_ID]),
      new Set(),
      new Set(),
      (el) => el.classList.add('umm-dimmed'),
    );
    expect(row.classList.contains('umm-dimmed')).toBe(true);
    expect(row.getAttribute('data-umm-mteam-resolved')).toBe('true');
    expect(rowMightMatchKey(haystackOf(row), `movie::${DOUBAN_ID}`)).toBe(false);
    expect(memoOwnsRecordKey(row, `movie::${DOUBAN_ID}`)).toBe(true);

    await clearPass([row], `movie::${DOUBAN_ID}`);
    expect(row.hasAttribute('data-umm-mteam-resolved')).toBe(false);
  });
});
