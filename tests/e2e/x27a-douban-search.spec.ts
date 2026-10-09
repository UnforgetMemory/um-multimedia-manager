/**
 * X27-A #2 — Douban SEARCH results (`search.douban.com/movie/subject_search`)
 * in a real browser with the real built extension, host body replaced by the
 * crawled fixture `tests/fixtures/douban/homepage.html`'s sibling `search.html`.
 *
 * The search overlay has its own renderer (`.umm-search-card`, filter buttons,
 * paginator), so this file pins a different contract set than the homepage spec:
 * filter interaction + card link pairing + live badge re-read.
 *
 * Expected values come from the host DOM (`readHostSubjects`), never from the
 * extractor under test. Pairing requires a UNIQUE title match — this fixture
 * holds both 《流浪地球》 and 《流浪地球2》, and a containment match between them
 * silently reads/writes the wrong subject.
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
const FIXTURE_FILE = path.resolve(HERE, '..', 'fixtures', 'douban', 'search.html');
const OVERLAY = '#umm-search-overlay';
const SEARCH_URL = 'https://search.douban.com/movie/subject_search?search_text=流浪地球&cat=1002';

function normalize(text: string): string {
  return text.replace(/[《》\s]/g, '').trim();
}

/**
 * Exact-title pairing. The fixture holds both 《流浪地球》 and 《流浪地球2》, so a
 * containment match would happily pair them and then write/read a record for the
 * wrong subject — the failure mode that made this file's first revision red.
 */
function pairFor(
  hosts: Array<{ title: string; id: string }>,
  rendered: string,
): string | undefined {
  const want = normalize(rendered);
  const hits = hosts.filter((h) => normalize(h.title) === want);
  return hits.length === 1 ? hits[0]?.id : undefined;
}

async function openSearchPage(
  extContext: import('@playwright/test').BrowserContext,
): Promise<import('@playwright/test').Page> {
  await installDoubanFixtureRoutes(extContext, [
    { host: 'search.douban.com', match: '/movie/subject_search', fixture: 'search' },
  ]);
  const page = await extContext.newPage();
  await page.goto(SEARCH_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    // getElementById takes a bare id, not a selector — passing OVERLAY here would
    // look up "#umm-search-overlay" and never match.
    () => !!document.getElementById('umm-search-overlay')?.shadowRoot?.querySelector('style'),
    undefined,
    { timeout: 30_000 },
  );
  return page;
}

test.describe('douban search results overlay (crawled fixture)', () => {
  test('fixture advertises subject links for the expected values', async ({ extContext }) => {
    // Vacuity guard: without host pairs every later assertion could pass on noise.
    expect(FIXTURE_FILE.endsWith('search.html')).toBe(true);
    const page = await openSearchPage(extContext);
    const hosts = await readHostSubjects(page);
    expect(hosts.length, 'host search results expose subject links').toBeGreaterThan(2);
  });

  test('overlay renders cards whose titles all exist in the host results', async ({
    extContext,
  }) => {
    const page = await openSearchPage(extContext);
    const titles = page.locator(`${OVERLAY} .umm-search-card .umm-search-card-title`);
    await expect(titles.first()).toBeVisible({ timeout: 60_000 });
    const rendered = (await titles.allInnerTexts()).map(normalize);
    expect(rendered.length).toBeGreaterThanOrEqual(2);

    const hosts = await readHostSubjects(page);
    for (const t of rendered) {
      const id = pairFor(hosts, t);
      expect(id, `rendered title has no unique host match: ${JSON.stringify(t)}`).toBeDefined();
    }
  });

  test('clicking a filter button moves the active state (real UI interaction)', async ({
    extContext,
  }) => {
    const page = await openSearchPage(extContext);
    const buttons = page.locator(`${OVERLAY} .umm-type-btn`);
    await expect(buttons.first()).toBeVisible({ timeout: 60_000 });
    const count = await buttons.count();
    expect(count).toBeGreaterThanOrEqual(2);

    const activeBefore = await page.locator(`${OVERLAY} .umm-type-btn--active`).count();
    expect(activeBefore, 'exactly one filter is active at rest').toBe(1);

    // Pick a button that is not the active one, click it, and require the active
    // class to have moved onto it — a dead or non-reactive filter fails here.
    let picked: number = -1;
    for (let i = 0; i < count; i++) {
      const b = buttons.nth(i);
      if (!(await b.evaluate((el) => el.classList.contains('umm-type-btn--active')))) {
        picked = i;
        break;
      }
    }
    expect(picked).toBeGreaterThanOrEqual(0);
    await buttons.nth(picked).click();
    await expect(buttons.nth(picked)).toHaveClass(/umm-type-btn--active/);
    await expect(page.locator(`${OVERLAY} .umm-type-btn--active`)).toHaveCount(1);
  });

  test('each result card IS the link to the subject its own title belongs to', async ({
    extContext,
  }) => {
    const page = await openSearchPage(extContext);
    // UmmSearchCard renders `<a class="umm-search-card">` — the card element is
    // the link, so a descendant-anchor lookup finds nothing (that mistake made
    // this file's first revision write `movie::undefined`).
    const cards = page.locator(`${OVERLAY} a.umm-search-card`);
    await expect(cards.first()).toBeVisible({ timeout: 60_000 });
    const firstTitle = (await cards.first().locator('.umm-search-card-title').innerText()).trim();
    const id = pairFor(await readHostSubjects(page), firstTitle);
    expect(id, `ambiguous or missing host pair for ${JSON.stringify(firstTitle)}`).toBeDefined();

    await expect(cards.first()).toHaveAttribute('href', new RegExp(`/subject/${id}/`));
  });

  test('a record written before mount marks exactly that card', async ({ extContext, extPage }) => {
    // Seed FIRST, then open the page: this is the mount-time targeted seed read
    // (pages/search/config.ts → loadRecordMapForIds), which does work.
    const hostsProbe = await extContext.newPage();
    await installDoubanFixtureRoutes(extContext, [
      { host: 'search.douban.com', match: '/movie/subject_search', fixture: 'search' },
    ]);
    await hostsProbe.goto('https://search.douban.com/movie/subject_search?search_text=x&cat=1002', {
      waitUntil: 'domcontentloaded',
    });
    const firstHref = await hostsProbe
      .locator(`${OVERLAY} a.umm-search-card`)
      .first()
      .getAttribute('href');
    const title = (
      await hostsProbe
        .locator(`${OVERLAY} a.umm-search-card .umm-search-card-title`)
        .first()
        .innerText()
    ).trim();
    const id = pairFor(await readHostSubjects(hostsProbe), title);
    expect(id, `ambiguous or missing host pair for ${JSON.stringify(title)}`).toBeDefined();
    expect(firstHref).toContain(`/subject/${id}/`);
    await hostsProbe.close();

    const res = await sendRuntimeMessage(extPage, 'DB_PUT', {
      storeName: DOUBAN_STORE,
      key: `movie::${id}`,
      record: makeStoreRecord(`https://movie.douban.com/subject/${id}/`, 1, 0),
    });
    expect(res.success).toBe(true);

    const page = await openSearchPage(extContext);
    const cards = page.locator(`${OVERLAY} a.umm-search-card`);
    await expect(cards.first()).toBeVisible({ timeout: 60_000 });
    await expect(page.locator(`${OVERLAY} .umm-status--wish`)).toHaveCount(1, { timeout: 30_000 });
    await expect(cards.first().locator('.umm-status--wish')).toHaveCount(1);
  });

  // Bidirectional live refresh (ADR-015): the write AND the delete must land
  // without a reload. Deleting first also resets state the previous test's
  // DB_PUT left in this browser context's IndexedDB.
  test('an external write marks the card, and a delete unmarks it, without reload', async ({
    extContext,
    extPage,
  }) => {
    const page = await openSearchPage(extContext);
    const cards = page.locator(`${OVERLAY} a.umm-search-card`);
    await expect(cards.first()).toBeVisible({ timeout: 60_000 });

    const title = (await cards.first().locator('.umm-search-card-title').innerText()).trim();
    const id = pairFor(await readHostSubjects(page), title);
    expect(id, `ambiguous or missing host pair for ${JSON.stringify(title)}`).toBeDefined();
    const key = `movie::${id}`;
    const wish = page.locator(`${OVERLAY} .umm-status--wish`);

    const del = await sendRuntimeMessage(extPage, 'DB_DELETE', {
      storeName: DOUBAN_STORE,
      key,
    });
    expect(del.success).toBe(true);
    await expect(wish).toHaveCount(0, { timeout: 30_000 });

    const res = await sendRuntimeMessage(extPage, 'DB_PUT', {
      storeName: DOUBAN_STORE,
      key,
      record: makeStoreRecord(`https://movie.douban.com/subject/${id}/`, 1, 0),
    });
    expect(res.success).toBe(true);

    await expect(wish).toHaveCount(1, { timeout: 30_000 });
    await expect(
      cards
        .filter({ has: page.locator('.umm-search-card-title', { hasText: title }) })
        .locator('.umm-status--wish'),
    ).toHaveCount(1);
    // Same document, not a reload: the browser percent-encodes the query, so
    // compare decoded to keep "no navigation happened" the actual assertion.
    expect(decodeURIComponent(page.url())).toBe(SEARCH_URL);
  });
});
