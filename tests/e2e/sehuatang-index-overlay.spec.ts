/**
 * X14 #3 — Sehuatang site-index overlay (runSehuatangIndexApp) in a real
 * browser, including its negative contract: the index is a NAVIGATION layer.
 *
 * Proven chain: manifest match `*://www.sehuatang.net/` (site root) →
 * sehuatang-early builds the shadow shell (isIndexUrl → isOverlayPage) →
 * sehuatang-main classifies 'index' → app-home: attachSehuatangOverlay →
 * extractIndexCategories ([id^="category_"].bm_c > td.fl_g) → hide #ct →
 * header + per-category card grid + floatbar search island → mountContent.
 *
 * The negative half is the point of this test: a sub-forum literally named
 * "SSIS-123" exists in the fixture AND that id is seeded as watched in
 * jav_ids, so a card-level watched lookup would surface as a dim class /
 * track key. It must not: no data-avid, no data-tid, no .umm-viewed anywhere
 * — and the three adult stores contain exactly the keys this test wrote (the
 * only store traffic the index page produces is its read-only aggregate
 * stats line, ADULT_AV_STATS).
 */

import { expect, test } from './fixtures/extension-harness';
import {
  ADULT_STORES,
  JAV_IDS_STORE,
  installSehuatangMocks,
  readAllKeys,
  seedAdultRecord,
  waitForBackgroundReady,
} from './fixtures/host-mocks';
import {
  auditInjectedStyles,
  countInLightDom,
  lightDomDisplay,
  probeOverlay,
} from './fixtures/overlay-probe';
import { sehuatangIndexHtml } from './fixtures/sehuatang-page';

const INDEX_URL = 'https://www.sehuatang.net/';
const OVERLAY_ID = 'umm-sht-overlay';

test('index overlay renders the category grid as pure navigation and never consults or writes the watched stores', async ({
  extContext,
  extPage,
}) => {
  await installSehuatangMocks(extContext, { indexHtml: sehuatangIndexHtml() });

  // The live trigger for the negative assertion: a watched id that also names
  // a sub-forum card on this page.
  const seeded = await seedAdultRecord(extPage, JAV_IDS_STORE, 'sehuatang::SSIS-123', INDEX_URL);
  expect(seeded.success).toBe(true);
  await waitForBackgroundReady(extPage);

  const page = await extContext.newPage();
  await page.goto(INDEX_URL, { waitUntil: 'domcontentloaded' });

  // 1. Shell taken over: overlay stylesheet present, loading skeleton replaced.
  await expect
    .poll(
      async () => {
        const probe = await probeOverlay(page, OVERLAY_ID);
        return probe.shadowStylePresent && !probe.loadingPresent;
      },
      { timeout: 60_000 },
    )
    .toBe(true);

  // 2. Navigation content: two category sections, three sub-forum cards, in
  //    extraction order, plus the site-stats line in the header.
  const probe = await probeOverlay(page, OVERLAY_ID);
  expect(probe.home.sections).toBe(2);
  expect(probe.home.cardNames).toEqual(['国产原创', 'SSIS-123', '美剧系列']);
  // List-page machinery stayed off: no preview grid, no cards with track keys.
  expect(probe.gridPresent).toBe(false);
  expect(probe.cards.every((card) => card.avid === null && card.tid === null)).toBe(true);
  expect(probe.home.viewedCards).toBe(0);
  // Light DOM (no shadow piercing) must not carry any dimming hook either.
  expect(await countInLightDom(page, '.umm-viewed')).toBe(0);
  expect(await countInLightDom(page, '[data-avid]')).toBe(0);

  // 3. Original index content hidden but preserved (DOM retained for the
  //    site's own SPA behaviour), and nothing was written to the watched set.
  expect(await lightDomDisplay(page, 'ct')).toBe('none');
  for (const store of ADULT_STORES) {
    const keys = await readAllKeys(extPage, store);
    expect(keys).toEqual(store === JAV_IDS_STORE ? ['sehuatang::SSIS-123'] : []);
  }

  // 4. Styles stayed inside the shadow root (scope:check in real life).
  const audit = await auditInjectedStyles(page);
  expect(audit.leaks).toEqual([]);
  expect(audit.overlaySelectorsInLightDom).toEqual([]);
});
