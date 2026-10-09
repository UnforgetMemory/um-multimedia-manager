/**
 * X13 #2 — legacy content-script detail round trip (IMDb).
 *
 * Chain (all real, background IndexedDB included):
 *   content.ts (matches *://www.imdb.com/title/tt*) → fullInit (healthCheck +
 *   injectGlobalStyles) → router.ts `www.imdb.com/title/tt` route →
 *   handlers/imdb.ts handleIMDbDetailPage → createDetailPageHandler:
 *   waitForElement([data-testid=hero__pageTitle]) → scanIMDbPageStatus →
 *   Store.dbGet(imdb_records) → renderIMDbStatusChip (.umm-status-chip
 *   [data-umm-owner=imdb-movie]) → on page-done: Store.dbPut + toast.
 *   startIMDbStateObserver then re-runs the WHOLE pipeline when IMDb's own
 *   state nodes mutate (user clicks watched / rates) — simulated here by
 *   mutating exactly those DOM nodes, no reload.
 *
 * Key contract proven end-to-end: `{type}::{providerId}` =
 * `movie::tt0111161` in store `imdb_records` (identity.fromUrl pins IMDb to
 * type 'movie'), read back through the MV3 service worker via DB_GET.
 */

import {
  IMDB_STORE,
  expect,
  installImdbMocks,
  makeStoreRecord,
  sendRuntimeMessage,
  test,
} from './fixtures/extension-harness';
import { imdbTitlePageHtml } from './fixtures/imdb-title-page';

const TITLE_ID = 'tt0111161';
const TITLE = 'The E2E Redemption';
const RECORD_KEY = `movie::${TITLE_ID}`;
const TITLE_URL = `https://www.imdb.com/title/${TITLE_ID}/`;

const CHIP = '.umm-status-chip[data-umm-owner="imdb-movie"]';

/** Mutate the two IMDb state carriers exactly as IMDb's own JS would. */
async function simulateUserMarkWatched(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate((titleId) => {
    const watchedBtn = document.querySelector<HTMLButtonElement>(
      `[data-testid="watched-button-${titleId}"]`,
    );
    if (!watchedBtn) throw new Error('[e2e] watched button missing from fixture');
    watchedBtn.setAttribute('aria-pressed', 'true');
    watchedBtn.textContent = 'Watched';

    const ratingBtn = document.querySelector<HTMLButtonElement>(
      '[data-testid="hero-rating-bar__user-rating"] button',
    );
    if (!ratingBtn) throw new Error('[e2e] rating bar missing from fixture');
    ratingBtn.querySelector('[data-testid="hero-rating-bar__user-rating__unrated"]')?.remove();
    ratingBtn.setAttribute('aria-label', '8/10');
    ratingBtn.textContent = '8/10';
  }, TITLE_ID);
}

test('legacy IMDb pipeline: chip mounts, user-marking is picked up live and persisted to imdb_records', async ({
  extContext,
  extPage,
}) => {
  await installImdbMocks(extContext, {
    titleDetailHtml: imdbTitlePageHtml({ titleId: TITLE_ID, title: TITLE, watched: false }),
  });

  const page = await extContext.newPage();
  await page.goto(TITLE_URL, { waitUntil: 'domcontentloaded' });

  // Pipeline ran once on load: scan=none → dbGet(empty) → chip rendered, no DB write.
  const chip = page.locator(CHIP);
  await expect(chip).toHaveCount(1, { timeout: 60_000 });
  await expect(chip).toHaveAttribute('data-status', 'none');
  const initial = await sendRuntimeMessage(extPage, 'DB_GET', {
    storeName: IMDB_STORE,
    key: RECORD_KEY,
  });
  expect(initial.success).toBe(true);
  expect(initial.record ?? null).toBe(null);

  // User marks watched + rates 8/10 on the host page → state observer re-runs
  // the full pipeline → chip flips to done WITHOUT reload + base save writes.
  await simulateUserMarkWatched(page);
  await expect(chip).toHaveAttribute('data-status', 'done', { timeout: 30_000 });
  await expect(chip.locator('.umm-rating')).toHaveText('8/10');
  // The replace path keeps exactly one chip on the anchor row.
  await expect(page.locator(CHIP)).toHaveCount(1);

  // The record really landed in the background IndexedDB under the
  // {type}::{providerId} key (answer comes from the MV3 service worker).
  await expect
    .poll(
      async () => {
        const res = await sendRuntimeMessage(extPage, 'DB_GET', {
          storeName: IMDB_STORE,
          key: RECORD_KEY,
        });
        return `${String(res.record?.status)}|${String(res.record?.rating)}`;
      },
      { timeout: 30_000 },
    )
    .toBe('2|8');
  const stored = await sendRuntimeMessage(extPage, 'DB_GET', {
    storeName: IMDB_STORE,
    key: RECORD_KEY,
  });
  expect(stored.record?.url).toBe(TITLE_URL);
});

test('legacy IMDb pipeline: prewatched page renders done chip and backfills the record on first load', async ({
  extContext,
  extPage,
}) => {
  await installImdbMocks(extContext, {
    titleDetailHtml: imdbTitlePageHtml({
      titleId: TITLE_ID,
      title: TITLE,
      watched: true,
      userRating: 9,
    }),
  });

  const page = await extContext.newPage();
  await page.goto(TITLE_URL, { waitUntil: 'domcontentloaded' });

  const chip = page.locator(CHIP);
  await expect(chip).toHaveCount(1, { timeout: 60_000 });
  await expect(chip).toHaveAttribute('data-status', 'done');
  await expect(chip.locator('.umm-rating')).toHaveText('9/10');

  await expect
    .poll(
      async () => {
        const res = await sendRuntimeMessage(extPage, 'DB_GET', {
          storeName: IMDB_STORE,
          key: RECORD_KEY,
        });
        return res.record?.status ?? -1;
      },
      { timeout: 30_000 },
    )
    .toBe(2);
});

/**
 * X32 #2 — the external-write direction on the legacy detail chain.
 *
 * The IMDb state observer re-runs the pipeline when IMDb's OWN nodes mutate,
 * which covers the user-marked case. A record written elsewhere (popup, another
 * tab, NeoDB/WebDAV sync) changes no host DOM at all, so nothing re-renders the
 * chip until reload. This test therefore touches ONLY the database.
 */
test('an external record write and a later delete refresh the IMDb chip without any host DOM change', async ({
  extContext,
  extPage,
}) => {
  await installImdbMocks(extContext, {
    titleDetailHtml: imdbTitlePageHtml({ titleId: TITLE_ID, title: TITLE, watched: false }),
  });

  const page = await extContext.newPage();
  await page.goto(TITLE_URL, { waitUntil: 'domcontentloaded' });

  const chip = page.locator(CHIP);
  await expect(chip).toHaveCount(1, { timeout: 60_000 });
  await expect(chip).not.toHaveAttribute('data-status', 'done');

  // Reload would fake freshness: a token proves this very document survived.
  await page.evaluate(() => {
    (window as Window & { __ummDocToken?: string }).__ummDocToken = 'pre-write';
  });

  const put = await sendRuntimeMessage(extPage, 'DB_PUT', {
    storeName: IMDB_STORE,
    key: RECORD_KEY,
    record: makeStoreRecord(TITLE_URL, 2, 9),
  });
  expect(put.success).toBe(true);

  await expect(chip).toHaveAttribute('data-status', 'done', { timeout: 30_000 });
  await expect(chip.locator('.umm-rating')).toHaveText('9/10');
  // Exactly one chip: the refresh must replace, never stack.
  await expect(page.locator(CHIP)).toHaveCount(1);

  const del = await sendRuntimeMessage(extPage, 'DB_DELETE', {
    storeName: IMDB_STORE,
    key: RECORD_KEY,
  });
  expect(del.success).toBe(true);

  await expect(chip).not.toHaveAttribute('data-status', 'done', { timeout: 30_000 });
  await expect(page.locator(CHIP)).toHaveCount(1);
  expect(page.url()).toBe(TITLE_URL);
  const token = await page.evaluate(
    () => (window as Window & { __ummDocToken?: string }).__ummDocToken,
  );
  expect(token).toBe('pre-write');
});
