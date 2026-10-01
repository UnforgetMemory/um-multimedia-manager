/**
 * X14 #1 — Sehuatang forumdisplay overlay boots end-to-end in a real Chromium
 * with the unpacked MV3 build, on a mocked www.sehuatang.net list page.
 *
 * Proven chain (ADR-024 D1 double-entry injection):
 *   manifest matches (`*://www.sehuatang.net/forum*`) →
 *   sehuatang-early.content (document_start): subscribeTheme paints the
 *   surface + createOverlay builds the `#umm-sht-overlay` shadow host with the
 *   loading skeleton →
 *   sehuatang-main.content (document_idle): classifyPage → 'forumdisplay' →
 *   initEventBus + injectGlobalStyles → runSehuatangOverlayApp: DOM guard on
 *   #threadlisttableid → attachSehuatangOverlay接管 → parseThreadList over the
 *   retained light DOM → buildCard grid → ADULT_AV_CHECK_BATCH (three-table
 *   watched merge, background IndexedDB) → applyWatchedClasses dims the
 *   matches → DetailLoader IntersectionObserver fetches each thread document
 *   and backfills cover + magnet (and writes umm-sehuatang-cache).
 *
 * Assertions that matter:
 *  - the row → card key contract (data-avid = AV id, data-tid = TID fallback)
 *    and the sticky-thread decoy (`stickthread_*`) never becomes a card;
 *  - seeded watched ids across all three adult stores dim (class AND the real
 *    shadow CSS opacity 0.5), the unseeded row stays at 1;
 *  - cover + magnet backfill really happened from the mocked thread page;
 *  - scope:check in real life: every light-DOM sheet the extension injected is
 *    namespaced, and no overlay-internal selector exists outside the shadow.
 */

import { expect, test } from './fixtures/extension-harness';
import {
  JAV_IDS_STORE,
  installSehuatangMocks,
  seedAdultRecord,
  waitForBackgroundReady,
} from './fixtures/host-mocks';
import { auditInjectedStyles, probeOverlay } from './fixtures/overlay-probe';
import {
  SEHUATANG_WATCHED_ROWS,
  sehuatangListHtml,
  sehuatangSeedKey,
  sehuatangThreadDetailHtml,
} from './fixtures/sehuatang-page';

const LIST_URL = 'https://www.sehuatang.net/forum-9-1.html';
const OVERLAY_ID = 'umm-sht-overlay';
const COVER_URL = 'https://www.sehuatang.net/data/attachment/forum/cover-e2e.jpg';
const MAGNET = 'magnet:?xt=urn:btih:E2E000000000000000000000000000000000E2E0';

test('forumdisplay overlay boots, dims every seeded watched row across the three adult stores, and backfills cover + magnet', async ({
  extContext,
  extPage,
}) => {
  await installSehuatangMocks(extContext, {
    listHtml: sehuatangListHtml(),
    threadDetailHtml: sehuatangThreadDetailHtml({ coverUrl: COVER_URL, magnet: MAGNET }),
  });

  // Seed BEFORE navigation: one row per adult store + the TID-key fallback row.
  for (const row of SEHUATANG_WATCHED_ROWS) {
    const store = row.watchStore ?? JAV_IDS_STORE;
    const res = await seedAdultRecord(extPage, store, sehuatangSeedKey(row), LIST_URL);
    expect(res.success).toBe(true);
  }

  // Cold-worker gate (see waitForBackgroundReady): without one completed DB
  // round trip before the tab exists, the mount-time ADULT_AV_CHECK_BATCH races
  // the first IndexedDB open + schema upgrade and the dim never lands.
  await waitForBackgroundReady(extPage);

  const page = await extContext.newPage();
  await page.goto(LIST_URL, { waitUntil: 'domcontentloaded' });

  // 1. Early shell exists and the main entry took it over (skeleton replaced by
  //    the grid + the overlay stylesheet injected into the shadow root).
  await expect
    .poll(async () => (await probeOverlay(page, OVERLAY_ID)).shadowStylePresent, {
      timeout: 60_000,
    })
    .toBe(true);

  // 2. Row parsing + card contract: 5 cards (the stickthread_ decoy is skipped),
  //    keys exactly as sehuatang-extract/card-render define them.
  await expect
    .poll(async () => (await probeOverlay(page, OVERLAY_ID)).cards.length, { timeout: 30_000 })
    .toBe(5);
  const loaded = await probeOverlay(page, OVERLAY_ID);
  expect(
    loaded.cards.map((card) => ({ title: card.title, avid: card.avid, tid: card.tid })),
  ).toEqual([
    { title: 'SSIS-123 日系条目甲', avid: 'SSIS-123', tid: 'TID-1001' },
    { title: 'BigTitsRound.23.06.10 欧美条目乙', avid: 'BIGTITSROUND.23.06.10', tid: 'TID-1002' },
    { title: 'FC2-PPV-44580 混排条目丙', avid: 'FC2-PPV-44580', tid: 'TID-1003' },
    { title: '无番号纯中文条目丁', avid: 'TID-1004', tid: 'TID-1004' },
    { title: 'MIDV-777 未看条目戊', avid: 'MIDV-777', tid: 'TID-1005' },
  ]);

  // 3. Dimming: all four seeded rows carry .umm-viewed (jav_ids / usav_ids /
  //    sehuatang_ids all feed ADULT_AV_CHECK_BATCH); the unseeded row does not.
  //    60s: the batch check is a single mount-time shot whose budget is the
  //    scheduler queue in front of it (measured ~7s on a warm cold worker).
  await expect
    .poll(
      async () => (await probeOverlay(page, OVERLAY_ID)).cards.filter((card) => card.viewed).length,
      { timeout: 60_000 },
    )
    .toBe(SEHUATANG_WATCHED_ROWS.length);
  const dimmed = await probeOverlay(page, OVERLAY_ID);
  expect(dimmed.cards.map((card) => card.viewed)).toEqual([true, true, true, true, false]);
  // The shadow stylesheet really applies (a class alone would prove nothing).
  // Polled because the entrance cascade animates opacity on first paint.
  await expect
    .poll(
      async () => {
        const probe = await probeOverlay(page, OVERLAY_ID);
        const watched = probe.cards.filter((card) => card.viewed);
        return `${watched.every((card) => card.opacity === '0.5')}|${
          probe.cards.find((card) => card.avid === 'MIDV-777')?.opacity
        }`;
      },
      { timeout: 30_000 },
    )
    .toBe('true|1');

  // 4. Lazy detail loader: cards entering the viewport fetched the mocked
  //    thread document and backfilled cover image + magnet anchor.
  await expect
    .poll(
      async () => {
        const probe = await probeOverlay(page, OVERLAY_ID);
        return probe.cards.filter((card) => card.hasMagnet && card.hasCover).length;
      },
      { timeout: 60_000 },
    )
    .toBeGreaterThanOrEqual(1);

  // 5. Control surface rebuilt from the original Discuz chrome: the copy-all
  //    button counter comes straight out of updateHeaderInfo's synchronous DOM
  //    read → exactly one unviewed card remains. (The adjacent page box goes
  //    through the 120ms throttledRefreshStats merge and measurably keeps its
  //    pre-dim text, so it is deliberately not asserted here.)
  const shell = await probeOverlay(page, OVERLAY_ID);
  expect(shell.copyButtonLabel).toMatch(/\(1\)/);

  // 6. The ADR-025 three-table split surfaces in the overlay: the global stats
  //    box is fed by ADULT_AV_STATS over jav_ids / usav_ids / sehuatang_ids
  //    (2 / 1 / 1 for the seeded set) — a real three-store background read of
  //    the records this test wrote. Numbers only; the labels are locale-bound.
  await expect
    .poll(
      async () => {
        const stats = (await probeOverlay(page, OVERLAY_ID)).globalStats ?? '';
        return JSON.stringify(stats.match(/\d+/g) ?? []);
      },
      { timeout: 60_000 },
    )
    .toBe('["2","1","1"]');

  // 7. scope:check in real life — the host document keeps its own sheets and
  //    every UMM light-DOM sheet is namespaced; overlay CSS never escapes.
  const audit = await auditInjectedStyles(page);
  expect(audit.sheetIds.length).toBeGreaterThan(0);
  expect(audit.leaks).toEqual([]);
  expect(audit.overlaySelectorsInLightDom).toEqual([]);
});
