/**
 * X31 — Douban recommendation badges and the game-detail NeoDB companion sync
 * must follow the record store live, in the same document.
 *
 * Both sites wrote the IndexedDB snapshot into the extracted work objects once
 * at mount (`enrichRecItems` / `enrichGameRecItems`), so an external write or
 * delete could never reach the badge without a reload; game-detail additionally
 * fed `syncNeoDBOnLoad` a `record` ref that nothing ever seeded, making its
 * companion sync unreachable. X30's "全部收口" claim missed both — this file is
 * the evidence for the two misses and the pin for the fix.
 *
 * Expected values come from the host DOM, never from the extractor under test.
 * "No reload" is proven by a flag on the live `window` (a reload would drop it),
 * because `page.url()` is identical before and after a reload too.
 */

import type { BrowserContext, Page } from '@playwright/test';
import {
  DOUBAN_STORE,
  expect,
  makeStoreRecord,
  sendRuntimeMessage,
  test,
} from './fixtures/extension-harness';
import { openDoubanFixturePage, type DoubanFixtureRule } from './fixtures/douban-crawl-fixtures';

const DETAIL_URL = 'https://movie.douban.com/subject/1292052/';
const DETAIL_OVERLAY = '#umm-detail-mask';
const DETAIL_CARD = `${DETAIL_OVERLAY} .umm-rec-item`;

const GAME_URL = 'https://www.douban.com/game/35317744/';
const GAME_OVERLAY = '#umm-douban-overlay';
const GAME_DOUBAN_KEY = 'game::35317744';
const NEODB_STORE = 'neodb_records';
/** linkedIds.neodb value seeded on the douban record — the companion row key. */
const NEODB_KEY = 'game::123456';
const NEODB_URL = 'https://neodb.social/game/123456/';

const escapeRe = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Route the fixture onto its real host URL, open the page, prove the body came from it. */
/** Alias of the shared helper (this spec does not wait for the shell). */
const openFixture = (ctx: BrowserContext, rule: DoubanFixtureRule, url: string): Promise<Page> =>
  openDoubanFixturePage(ctx, rule, url);

/** Marks the live document so a reload anywhere in the test becomes observable. */
async function markDocument(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { ummX31Document?: number }).ummX31Document = 1;
  });
}

async function documentIntact(page: Page): Promise<boolean> {
  return page.evaluate(
    () => (window as unknown as { ummX31Document?: number }).ummX31Document === 1,
  );
}

function cardByTitle(page: Page, cardSel: string, title: string) {
  return page.locator(cardSel).filter({
    has: page.locator('.umm-rec-title', { hasText: new RegExp(`^${escapeRe(title)}$`) }),
  });
}

/** Host truth for the rec grid: a row counts only when it has a cover and a titled link. */
async function readHostRecs(page: Page): Promise<{ title: string; id: string }[]> {
  return page.evaluate(() => {
    const out: { title: string; id: string }[] = [];
    for (const dl of Array.from(
      document.querySelectorAll('#recommendations .recommendations-bd dl'),
    )) {
      const img = dl.querySelector('dt img');
      const a = dl.querySelector('dd a');
      const title = a?.textContent?.trim() ?? '';
      const id = /\/subject\/(\d+)/.exec(a?.getAttribute('href') ?? '')?.[1] ?? '';
      if (!img || !a || !title || !id) continue;
      out.push({ title, id });
    }
    return out;
  });
}

test.describe('douban detail recommendation grid (crawled fixture)', () => {
  test('a write marks the paired rec card, a status change swaps the badge, a delete clears it — all without reload', async ({
    extContext,
    extPage,
  }) => {
    const page = await openFixture(
      extContext,
      { host: 'movie.douban.com', match: '/subject/1292052', fixture: 'detail-movie' },
      DETAIL_URL,
    );
    const host = await readHostRecs(page);
    expect(host.length, 'the host advertises recommendation rows').toBeGreaterThanOrEqual(2);

    const recCards = page.locator(DETAIL_CARD);
    await expect(recCards.first()).toBeVisible({ timeout: 60_000 });
    await expect(recCards).toHaveCount(host.length);
    // Overlay order must track the host order, otherwise an index-based join is meaningless.
    expect((await recCards.locator('.umm-rec-title').allInnerTexts()).map((t) => t.trim())).toEqual(
      host.map((r) => r.title),
    );

    const target = host[0];
    if (!target) throw new Error('the fixture advertises no recommendation rows');
    const key = `movie::${target.id}`;
    const card = cardByTitle(page, DETAIL_CARD, target.title);
    const wish = card.locator('.umm-status--wish');
    const done = card.locator('.umm-status--done');

    await markDocument(page);

    // Start from "no record": also resets anything an earlier test wrote here.
    const del0 = await sendRuntimeMessage(extPage, 'DB_DELETE', {
      storeName: DOUBAN_STORE,
      key,
    });
    expect(del0.success).toBe(true);
    await expect(wish).toHaveCount(0, { timeout: 30_000 });

    const putWish = await sendRuntimeMessage(extPage, 'DB_PUT', {
      storeName: DOUBAN_STORE,
      key,
      record: makeStoreRecord(`https://movie.douban.com/subject/${target.id}/`, 1, 0),
    });
    expect(putWish.success).toBe(true);
    await expect(wish).toHaveCount(1, { timeout: 30_000 });
    // Exactly the paired card — a prefix/id mix-up would light up its sibling too.
    await expect(page.locator(`${DETAIL_OVERLAY} .umm-status--wish`)).toHaveCount(1);

    const putDone = await sendRuntimeMessage(extPage, 'DB_PUT', {
      storeName: DOUBAN_STORE,
      key,
      record: makeStoreRecord(`https://movie.douban.com/subject/${target.id}/`, 2, 0),
    });
    expect(putDone.success).toBe(true);
    await expect(done).toHaveCount(1, { timeout: 30_000 });
    await expect(wish).toHaveCount(0, { timeout: 30_000 });

    const del = await sendRuntimeMessage(extPage, 'DB_DELETE', {
      storeName: DOUBAN_STORE,
      key,
    });
    expect(del.success).toBe(true);
    // Every card always carries a badge node — clearing means falling back to
    // the `none` label, not to a missing element.
    await expect(recCards.locator('.umm-status--done')).toHaveCount(0, { timeout: 30_000 });
    await expect(recCards.locator('.umm-status--wish')).toHaveCount(0, { timeout: 30_000 });
    await expect(card.locator('.umm-status--none')).toHaveCount(1, { timeout: 30_000 });

    expect(page.url()).toBe(DETAIL_URL);
    expect(await documentIntact(page), 'the document was never reloaded').toBe(true);
  });
});

test.describe('douban game-detail companion NeoDB sync (crawled fixture)', () => {
  test('an existing watched record with a neodb link reconciles into neodb_records on load', async ({
    extContext,
    extPage,
  }) => {
    // Pre-condition: nothing else created the companion row — only the on-load
    // reconcile path can, and it needs the record the page never reads today.
    const before = await sendRuntimeMessage(extPage, 'DB_GET', {
      storeName: NEODB_STORE,
      key: NEODB_KEY,
    });
    expect(before.success).toBe(true);
    expect(before.record ?? null, 'the companion row starts absent').toBeNull();

    const seed = await sendRuntimeMessage(extPage, 'DB_PUT', {
      storeName: DOUBAN_STORE,
      key: GAME_DOUBAN_KEY,
      record: makeStoreRecord(GAME_URL, 2, 0, { neodb: NEODB_KEY }),
    });
    expect(seed.success).toBe(true);

    const page = await openFixture(
      extContext,
      { host: 'www.douban.com', match: '/game/35317744', fixture: 'game-detail' },
      GAME_URL,
    );
    // The overlay really mounted and extracted — otherwise "no companion row"
    // would only prove the page never booted.
    const header = await page.evaluate(
      () => document.querySelector('#content h1')?.textContent?.trim() ?? '',
    );
    expect(header.length, 'the fixture names the game in its header').toBeGreaterThan(0);
    await expect(page.locator(`${GAME_OVERLAY} .umm-detail-title`)).toHaveText(header, {
      timeout: 60_000,
    });

    await expect
      .poll(
        async () =>
          (
            await sendRuntimeMessage(extPage, 'DB_GET', {
              storeName: NEODB_STORE,
              key: NEODB_KEY,
            })
          ).record?.url ?? null,
        { timeout: 30_000, message: 'the neodb link must be reconciled into neodb_records' },
      )
      .toBe(NEODB_URL);

    const row = await sendRuntimeMessage(extPage, 'DB_GET', {
      storeName: NEODB_STORE,
      key: NEODB_KEY,
    });
    expect(row.record?.status, 'the companion row carries the douban status').toBe(2);

    const stillSeeded = await sendRuntimeMessage(extPage, 'DB_GET', {
      storeName: DOUBAN_STORE,
      key: GAME_DOUBAN_KEY,
    });
    expect(stillSeeded.record?.status, 'the source record is untouched').toBe(2);
    expect(page.url()).toBe(GAME_URL);
  });
});
