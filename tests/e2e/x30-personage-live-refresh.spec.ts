/**
 * X30 — Douban PERSONAGE (`www.douban.com/personage/{id}/`) live record refresh.
 *
 * This page belonged to the ADR-015 gap: `config.ts` used to write the record
 * snapshot into the extracted work objects once at mount, so an external write
 * or delete could never land without a reload. It now seeds `useRecordCache`
 * and derives badges in a computed, which is what this file pins — including
 * the delete direction the old mutation could not express at all.
 *
 * Expected values come from the host DOM (`readHostSubjects`), never from the
 * extractor under test; pairing is by exact title.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DOUBAN_STORE,
  expect,
  makeStoreRecord,
  sendRuntimeMessage,
  test,
} from './fixtures/extension-harness';
import { installDoubanFixtureRoutes } from './fixtures/douban-crawl-fixtures';
import { readHostSubjects } from './fixtures/douban-host-subjects';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_FILE = path.resolve(HERE, '..', 'fixtures', 'douban', 'personage.html');
const OVERLAY = '#umm-personage-overlay';
const PERSONAGE_URL = 'https://www.douban.com/personage/90000001/';
const CARD = `${OVERLAY} .umm-rec-item`;

/** Grid cards are `div.umm-rec-item` (no anchor), so the title is the join key. */
function cardByTitle(page: import('@playwright/test').Page, title: string) {
  return page
    .locator(CARD)
    .filter({ has: page.locator('.umm-rec-title', { hasText: new RegExp(`^${title}$`) }) });
}

/**
 * The fixture names the same subject two ways: the awards section writes
 * `《长途跋涉》`, the works sections `长途跋涉`. `readHostSubjects` keeps the first
 * anchor per subject id, so the pair only resolves once the book-mark title
 * decoration is off.
 */
function normalize(text: string): string {
  return text.replace(/[《》\s]/g, '').trim();
}

async function openPersonagePage(
  extContext: import('@playwright/test').BrowserContext,
): Promise<import('@playwright/test').Page> {
  await installDoubanFixtureRoutes(extContext, [
    { host: 'www.douban.com', match: '/personage/', fixture: 'personage' },
  ]);
  const page = await extContext.newPage();
  await page.goto(PERSONAGE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => !!document.getElementById('umm-personage-overlay')?.shadowRoot?.querySelector('style'),
    undefined,
    { timeout: 30_000 },
  );
  return page;
}

test.describe('douban personage overlay live records (crawled fixture)', () => {
  test('host fixture advertises the subject pairs this spec pairs against', async ({
    extContext,
  }) => {
    expect(FIXTURE_FILE.endsWith('personage.html')).toBe(true);
    const page = await openPersonagePage(extContext);
    const hosts = await readHostSubjects(page);
    expect(hosts.length, 'host works section exposes subject links').toBeGreaterThan(1);
    expect(new Set(hosts.map((h) => h.id)).size, 'host ids are distinct').toBe(hosts.length);
  });

  test('an external write marks the card and an external delete unmarks it, without reload', async ({
    extContext,
    extPage,
  }) => {
    const page = await openPersonagePage(extContext);
    const cards = page.locator(CARD);
    // withRetry extraction may take a few rounds before the works sections settle
    await expect(cards.first()).toBeVisible({ timeout: 60_000 });
    expect(await cards.count(), 'both works sections render cards').toBeGreaterThan(1);

    const title = normalize(await cards.first().locator('.umm-rec-title').innerText());
    const hosts = await readHostSubjects(page);
    const hits = hosts.filter((h) => normalize(h.title) === title);
    expect(hits.length, `ambiguous or missing host pair for ${JSON.stringify(title)}`).toBe(1);
    const id = hits[0]?.id;
    expect(id).toBeDefined();
    const key = `movie::${id}`;
    // The fixture lists 长途跋涉 in BOTH works sections (recent + popular), so one
    // subject legitimately owns several cards — every one of them must move.
    const ownCards = cardByTitle(page, title);
    const ownCount = await ownCards.count();
    expect(ownCount, 'the paired subject is rendered at least once').toBeGreaterThanOrEqual(1);
    const wish = ownCards.locator('.umm-status--wish');

    // Start from "no record": also resets anything an earlier test wrote here.
    const del = await sendRuntimeMessage(extPage, 'DB_DELETE', {
      storeName: DOUBAN_STORE,
      key,
    });
    expect(del.success).toBe(true);
    await expect(wish).toHaveCount(0, { timeout: 30_000 });

    const put = await sendRuntimeMessage(extPage, 'DB_PUT', {
      storeName: DOUBAN_STORE,
      key,
      record: makeStoreRecord(`https://movie.douban.com/subject/${id}/`, 1, 0),
    });
    expect(put.success).toBe(true);
    await expect(wish).toHaveCount(ownCount, { timeout: 30_000 });
    // No other subject's card may light up — a prefix/id mix-up would mark more.
    await expect(page.locator(`${OVERLAY} .umm-status--wish`)).toHaveCount(ownCount);

    const del2 = await sendRuntimeMessage(extPage, 'DB_DELETE', {
      storeName: DOUBAN_STORE,
      key,
    });
    expect(del2.success).toBe(true);
    await expect(wish).toHaveCount(0, { timeout: 30_000 });

    // Same document throughout: no reload happened between write and mark.
    expect(page.url()).toBe(PERSONAGE_URL);
  });
});

const CREATIONS_URL = 'https://www.douban.com/personage/90000001/creations?sortby=time';
const CREATION_CARD = `${OVERLAY} .umm-creation-card`;

async function openCreationsPage(
  extContext: import('@playwright/test').BrowserContext,
): Promise<import('@playwright/test').Page> {
  await installDoubanFixtureRoutes(extContext, [
    {
      host: 'www.douban.com',
      match: '/personage/90000001/creations',
      fixture: 'personage-creations',
    },
  ]);
  const page = await extContext.newPage();
  await page.goto(CREATIONS_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => !!document.getElementById('umm-personage-overlay')?.shadowRoot?.querySelector('style'),
    undefined,
    { timeout: 30_000 },
  );
  return page;
}

test.describe('douban personage-creations overlay live badges (crawled fixture)', () => {
  // This page's badge is derived from `recordStatusBadge` over the live map, so
  // the mutation it replaces (writing `recordStatus` into the extracted items at
  // mount) could not clear a badge on delete at all.
  test('an external write adds the status badge and an external delete removes it, without reload', async ({
    extContext,
    extPage,
  }) => {
    const page = await openCreationsPage(extContext);
    const cards = page.locator(CREATION_CARD);
    await expect(cards.first()).toBeVisible({ timeout: 60_000 });
    expect(await cards.count(), 'the creations list renders several cards').toBeGreaterThan(2);

    const hosts = await readHostSubjects(page);
    expect(hosts.length, 'host creations expose subject links').toBeGreaterThan(1);

    const rendered = (await cards.locator('.umm-creation-title').allInnerTexts()).map(normalize);
    // Card order is the extractor output order, so an index is a valid join key
    // only while the list has no duplicate title.
    expect(new Set(rendered).size, 'rendered creation titles are unique').toBe(rendered.length);

    let picked = -1;
    let id = '';
    for (const [i, title] of rendered.entries()) {
      const hits = hosts.filter((h) => normalize(h.title) === title);
      if (hits.length === 1) {
        picked = i;
        id = hits[0]?.id ?? '';
        break;
      }
    }
    expect(picked, 'at least one card pairs uniquely with the host DOM').toBeGreaterThanOrEqual(0);
    expect(id, 'the paired host subject carries an id').not.toBe('');

    const badge = cards.nth(picked).locator('.umm-creation-badge--wish');

    const del = await sendRuntimeMessage(extPage, 'DB_DELETE', {
      storeName: DOUBAN_STORE,
      key: `movie::${id}`,
    });
    expect(del.success).toBe(true);
    await expect(badge).toHaveCount(0, { timeout: 30_000 });

    const put = await sendRuntimeMessage(extPage, 'DB_PUT', {
      storeName: DOUBAN_STORE,
      key: `movie::${id}`,
      record: makeStoreRecord(`https://movie.douban.com/subject/${id}/`, 1, 0),
    });
    expect(put.success).toBe(true);
    await expect(badge).toHaveCount(1, { timeout: 30_000 });
    // No other card may light up — a prefix/id mix-up would mark more than one.
    await expect(page.locator(`${OVERLAY} .umm-creation-badge--wish`)).toHaveCount(1);

    const del2 = await sendRuntimeMessage(extPage, 'DB_DELETE', {
      storeName: DOUBAN_STORE,
      key: `movie::${id}`,
    });
    expect(del2.success).toBe(true);
    await expect(badge).toHaveCount(0, { timeout: 30_000 });

    expect(page.url()).toBe(CREATIONS_URL);
  });
});
