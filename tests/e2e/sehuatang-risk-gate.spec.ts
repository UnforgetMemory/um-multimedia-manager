/**
 * X14 #2 — the Sehuatang risk gate (age gate) outranks URL classification in
 * a real browser: zero browser coverage existed for the highest-priority
 * branch of sehuatang-main.content.
 *
 * Setup that makes the assertion non-trivial: the mocked response is served on
 * a LIST-SHAPED url (`/forum-9-1.html`) and its body embeds a complete
 * forumdisplay table (#threadlisttableid + #thread_types + rows) plus the risk
 * double markers (div.domain + a.enter-btn[href]). So:
 *   - the document_start entry classifies it as forumdisplay and builds the
 *     shadow shell (both branches would fit), and
 *   - app.ts's DOM guard would PASS (the table is really there),
 * yet the DOM-marker risk check must win first: the risk panel renders and the
 * list app never runs — observable as (a) no `.umm-preview-grid`/`.umm-card`
 * in the shadow root and (b) `#threadlisttableid` still VISIBLE (runSehuatang-
 * OverlayApp sets display:none on it; the risk branch never touches it).
 *
 * Also proven: the rebuilt buttons delegate their click to the ORIGINAL host
 * anchors in document order (site JS binds "write safeid cookie + reload" to
 * those elements — cloning or self-built navigation would break the gate).
 */

import { expect, test } from './fixtures/extension-harness';
import {
  JAV_IDS_STORE,
  installSehuatangMocks,
  seedAdultRecord,
  waitForBackgroundReady,
} from './fixtures/host-mocks';
import { auditInjectedStyles, lightDomDisplay, probeOverlay } from './fixtures/overlay-probe';
import { sehuatangRiskHtml } from './fixtures/sehuatang-page';

const FORUMDISPLAY_URL = 'https://www.sehuatang.net/forum-9-1.html';
const OVERLAY_ID = 'umm-sht-overlay';

test('risk markers on a list-shaped url render the risk panel instead of the list overlay and delegate enters in document order', async ({
  extContext,
  extPage,
}) => {
  await installSehuatangMocks(extContext, {
    riskHtml: sehuatangRiskHtml({ withListShell: true }),
  });
  // A watched row exists in the embedded table: if the list app ran at all,
  // it would produce cards/dim marks.
  const seeded = await seedAdultRecord(extPage, JAV_IDS_STORE, 'sehuatang::SSIS-123', '/');
  expect(seeded.success).toBe(true);
  await waitForBackgroundReady(extPage);

  const page = await extContext.newPage();
  await page.goto(FORUMDISPLAY_URL, { waitUntil: 'domcontentloaded' });

  // Early shell built (document_start) and handed over (shadow style injected).
  await expect
    .poll(async () => (await probeOverlay(page, OVERLAY_ID)).shadowStylePresent, {
      timeout: 60_000,
    })
    .toBe(true);

  const probe = await probeOverlay(page, OVERLAY_ID);
  // 1. Risk panel content is a faithful rebuild of the site text.
  expect(probe.risk.panelPresent).toBe(true);
  expect(probe.risk.domain).toBe('SEHUATANG.NET');
  expect(probe.risk.enterLabels).toEqual([
    '满18岁，请点此进入',
    'If you are over 18，please click here',
  ]);
  expect(probe.risk.enterPrimaryLabel).toBe('满18岁，请点此进入');
  expect(probe.risk.warningTitle).toBe('警告 / WARNING');
  expect(probe.risk.warnings).toHaveLength(2);
  expect(probe.loadingPresent).toBe(false);

  // 2. The list branch did NOT run: no grid, no cards, and the original
  //    thread table is still on screen (app.ts would have hidden it).
  expect(probe.gridPresent).toBe(false);
  expect(probe.cards).toHaveLength(0);
  expect(await lightDomDisplay(page, 'threadlisttableid')).not.toBe('none');

  // 3. Enter clicks delegate to the two original host anchors, in document order.
  const primary = page.locator(`#${OVERLAY_ID} .umm-sht-risk-enter--primary`);
  await expect(primary).toHaveCount(1, { timeout: 30_000 });
  await primary.click();
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { __ummEnterClicks: number }).__ummEnterClicks),
    )
    .toBe(1);
  await page.locator(`#${OVERLAY_ID} .umm-sht-risk-enter--secondary`).click();
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { __ummEnterClicks: number }).__ummEnterClicks),
    )
    .toBe(2);

  // 4. Risk rebuild stays inside the shadow root (no host-page style leakage).
  const audit = await auditInjectedStyles(page);
  expect(audit.leaks).toEqual([]);
  expect(audit.overlaySelectorsInLightDom).toEqual([]);
});
