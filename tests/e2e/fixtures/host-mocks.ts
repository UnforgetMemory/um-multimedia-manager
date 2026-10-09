/**
 * Network mocks + store seeds for the hosts added to the e2e suite in this
 * wave (Sehuatang / Bangumi / Bilibili).
 *
 * Same technique the frozen douban/IMDb/PT harness uses for the same reason:
 * `context.route` answers on the REAL hostname so the manifest `matches` keep
 * injecting the content scripts, while the body comes from a local builder.
 * Nothing leaves the machine.
 *
 * WHY a new module instead of extra installers in extension-harness.ts: that
 * file is frozen for this wave (five concurrent agents own it). The three
 * installers here are shaped like installDoubanMocks so they can be folded in
 * verbatim later.
 */

import { makeStoreRecord, sendRuntimeMessage, type RuntimeResponse } from './extension-harness';
import type { BrowserContext, Page, Route } from '@playwright/test';

export const JAV_IDS_STORE = 'jav_ids';
export const USAV_IDS_STORE = 'usav_ids';
export const SEHUATANG_IDS_STORE = 'sehuatang_ids';
export const ADULT_STORES = [JAV_IDS_STORE, USAV_IDS_STORE, SEHUATANG_IDS_STORE] as const;
export const BANGUMI_STORE = 'bangumi_records';
export const BILIBILI_STORE = 'bilibili_records';

const HTML = 'text/html; charset=utf-8';
const TEXT = 'text/plain';

/** Local body for a request; null → generic 200 text stub (subresources, APIs). */
export type BodyResolver = (url: URL) => { body: string; contentType: string } | null;

/**
 * Route a set of match patterns so the LAST-registered (most specific) body
 * wins: Playwright resolves overlapping routes LIFO, hence the stub net is
 * installed before the caller's dispatcher.
 */
export async function installHostMock(
  ctx: BrowserContext,
  patterns: readonly string[],
  resolve: BodyResolver,
): Promise<void> {
  const stub = (route: Route): Promise<unknown> =>
    route.fulfill({ status: 200, contentType: TEXT, body: '' });
  for (const pattern of patterns) await ctx.route(pattern, stub);
  const html = async (route: Route, body: string): Promise<unknown> =>
    route.fulfill({ status: 200, contentType: HTML, body });
  for (const pattern of patterns) {
    await ctx.route(pattern, (route) => {
      const hit = resolve(new URL(route.request().url()));
      return hit ? html(route, hit.body) : stub(route);
    });
  }
}

export interface SehuatangMocks {
  listHtml?: string;
  riskHtml?: string;
  indexHtml?: string;
  threadDetailHtml?: string;
}

/**
 * www.sehuatang.net: `/forum-*` = list (or the risk gate, whichever body the
 * spec passes), `/` = index, `/thread-*` = the detail document the overlay's
 * lazy detail loader fetches per card.
 */
export async function installSehuatangMocks(
  ctx: BrowserContext,
  mocks: SehuatangMocks,
): Promise<void> {
  await installHostMock(ctx, ['*://www.sehuatang.net/**'], (url) => {
    const { pathname } = url;
    if (pathname === '/' || pathname === '/index.php') {
      return mocks.indexHtml ? { body: mocks.indexHtml, contentType: HTML } : null;
    }
    if (/^\/forum[-.]/.test(pathname)) {
      const body = mocks.riskHtml ?? mocks.listHtml;
      return body ? { body, contentType: HTML } : null;
    }
    if (/^\/thread-\d+/.test(pathname)) {
      return mocks.threadDetailHtml ? { body: mocks.threadDetailHtml, contentType: HTML } : null;
    }
    return null;
  });
}

/** bangumi.tv browse list pages (`/anime/browser` …) served from a fixture. */
export async function installBangumiMocks(
  ctx: BrowserContext,
  mocks: { browserListHtml: string },
): Promise<void> {
  await installHostMock(ctx, ['*://bangumi.tv/**'], (url) =>
    /^\/(anime|book|music|game)\/browser/.test(url.pathname)
      ? { body: mocks.browserListHtml, contentType: HTML }
      : null,
  );
}

/** www.bilibili.com homepage listing fed from a fixture (subresources stubbed). */
export async function installBilibiliMocks(
  ctx: BrowserContext,
  mocks: { homepageHtml: string },
): Promise<void> {
  await installHostMock(ctx, ['*://www.bilibili.com/**'], (url) =>
    url.pathname === '/' || url.pathname === '/index.html'
      ? { body: mocks.homepageHtml, contentType: HTML }
      : null,
  );
}

/** Seed one record straight into the background IndexedDB (status 2 = watched). */
export async function seedRecord(
  extPage: Page,
  storeName: string,
  key: string,
  url: string,
  status = 2,
  rating = 8,
): Promise<RuntimeResponse> {
  return sendRuntimeMessage(extPage, 'DB_PUT', {
    storeName,
    key,
    record: makeStoreRecord(url, status, rating),
  });
}

/** Seed one watched adult record (the three-table adult stores). */
export async function seedAdultRecord(
  extPage: Page,
  storeName: string,
  key: string,
  url: string,
): Promise<RuntimeResponse> {
  return seedRecord(extPage, storeName, key, url, 2, 8);
}

/** Read one record back through the service worker. */
export async function readRecord(
  extPage: Page,
  storeName: string,
  key: string,
): Promise<RuntimeResponse> {
  return sendRuntimeMessage(extPage, 'DB_GET', { storeName, key });
}

/** Structural shape of a DB_GET_ALL envelope (harness type only covers DB_GET). */
export interface DbAllResponse {
  success?: boolean;
  entries?: Array<{ key: string; record?: { status?: number; url?: string } | null }>;
  error?: string;
}

/**
 * Every key currently in a store — the negative-control probe the index-page
 * spec uses to prove the navigation layer never writes to the watched stores.
 */
export async function readAllKeys(extPage: Page, storeName: string): Promise<string[]> {
  const res = await extPage.evaluate(
    ({ type, payload }) => chrome.runtime.sendMessage({ type, payload }) as Promise<DbAllResponse>,
    { type: 'DB_GET_ALL', payload: { storeName } },
  );
  if (!res?.success) throw new Error(`[e2e] DB_GET_ALL ${storeName} failed: ${String(res?.error)}`);
  return (res.entries ?? []).map((entry) => entry.key);
}

/**
 * Gate navigation on a COMPLETED background round trip (measured empirically:
 * without it the Sehuatang list dimming never appears).
 *
 * WHY: every test runs in a fresh mkdtemp profile, so the first content-script
 * message of the first page load races the cold service worker's one-shot
 * IndexedDB open + schema upgrade + Store.healthCheck. The content side gives up
 * after the 8s sendMsg budget (`All retries exhausted: Message timeout after
 * 8000ms`) and sehuatang/app.ts never re-runs its mount-time watched check ⇒
 * zero dimming, forever. One awaited DB_GET_ALL from the popup page (which has
 * no 8s cap) proves the DB is actually open before any tab exists.
 */
export async function waitForBackgroundReady(
  extPage: Page,
  storeName = JAV_IDS_STORE,
): Promise<void> {
  await readAllKeys(extPage, storeName);
}
