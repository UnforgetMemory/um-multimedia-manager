/**
 * X82 — GAP 1: the interest bar on **game-detail** (0 of 13 hooks had ever been
 * driven in a browser; the same shared component is driven on `detail` by X35).
 *
 * Game marking is NOT the movie path re-labelled:
 *  - the record key is `game::<id>` (`doubanRecordType`, subject-keys.ts:62) and
 *    the id comes from `/game/{id}/`, so a wiring slip writes a `movie::`/`tv::`
 *    orphan the page itself can never read back;
 *  - the dialog's 在看 pick is hard-wired on (`:hasDo="true"`,
 *    pages/game-detail/App.vue:145) instead of parsed out of the interest API;
 *  - the comment the dialog re-opens with can only come from the shared
 *    `handleInterestSave` write-back (`shared/detail-ui.ts:165-166`) — X35 found
 *    the bug on `detail`; this spec pins that game-detail reaches the SAME fix.
 *
 * Every dismissal case is decided against the background-owned IndexedDB
 * (DB_GET / DB_GET_ALL through the service worker), never against the UI echo,
 * so "the dialog closed" can never be mistaken for "nothing was written".
 *
 * Status is asserted through classes (`umm-mark-btn--active`,
 * `umm-dialog-pick--active`, `umm-star--filled`) and pick ROW POSITION — the
 * overlay's locale wiring is in flux, so no Chinese literal is pinned here.
 */

import type { BrowserContext, Page } from '@playwright/test';
import { DOUBAN_STORE, expect, sendRuntimeMessage, test } from './fixtures/extension-harness';
import { openDoubanFixturePage } from './fixtures/douban-crawl-fixtures';
import { readAllKeys, waitForBackgroundReady } from './fixtures/host-mocks';

const OVERLAY = '#umm-douban-overlay';
const MARK_BTN = `${OVERLAY} .umm-mark-btn`;
const MARK_ACTIVE = `${OVERLAY} .umm-mark-btn--active`;
const PANEL = `${OVERLAY} .umm-dialog-panel`;
const PICK = `${OVERLAY} .umm-dialog-pick`;
const PICK_ACTIVE = `${OVERLAY} .umm-dialog-pick--active`;
const STAR = `${OVERLAY} .umm-dialog-stars .umm-star`;
const STAR_FILLED = `${OVERLAY} .umm-star--filled`;
const STAR_ROW = `${OVERLAY} .umm-dialog-stars`;
const SAVE_BTN = `${OVERLAY} .umm-dialog-save`;
const CANCEL_BTN = `${OVERLAY} .umm-dialog-cancel`;
const MASK_LAYER = `${OVERLAY} .umm-dialog-overlay`;
const TAG_INPUT = `${OVERLAY} .umm-tag-add .umm-dialog-input`;
const TAG_ADD_BTN = `${OVERLAY} .umm-tag-add-btn`;
const TAG_SELECTED = `${OVERLAY} .umm-tag-selected`;
const TAG_REMOVE = `${OVERLAY} .umm-tag-remove`;
const TEXTAREA = `${OVERLAY} .umm-dialog-textarea`;
const SCORE = `${OVERLAY} .umm-mark-score-num`;

/** Pick row order as built by `umm-interest-bar.ts:188-231` (hasDo wired on). */
const PICK_WISH = 0;
const PICK_COLLECT = 2;

/** The crawled page's own collection state (fixture bytes, not the extractor). */
const FIXTURE_COMMENT = '开放世界设计教科书，值得全收集。';

interface DbRecord {
  status?: number;
  rating?: number;
  comment?: string;
  url?: string;
  linkedIds?: Record<string, string>;
}

let subjectSeq = 0;

/**
 * Open the crawled game-detail fixture under a fresh `/game/{id}/` subject.
 *
 * Douban's mark POST is CSRF-gated on a `ck` token (`use-interest.ts:269`),
 * which an anonymous crawl cannot carry — so the token is supplied as the real
 * logged-in page would: a `ck` cookie on `.douban.com`. The served HTML stays
 * the fixture's bytes.
 */
async function openGameDetail(
  ctx: BrowserContext,
): Promise<{ page: Page; key: string; url: string }> {
  const gameId = `35${String(317744 + subjectSeq++).padStart(6, '0')}`;
  await ctx.addCookies([{ name: 'ck', value: 'e2e-ck-token', domain: '.douban.com', path: '/' }]);
  const url = `https://www.douban.com/game/${gameId}/`;
  const page = await openDoubanFixturePage(
    ctx,
    { host: 'www.douban.com', match: /^\/game\/\d+\/$/, fixture: 'game-detail' },
    url,
  );
  await expect(page.locator(MARK_BTN)).toBeVisible({ timeout: 60_000 });
  return { page, key: `game::${gameId}`, url };
}

/**
 * Read one record through the service worker.
 *
 * `expect.poll(() => page.evaluate(...))` is documented unreliable in this
 * suite, so the wait is a `waitForFunction` whose JSHandle carries the record
 * itself — one round trip, no polling wrapper.
 */
async function readRecord(extPage: Page, key: string): Promise<DbRecord | null> {
  const res = await sendRuntimeMessage(extPage, 'DB_GET', { storeName: DOUBAN_STORE, key });
  return (res.record ?? null) as DbRecord | null;
}

/**
 * Wait for the row by re-reading it from the Node side.
 *
 * Neither Playwright polling wrapper survives measurement here: `expect.poll`
 * around `page.evaluate` is documented unreliable in this suite, and
 * `page.waitForFunction` with a promise-returning predicate resolved on the very
 * first poll with a null handle (measured: 2 of 5 runs). A bounded loop of real
 * DB_GET round trips has no polling semantics to get wrong — and every write path
 * in the background invalidates the `get:`/`all:` scheduler entries, so a stale
 * cache cannot make this read lie.
 */
async function waitForRecord(extPage: Page, key: string, timeoutMs = 20_000): Promise<DbRecord> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const record = await readRecord(extPage, key);
    if (record) return record;
    if (Date.now() > deadline) {
      throw new Error(`[x82] no ${key} row in the douban store within ${timeoutMs}ms`);
    }
    await new Promise((r) => setTimeout(r, 200));
  }
}

/** Row index of the highlighted pick — locale-free tab assertion (see PICK_*). */
async function activePickIndex(page: Page): Promise<number> {
  return page.evaluate(() => {
    const shadow = document.querySelector('#umm-douban-overlay')?.shadowRoot ?? null;
    if (!shadow) return -1;
    const picks = Array.from(shadow.querySelectorAll<HTMLElement>('.umm-dialog-pick'));
    return picks.findIndex((p) => p.classList.contains('umm-dialog-pick--active'));
  });
}

/** The overlay's own activeElement class (focus contract lives in the shadow root). */
async function overlayFocusClass(page: Page): Promise<string> {
  return page.evaluate(() => {
    const shadow = document.querySelector('#umm-douban-overlay')?.shadowRoot ?? null;
    const active = (shadow ?? document).activeElement as HTMLElement | null;
    return active?.className ?? 'none';
  });
}

test('想看 tab：不提供评分行；保存写入 status=1 且 rating=0（键为 game::）', async ({
  extContext,
  extPage,
}) => {
  await waitForBackgroundReady(extPage, DOUBAN_STORE);
  const { page, key } = await openGameDetail(extContext);

  await page.locator(MARK_BTN).click();
  await expect(page.locator(PANEL)).toBeVisible();
  // game-detail pins hasDo on, so the row is wish / 在玩 / 玩过 (3 picks).
  await expect(page.locator(PICK)).toHaveCount(3);
  await page.locator(PICK).nth(PICK_WISH).click();
  await expect(page.locator(PICK).nth(PICK_WISH)).toHaveClass(/umm-dialog-pick--active/);

  // The rating row is conditional on collect/do (umm-interest-bar.ts:233):
  // claiming a star through 想看 would be a contract change, so absence is the claim.
  await expect(page.locator(STAR_ROW)).toHaveCount(0);

  await page.locator(SAVE_BTN).click();
  await expect(page.locator(PANEL)).toHaveCount(0);

  // waitForRecord already fails loudly if the row never lands.
  const record = await waitForRecord(extPage, key);
  expect(record.status).toBe(1);
  expect(record.rating, 'a wish carries no rating').toBe(0);
  // The bar repaints from the same state: active marker, no /10 score chip.
  await expect(page.locator(MARK_ACTIVE)).toHaveCount(1);
  await expect(page.locator(SCORE)).toHaveCount(0);
});

test('玩过 + 4 星 + 短评 + 标签：落库键只可能是 game::，重开回显状态/星数/短评/标签', async ({
  extContext,
  extPage,
}) => {
  await waitForBackgroundReady(extPage, DOUBAN_STORE);
  const { page, key, url } = await openGameDetail(extContext);
  const comment = 'E2E 玩过短评';
  const tag = 'E2E标签';

  await page.locator(MARK_BTN).click();
  await page.locator(PICK).nth(PICK_COLLECT).click();
  await expect(page.locator(STAR)).toHaveCount(5);
  await page.locator(STAR).nth(3).click();
  await expect(page.locator(STAR_FILLED)).toHaveCount(4);
  await page.locator(TEXTAREA).fill(comment);
  await page.locator(TAG_INPUT).fill(tag);
  await page.locator(TAG_ADD_BTN).click();
  await expect(page.locator(TAG_SELECTED)).toHaveCount(1);
  await page.locator(SAVE_BTN).click();

  // 4 stars → the douban 10-point scale the store keeps.
  await expect(page.locator(SCORE)).toHaveText('8', { timeout: 20_000 });
  const record = await waitForRecord(extPage, key);
  expect(record.status).toBe(2);
  expect(record.rating).toBe(8);
  expect(record.comment, 'X35 write-back: the note must reach the store').toBe(comment);
  expect(record.url, 'the record url is the page the mark happened on').toBe(url);

  // Key-prefix contract: a `movie::`/`tv::` row would be an orphan this page
  // can never read back, so the whole store is inspected, not just the key.
  const keys = await readAllKeys(extPage, DOUBAN_STORE);
  expect(keys.filter((k) => k.endsWith(`::${key.split('::')[1]}`))).toEqual([key]);

  // ── Re-open: every field must echo what was saved ──
  await page.locator(MARK_BTN).click();
  await expect(page.locator(PANEL)).toBeVisible();
  await expect(page.locator(PICK_ACTIVE)).toHaveCount(1);
  expect(await activePickIndex(page)).toBe(PICK_COLLECT);
  await expect(page.locator(STAR_FILLED)).toHaveCount(4);
  await expect(page.locator(TEXTAREA)).toHaveValue(comment);
  await expect(page.locator(TAG_SELECTED)).toHaveCount(1);
  await expect(page.locator(TAG_SELECTED)).toContainText(tag);
  // Pre-existing comment is gone, not appended to: the dialog shows the saved note.
  expect(await page.locator(TEXTAREA).inputValue()).not.toContain(FIXTURE_COMMENT);
});

test('取消 / 遮罩 / Escape 三条关闭路径都不写库，Escape 后焦点归还标按钮', async ({
  extContext,
  extPage,
}) => {
  await waitForBackgroundReady(extPage, DOUBAN_STORE);
  const { page, key } = await openGameDetail(extContext);
  // The fixture's crawled collection state pre-fills the form, so each dismissal
  // drops a *dirty* dialog: a leak here is a real write, not a no-op.
  await expect(page.locator(MARK_ACTIVE)).toHaveCount(1);

  await page.locator(MARK_BTN).click();
  await page.locator(TEXTAREA).fill('E2E 取消路径');
  await page.locator(STAR).nth(4).click();
  await page.locator(CANCEL_BTN).click();
  await expect(page.locator(PANEL)).toHaveCount(0);

  await page.locator(MARK_BTN).click();
  await page.locator(TEXTAREA).fill('E2E 遮罩路径');
  await page.locator(MASK_LAYER).click({ position: { x: 4, y: 4 } });
  await expect(page.locator(PANEL)).toHaveCount(0);

  await page.locator(MARK_BTN).click();
  await expect(page.locator(PANEL)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator(PANEL)).toHaveCount(0);
  expect(await overlayFocusClass(page)).toContain('umm-mark-btn');

  // Settle, then decide against the store: no record for this subject at all.
  await page.waitForTimeout(2_000);
  expect(await readRecord(extPage, key)).toBeNull();
  const keys = await readAllKeys(extPage, DOUBAN_STORE);
  expect(keys, 'no dismissal path may create a row').not.toContain(key);
  // …and no optimistic repaint either: the bar still reports the fixture state.
  await expect(page.locator(MARK_ACTIVE)).toHaveCount(1);
  await expect(page.locator(SCORE)).toHaveCount(0);
});

test('标签：Enter 提交进已选列表并清空输入，✕ 移除且不写库', async ({ extContext, extPage }) => {
  await waitForBackgroundReady(extPage, DOUBAN_STORE);
  const { page, key } = await openGameDetail(extContext);

  await page.locator(MARK_BTN).click();
  const input = page.locator(TAG_INPUT);
  await input.fill('E2E Enter 标签');
  await input.press('Enter');

  const selected = page.locator(TAG_SELECTED);
  await expect(selected).toHaveCount(1);
  await expect(selected).toContainText('E2E Enter 标签');
  // Enter commits and clears, which parks the add button on its disabled guard.
  await expect(input).toHaveValue('');
  await expect(page.locator(TAG_ADD_BTN)).toBeDisabled();

  await page.locator(TAG_REMOVE).click();
  await expect(selected).toHaveCount(0);

  await page.locator(CANCEL_BTN).click();
  await expect(page.locator(PANEL)).toHaveCount(0);
  await page.waitForTimeout(2_000);
  expect(await readRecord(extPage, key)).toBeNull();
});
