/**
 * X9-C #3 — background broadcast → live UI refresh (no reload).
 *
 * On the mocked book.douban.com homepage the overlay mounts with 未读 status
 * badges. An EXTERNAL write (DB_PUT sent from the popup's extension page —
 * a different browsing context) lands in the SW-owned IndexedDB and the
 * background broadcasts EVENT_BUS 'record:updated'. The homepage's
 * useRecordCache subscription (visible-ids targeted bulk re-read) must flip
 * the matching card badge to 想读 in the real shadow-DOM UI without any
 * navigation. This is the ADR-015 live-refresh path proven end-to-end.
 */

import {
  DOUBAN_STORE,
  expect,
  installDoubanMocks,
  makeStoreRecord,
  sendRuntimeMessage,
  setStoredLanguage,
  test,
} from './fixtures/extension-harness';
import { doubanBookHomepageHtml, E2E_BOOKS } from './fixtures/book-homepage-page';

const TARGET_BOOK = E2E_BOOKS[0]!;
const RECORD_KEY = `book::${TARGET_BOOK.subjectId}`;

test('external DB write flips the homepage card badge live (record:updated path)', async ({
  extContext,
  extPage,
}) => {
  await installDoubanMocks(extContext, { bookHomeHtml: doubanBookHomepageHtml() });
  // 钉住 zh-CN：徽章文案现在经 t() 解析，harness 浏览器报 en-US——不钉语言的话
  // 「想读」这条断言测的是宿主浏览器默认值，而不是文案表本身。
  await setStoredLanguage(extPage, 'zh-CN');
  const page = await extContext.newPage();
  await page.goto('https://book.douban.com/', { waitUntil: 'domcontentloaded' });

  // Overlay mounted with both mocked books and neutral (未读) badges.
  const badges = page.locator('#umm-douban-overlay .umm-status');
  await expect(badges).toHaveCount(2, { timeout: 60_000 });
  await expect(page.locator('#umm-douban-overlay .umm-status--wish')).toHaveCount(0);

  // Identity probe: stamp the affected row BEFORE the write. Vue patches a keyed
  // list in place; if the row's `:key` derives from the record state it is
  // re-created instead, and a re-created node loses this attribute. That is the
  // difference between "badge updated" and "subtree remounted to fake a
  // refresh" — the remount also re-decodes the lazy cover image.
  // Targeted at the row the write actually concerns (this fixture mocks two
  // rec-items; the ranking grid is a different section and is not rendered here).
  const targetRow = page
    .locator('#umm-douban-overlay .umm-rec-item')
    .filter({ has: page.locator('.umm-rec-title', { hasText: TARGET_BOOK.title }) });
  await expect(targetRow).toHaveCount(1);
  await targetRow.first().evaluate((el) => {
    el.setAttribute('data-umm-identity', '1');
  });
  const marked = page.locator('#umm-douban-overlay .umm-rec-item[data-umm-identity]');
  await expect(marked).toHaveCount(1);

  // External context writes a 想看 record straight through the background.
  const res = await sendRuntimeMessage(extPage, 'DB_PUT', {
    storeName: DOUBAN_STORE,
    key: RECORD_KEY,
    record: makeStoreRecord(`https://book.douban.com/subject/${TARGET_BOOK.subjectId}/`, 1, 0),
  });
  expect(res.success).toBe(true);

  // Broadcast → useRecordCache re-read → badge flips live, no reload.
  const wish = page.locator('#umm-douban-overlay .umm-status--wish');
  await expect(wish).toHaveCount(1, { timeout: 30_000 });
  // 文案经 `scenario/douban/shared/status-labels.ts` 的 getter → `t('douban.status.wish_book')`。
  // 只断言 class 证伪不了「键接错」（wish 徽章去取 done_* 键），所以钉住语言后仍断具体串。
  await expect(wish).toHaveText('想读');

  // The row was patched, not re-created.
  await expect(marked).toHaveCount(1);
  await expect(marked.locator('.umm-status--wish')).toHaveCount(1);

  // And it is the right card: 图书甲 (the written subject), not 图书乙.
  const card = page
    .locator('#umm-douban-overlay .umm-rec-item')
    .filter({ has: page.locator('.umm-rec-title', { hasText: TARGET_BOOK.title }) });
  await expect(card.locator('.umm-status--wish')).toHaveCount(1);
});
