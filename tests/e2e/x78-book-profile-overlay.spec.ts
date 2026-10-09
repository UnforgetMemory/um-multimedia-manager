/**
 * X78 — Douban BOOK PROFILE (`https://book.douban.com/people/<uid>/`) in a real
 * browser with the real built extension. Host body is the byte-faithful fixture
 * `tests/fixtures/douban/book-profile.html` — the exact bytes the node-side
 * `tests/unit/book-profile-data.spec.ts` parses.
 *
 * book-profile is one of the two Douban page types no e2e ever navigated to (a
 * probe resolving every e2e URL through the PRODUCTION `detectPageType` gave
 * 31/33; the misses were `book-profile` and `video`).
 *
 * Contracts pinned:
 *   1. the content script injects and the document_start overlay shell
 *      (`#umm-douban-overlay`, the id `scenario/douban/early.ts` assigns to the
 *      book-profile page type) mounts with its shadow `<style>`;
 *   2. the profile panel actually renders (not a blank / not the spinner);
 *   3. every rendered book row traces to a host (title ↔ `/subject/<id>/`) pair
 *      the page itself carries (audit rule 10 — an invented, dropped or
 *      mis-paired row fails);
 *   4. the mount-failure affordance (`#umm-mount-failure`, light-DOM, see
 *      `overlay/mount-failure.ts`) is absent;
 *   5. the rendered subject ids are a subset of what the shared host reader
 *      `fixtures/douban-host-subjects.ts` returns, no id renders twice, and the
 *      positional 在读 grid (present in the host, excluded by `data.ts`) stays
 *      out of the dash cards.
 *
 * Expected values come from the HOST light DOM the overlay never writes to.
 *
 * ── FINDINGS recorded by the last test ───────────────────────────────────────
 * THE LIVE BADGE WAS A SILENT NO-OP ON book-profile — FIXED (X86). When this
 * spec was written, `pages/book-profile/config.ts` never called `loadRecordMap*`
 * and its `App.vue` rendered no `.umm-status--*` badge and subscribed to
 * nothing, so a real `DB_PUT` reached IndexedDB while no overlay row reacted.
 * ADR-015 §7 closed exactly 7 list pages and §7.1 the detail/game rec grids —
 * the `*-profile` grids were never in that sweep, which is how it survived.
 * Fix follows the established shape: config seeds a targeted `book::` batch
 * read, App.vue holds the live cache and DERIVES badges (never writes state
 * into the extracted items, never keys the row on it). The test below now
 * asserts the fixed contract; it is not weakened — the baseline leg changed
 * from "no badge exists at all" to "no row is marked 读过 before the write",
 * which is strictly the stronger statement.
 *
 * The brief's "beforeMount throws when extraction is empty" premise is FALSE for
 * this page: `data.ts#extractBookProfileData` returns null ONLY when the URL has
 * no `/people/<uid>` (`extractUserInfo` reads `location.href`, not the DOM), and
 * `config.ts` throws on `if (!data)` — i.e. only on that null. On any URL the
 * shell was created for, the grids may be empty yet `data` stays a truthy object
 * → NO failure panel. So "no failure panel" is near-unconditional here; its teeth
 * are exercised instead on the row-traceability contract (test 3).
 */

import type { BrowserContext, Page } from '@playwright/test';
import {
  DOUBAN_STORE,
  expect,
  makeStoreRecord,
  sendRuntimeMessage,
  test,
} from './fixtures/extension-harness';
import {
  installDoubanFixtureRoutes,
  type DoubanFixtureRule,
  type DoubanFixtureRoutes,
} from './fixtures/douban-crawl-fixtures';
import { readHostSubjects } from './fixtures/douban-host-subjects';

const OVERLAY = '#umm-douban-overlay';
const BOOK_PROFILE_URL = 'https://book.douban.com/people/27235071/';

const RULE: DoubanFixtureRule = {
  host: 'book.douban.com',
  match: '/people/27235071',
  fixture: 'book-profile',
};

interface HostBook {
  id: string;
  title: string;
  href: string;
}

/**
 * The two grids the extractor turns into dash cards — 读过 (`#db-book-mine >
 * div:first-child`) and 想读 (`> div:nth-child(2)`); the 在读 module is
 * positionally skipped, so it is NOT read here (a card for it would be invented).
 * Title precedence mirrors `data.ts`: `img[title]` over `img[alt]`.
 */
function readHostGrids(page: Page): Promise<HostBook[]> {
  return page.evaluate(() => {
    const grids = [
      '#db-book-mine > div:first-child .sub-list .list-s li',
      '#db-book-mine > div:nth-child(2) .sub-list .list-s li',
    ];
    const out: HostBook[] = [];
    for (const sel of grids) {
      for (const li of Array.from(document.querySelectorAll(sel))) {
        const link = li.querySelector<HTMLAnchorElement>('a.cover');
        const img = link?.querySelector<HTMLImageElement>('img');
        if (!link || !img) continue;
        const href = link.href || '';
        const id = /\/subject\/(\d+)/.exec(href)?.[1] ?? '';
        if (!id) continue;
        const title = (img.getAttribute('title') || img.getAttribute('alt') || '').trim();
        if (!title) continue;
        out.push({ id, title, href });
      }
    }
    return out;
  });
}

/**
 * Open the fixture on the real host, prove the DOCUMENT came from it, and wait
 * for the document_start shell's shadow `<style>`. Cover images legitimately fall
 * through to the catch-all, so the rule-typo guard is "the only fall-throughs are
 * asset paths" rather than "none" — a typo'd document rule would leave
 * `/people/27235071/...` unmatched, which is not an asset path.
 */
async function openBookProfile(
  extContext: BrowserContext,
  rule: DoubanFixtureRule = RULE,
): Promise<{ page: Page; routes: DoubanFixtureRoutes }> {
  const routes = await installDoubanFixtureRoutes(extContext, [rule]);
  const page = await extContext.newPage();
  await page.goto(BOOK_PROFILE_URL, { waitUntil: 'domcontentloaded' });
  expect(routes.served(), 'fixture answered the document').toContain(rule.fixture);
  const strays = routes.unmatched().filter((p) => !/\.(jpe?g|png|gif|webp|svg|ico)(\?|$)/i.test(p));
  expect(strays, 'only asset requests may fall through on the book host').toEqual([]);
  await page.waitForFunction(
    () => !!document.getElementById('umm-douban-overlay')?.shadowRoot?.querySelector('style'),
    undefined,
    { timeout: 30_000 },
  );
  return { page, routes };
}

test.describe('douban book-profile overlay (crawled fixture)', () => {
  test('shell + shadow style mount, the panel renders, and no failure affordance appears', async ({
    extContext,
  }) => {
    const { page } = await openBookProfile(extContext);

    await expect(page.locator('#umm-mount-failure')).toHaveCount(0);
    await expect(page.locator(OVERLAY)).toHaveCount(1);

    await expect(page.locator(`${OVERLAY} .umm-book-profile-root`).first()).toBeVisible({
      timeout: 60_000,
    });
    // The spinner is replaced by the app — a stranded spinner would mean no mount.
    await expect(page.locator(`${OVERLAY} .ov-loading`)).toHaveCount(0);

    const hostName = (
      await page.locator('.book-user-profile .username').first().innerText()
    ).trim();
    await expect(page.locator(`${OVERLAY} .umm-hero-name`).first()).toHaveText(hostName);
  });

  test('every rendered book row is a real host (title ↔ /subject/<id>/) pair', async ({
    extContext,
  }) => {
    const { page } = await openBookProfile(extContext);
    const hosts = await readHostGrids(page);
    expect(hosts.length, 'host grids advertise cover books').toBeGreaterThanOrEqual(3);
    expect(new Set(hosts.map((h) => h.id)).size, 'host ids are distinct').toBe(hosts.length);

    const cards = page.locator(`${OVERLAY} .umm-dash-card`);
    await expect(cards.first()).toBeVisible({ timeout: 60_000 });
    expect(await cards.count(), 'row count equals the two host grids').toBe(hosts.length);

    for (const host of hosts) {
      const card = cards.filter({
        has: page.locator('.umm-dash-card-title', { hasText: host.title }),
      });
      await expect(card, `host book ${host.title} has a row`).toHaveCount(1);
      const href = (await card.getAttribute('href')) ?? '';
      expect(href, `row for ${host.title} links its own subject`).toContain(`/subject/${host.id}/`);
    }

    // Nothing invented: every rendered title exists in the host grids.
    const rendered = (await cards.locator('.umm-dash-card-title').allInnerTexts()).map((t) =>
      t.trim(),
    );
    const hostTitles = new Set(hosts.map((h) => h.title));
    for (const t of rendered) {
      expect(
        hostTitles.has(t),
        `overlay invented a title absent from host: ${JSON.stringify(t)}`,
      ).toBe(true);
    }
  });

  // ── reverse-verification (fixture-only, no rebuild needed) ───────────────
  // Relabel + re-id ONE cover in the host grids. The overlay must re-read the
  // host, so it must render the sentinel title linked to the NEW subject id, and
  // the ORIGINAL pair must vanish. If the row were frozen from code instead of
  // traced from the host, the sentinel would be absent and the old pair present.
  test('REVERSE: a host mutation is reflected row-for-row (traceability has teeth)', async ({
    extContext,
  }) => {
    const sentinelTitle = 'SENTINEL-RELAB-78';
    const sentinelId = '99900011';
    const mutated: DoubanFixtureRule = {
      host: 'book.douban.com',
      match: '/people/27235071',
      fixture: 'book-profile',
      transform: (html) => {
        const next = html
          .replace('href="/subject/36185161/"', `href="/subject/${sentinelId}/"`)
          .replace('长安的荔枝（插图珍藏本）', sentinelTitle);
        if (!next.includes(sentinelTitle) || !next.includes(`/subject/${sentinelId}/`)) {
          // The crawl changed shape — fail loudly instead of passing vacuously.
          throw new Error('[e2e] book-profile reverse-verify transform did not land');
        }
        return next;
      },
    };
    const { page } = await openBookProfile(extContext, mutated);
    const cards = page.locator(`${OVERLAY} .umm-dash-card`);
    await expect(cards.first()).toBeVisible({ timeout: 60_000 });

    const mutatedRow = cards.filter({
      has: page.locator('.umm-dash-card-title', { hasText: sentinelTitle }),
    });
    await expect(mutatedRow, 'host relabel must show up as a rendered title').toHaveCount(1);
    await expect(mutatedRow).toHaveAttribute('href', new RegExp(`/subject/${sentinelId}/`));

    // The original title/id must be gone from the dash cards.
    await expect(
      cards.filter({
        has: page.locator('.umm-dash-card-title', { hasText: '长安的荔枝（插图珍藏本）' }),
      }),
    ).toHaveCount(0);
  });

  // ── cross-check through the shared host-pair reader ──────────────────────
  // `fixtures/douban-host-subjects.ts` walks EVERY `a[href*="/subject/"]` the host
  // document ships, independently of the grid selectors above. The overlay may
  // only ever light ids that reader returns, and the 在读 grid is the negative
  // control: those two subjects DO exist in the host, so a leak is a real leak
  // rather than an artefact of the reader missing them.
  test('rendered rows are a subset of the host /subject/ pairs and the out-of-scope grid stays out', async ({
    extContext,
  }) => {
    const { page } = await openBookProfile(extContext);
    const cards = page.locator(`${OVERLAY} .umm-dash-card`);
    await expect(cards.first()).toBeVisible({ timeout: 60_000 });

    const hosts = await readHostSubjects(page);
    expect(hosts.length, 'host document carries /subject/ pairs').toBeGreaterThan(5);
    const hostIds = new Set(hosts.map((h) => h.id));

    const renderedIds = await cards.evaluateAll((els) =>
      els.map((el) => /\/subject\/(\d+)/.exec(el.getAttribute('href') ?? '')?.[1] ?? ''),
    );
    expect(renderedIds.length, 'overlay rendered at least one dash card').toBeGreaterThan(0);
    for (const id of renderedIds) {
      expect(hostIds.has(id), `overlay invented subject ${id}`).toBe(true);
    }
    expect(new Set(renderedIds).size, 'no subject rendered twice').toBe(renderedIds.length);

    for (const excluded of ['1002222', '1003333']) {
      expect(hostIds.has(excluded), `fixture lost the 在读 subject ${excluded}`).toBe(true);
      expect(
        renderedIds.includes(excluded),
        `the positional 在读 grid leaked into the dash cards: ${excluded}`,
      ).toBe(false);
    }
    // The dead cell: an `a.cover` whose href carries no /subject/<digits>.
    await expect(cards.filter({ hasText: '豆列封面行应被跳过' })).toHaveCount(0);

    expect(page.url(), 'no navigation happened in this leg').toBe(BOOK_PROFILE_URL);
  });

  // ── intentional RED: the ADR-015 silent no-op on this page family ────────
  test('ADR-015 live badge: an external DB write must flip the row without reload', async ({
    extContext,
    extPage,
  }) => {
    const { page } = await openBookProfile(extContext);
    const cards = page.locator(`${OVERLAY} .umm-dash-card`);
    await expect(cards.first()).toBeVisible({ timeout: 60_000 });
    const before = page.url();

    // Baseline after the fix: every row carries a badge, and none of them reads
    // 读过 (status 2) before the external write lands. Asserting "no badge
    // exists" would have been the defect pin; asserting "no badge is DONE" is
    // strictly stronger, because it also fails if rows arrive pre-marked.
    await expect(page.locator(`${OVERLAY} .umm-dash-card [class*='umm-status']`)).toHaveCount(
      await cards.count(),
    );
    await expect(page.locator(`${OVERLAY} .umm-dash-card .umm-status--done`)).toHaveCount(0);

    const title = (await cards.first().locator('.umm-dash-card-title').innerText()).trim();
    const href = (await cards.first().getAttribute('href')) ?? '';
    const id = /\/subject\/(\d+)/.exec(href)?.[1] ?? '';
    expect(id, `host row for ${JSON.stringify(title)} carries a subject id`).not.toBe('');

    const res = await sendRuntimeMessage(extPage, 'DB_PUT', {
      storeName: DOUBAN_STORE,
      key: `book::${id}`,
      record: makeStoreRecord(`https://book.douban.com/subject/${id}/`, 2, 0),
    });
    expect(res.success, 'the DB write itself succeeds').toBe(true);

    // handleDbPut broadcasts record:updated → the row must light a badge in the
    // SAME document (no reload). RED here = broadcast reaches the tab but the
    // overlay has no subscription/badge → the ADR-015 event path is a silent
    // no-op on book-profile (config.ts has no loadRecordMap*, App.vue no status).
    const flipped = cards
      .filter({ has: page.locator('.umm-dash-card-title', { hasText: title }) })
      .locator('.umm-status--done');
    await expect(
      flipped.first(),
      'record:updated must mark the row DONE without a reload',
    ).toBeVisible({ timeout: 15_000 });

    // Kept for completeness: the page never reloaded across the write.
    expect(page.url(), 'no reload happened').toBe(before);
  });
});
