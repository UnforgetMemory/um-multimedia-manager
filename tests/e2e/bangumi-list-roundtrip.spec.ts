/**
 * X14 #4 — legacy content-script round trip on the Bangumi (bangumi.tv)
 * browse list: seeded IndexedDB records drive per-card 已看 marking.
 *
 * Chain (all production code, real MV3 service worker in between):
 *   content.ts manifest match `*://bangumi.tv/*` → fullInit (initI18n →
 *   Store.healthCheck gate → injectGlobalStyles → initRouter) → router.ts rule
 *   `/bgm\.tv|bangumi\.tv|chii\.in` + extractBrowserPathType →
 *   handlers/bangumi-list.ts handleBangumiListPage → waitForElement
 *   ('ul.browserFull.browser-list') → bangumiTypePrefix('anime') = 'tv' →
 *   Store.dbGetBulk('bangumi_records', ['tv::<id>', …]) → DB_GET_BULK answered
 *   by the background → createListMarker per li (data-status + .umm-rating).
 *
 * Contract proven end-to-end: the `{type}::{providerId}` key the extension
 * writes is exactly what the list handler reads back — anime browse records
 * live under the `tv` prefix, NOT `anime` — across all four status codes plus
 * the no-record control, and the non-numeric `li` id stays unmarked. The same
 * records are then read straight out of IndexedDB through the service worker,
 * closing the round trip from both ends.
 *
 * Chosen over the web5.mukaku.com handler on purpose: Mukaku's list page dims
 * only after a `/prod/api/v1/getVideoDetail` probe behind an
 * IntersectionObserver viewport pass (src/entrypoints/content/handlers/mukaku/
 * {api,dom,handler}.ts), so its first paint carries no verifiable card
 * decision; the bangumi browse list is the deterministic legacy list round trip.
 */

import { expect, test } from './fixtures/extension-harness';
import {
  BANGUMI_STORE,
  installBangumiMocks,
  readRecord,
  seedRecord,
  waitForBackgroundReady,
} from './fixtures/host-mocks';
import { BANGUMI_LIST_ITEMS, bangumiBrowserListHtml } from './fixtures/bangumi-page';

const LIST_URL = 'https://bangumi.tv/anime/browser';
const MARKER = '.umm-list-status';

test('bangumi browse list marks every card from seeded bangumi_records through the legacy router pipeline', async ({
  extContext,
  extPage,
}) => {
  await installBangumiMocks(extContext, { browserListHtml: bangumiBrowserListHtml() });

  // Seed the store BEFORE navigation (popup origin → SW → IndexedDB).
  for (const item of BANGUMI_LIST_ITEMS) {
    if (item.status === null || item.decoyId) continue;
    const res = await seedRecord(
      extPage,
      BANGUMI_STORE,
      `tv::${item.subjectId}`,
      `https://bangumi.tv/subject/${item.subjectId}/`,
      item.status,
      item.rating,
    );
    expect(res.success).toBe(true);
  }

  await waitForBackgroundReady(extPage, BANGUMI_STORE);

  const page = await extContext.newPage();
  await page.goto(LIST_URL, { waitUntil: 'domcontentloaded' });

  // Legacy fullInit really ran (its global sheet is the marker's style source).
  await expect(page.locator('#umm-global-styles')).toBeAttached({ timeout: 60_000 });

  // One marker per parseable card — the `item_not_a_number` decoy stays clean.
  await expect(page.locator(MARKER)).toHaveCount(4, { timeout: 30_000 });
  await expect(page.locator('#item_not_a_number .umm-list-status')).toHaveCount(0);

  // Status → attribute mapping (the semantic-colour contract), per seeded row.
  await expect(page.locator('#item_545465 ' + MARKER)).toHaveAttribute('data-status', 'done');
  await expect(page.locator('#item_301234 ' + MARKER)).toHaveAttribute('data-status', 'wish');
  await expect(page.locator('#item_222333 ' + MARKER)).toHaveAttribute('data-status', 'doing');
  await expect(page.locator('#item_110122 ' + MARKER)).toHaveAttribute('data-status', 'none');

  // Rating badge: clamped to 0.5 steps, "/10" suffix, absent when unrated.
  await expect(page.locator('#item_545465 .umm-rating')).toHaveText('8/10');
  await expect(page.locator('#item_222333 .umm-rating')).toHaveText('6.5/10');
  await expect(page.locator('#item_110122 .umm-rating')).toHaveCount(0);

  // Markers mount on the card's .inner anchor and the global sheet styles them
  // (a data-status attribute alone would not prove the CSS chain). The status
  // fills are --umm-fill-* linear-gradients, which compute to background-IMAGE
  // (backgroundColor stays transparent) — so the paint proof reads backgroundImage.
  const donePaint = await page.evaluate(() => {
    const pick = (id: string): string => {
      const node = document.querySelector<HTMLElement>(`#${id} ${'.umm-list-status'}`);
      return node ? getComputedStyle(node).backgroundImage : 'missing';
    };
    return { done: pick('item_545465'), none: pick('item_110122') };
  });
  expect(donePaint.done).not.toBe('missing');
  expect(donePaint.done).toMatch(/linear-gradient/);
  expect(donePaint.done).not.toBe(donePaint.none);

  // Read the very same records back out of IndexedDB via the service worker.
  const stored = await readRecord(extPage, BANGUMI_STORE, 'tv::545465');
  expect(stored.success).toBe(true);
  expect(stored.record?.status).toBe(2);
  expect(stored.record?.rating).toBe(8);
  expect(stored.record?.url).toBe('https://bangumi.tv/subject/545465/');
  const absent = await readRecord(extPage, BANGUMI_STORE, 'tv::110122');
  expect(absent.record ?? null).toBe(null);
});
