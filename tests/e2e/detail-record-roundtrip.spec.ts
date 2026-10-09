/**
 * X9-C #2 — record interaction round trip on the mocked douban detail page.
 *
 * Real chain exercised per click:
 *   UmmInterestBar dialog → useInterest.submitInterest (POST /j/... mocked)
 *   → handleInterestSave → onCrossPlatformSave → Store.dbSyncPageRecord
 *   → chrome.runtime message → background handler → IndexedDB (SW-owned)
 *   → broadcast('record:updated') → useRecordRefresh re-read via DB_GET.
 *
 * Assertions: overlay reflects the new status WITHOUT page reload (interest
 * bar text/class/score) + background IndexedDB really contains the record
 * (DB_GET answered by the SW) + the popup dashboard renders the fresh count
 * (cross-process read of the same store).
 */

import {
  DOUBAN_STORE,
  expect,
  installDoubanMocks,
  sendRuntimeMessage,
  test,
} from './fixtures/extension-harness';
import { doubanMovieDetailHtml, movieDetailUrl } from './fixtures/movie-detail-page';

const SUBJECT_ID = '26433417';
const TITLE = 'E2E 往返影片';
const RECORD_KEY = `movie::${SUBJECT_ID}`;

test('marking 已看 persists through the background and updates the overlay without reload', async ({
  extContext,
  extPage,
}) => {
  await installDoubanMocks(extContext, {
    movieDetailHtml: doubanMovieDetailHtml({ subjectId: SUBJECT_ID, title: TITLE }),
  });

  const page = await extContext.newPage();
  await page.goto(movieDetailUrl(SUBJECT_ID), { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#umm-detail-mask .umm-mark-btn')).toBeVisible({ timeout: 60_000 });

  // Open the marking dialog and pick the collect tab, rate 4 stars.
  // 选项按 data-umm-pick 定位（文案已 i18n 化，语言取决于存储）；回显断言比对
  // 「该语言下选项按钮自己的文本」，钉的是对话框选项 ↔ 条上按钮的配对。
  const collect = page.locator('#umm-detail-mask .umm-dialog-pick[data-umm-pick="collect"]');
  await page.locator('#umm-detail-mask .umm-mark-btn').click();
  await expect(page.locator('#umm-detail-mask .umm-dialog-panel')).toBeVisible();
  const collectLabel = (await collect.innerText()).trim();
  expect(collectLabel, 'collect 选项在该语言下没有可见文案').not.toBe('');
  await collect.click();
  await page.locator('#umm-detail-mask .umm-dialog-stars .umm-star').nth(3).click();

  // Save → mocked POST succeeds → optimistic + broadcast-driven UI update.
  await page.locator('#umm-detail-mask .umm-dialog-save').click();

  // The mark button now shows the collect label without any reload.
  await expect(page.locator('#umm-detail-mask .umm-mark-btn')).toContainText(collectLabel, {
    timeout: 15_000,
  });
  await expect(page.locator('#umm-detail-mask .umm-mark-btn--active')).toBeVisible();
  await expect(page.locator('#umm-detail-mask .umm-mark-score-num')).toHaveText('8');

  // Background really persisted the record (answer comes from the MV3 SW).
  await expect
    .poll(
      async () => {
        const res = await sendRuntimeMessage(extPage, 'DB_GET', {
          storeName: DOUBAN_STORE,
          key: RECORD_KEY,
        });
        return res.record?.status ?? -1;
      },
      { timeout: 30_000 },
    )
    .toBe(2);
  const fetched = await sendRuntimeMessage(extPage, 'DB_GET', {
    storeName: DOUBAN_STORE,
    key: RECORD_KEY,
  });
  expect(fetched.record?.rating).toBe(8);

  // Cross-process proof: popup dashboard (separate UI process reading the
  // SW-owned IndexedDB via messaging) shows 1 movie after a fresh load.
  await extPage.reload({ waitUntil: 'domcontentloaded' });
  const statValues = extPage.locator('[class*="tabular-nums"]');
  await expect
    .poll(
      async () => {
        const texts = await statValues.allInnerTexts();
        return texts.length >= 8 && texts.slice(0, 8).every((t) => /^\d+$/.test(t.trim()));
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  await expect(statValues.first()).toHaveText('1');
});
