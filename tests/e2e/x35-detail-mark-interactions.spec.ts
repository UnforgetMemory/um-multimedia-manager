/**
 * X27-C — the marking dialog's real click surface (douban detail overlay).
 *
 * `detail-record-roundtrip.spec.ts` covers the golden path only (已看 + 评分 → 保存
 * → 落库 → 免重载回显). The bar itself exposes 13 click/keyboard handlers; the
 * branches that had never been driven in a real browser are exactly where the
 * regressions hide: the wish tab (which must NOT offer a rating row), the tag
 * chips and the Enter-to-add path, the comment counter, and the three dismissal
 * routes that must leave the store untouched.
 *
 * Every case asserts against the background-owned IndexedDB through the service
 * worker (DB_GET) rather than a UI echo, so "the dialog closed" can never be
 * mistaken for "nothing was written".
 */

import {
  DOUBAN_STORE,
  expect,
  installDoubanMocks,
  sendRuntimeMessage,
  test,
} from './fixtures/extension-harness';
import { doubanMovieDetailHtml, movieDetailUrl } from './fixtures/movie-detail-page';

const MASK = '#umm-detail-mask';
const MARK_BTN = `${MASK} .umm-mark-btn`;
const PANEL = `${MASK} .umm-dialog-panel`;
const ACTIVE_PICK = `${MASK} .umm-dialog-pick--active`;

/**
 * 选项按钮以 `data-umm-pick` 定位，不再按中文文案 `:has-text()`——文案现在经
 * content i18n 解析，语言取决于 harness（navigator.language=en-US）。
 * 需要断言「回显」时先读出该语言下的实际文本，再比对同一串：钉住的是
 * 对话框选项 ↔ 条上按钮/激活态 的配对，而非某种语言。
 */
type PickTab = 'wish' | 'do' | 'collect';
const pick = (tab: PickTab): string => `${MASK} .umm-dialog-pick[data-umm-pick="${tab}"]`;

async function pickLabel(
  page: import('@playwright/test').Page,
  tab: PickTab,
  { click }: { click: boolean },
): Promise<string> {
  const target = page.locator(pick(tab));
  const text = (await target.innerText()).trim();
  expect(text, `选项 ${tab} 在该语言下没有可见文案`).not.toBe('');
  if (click) await target.click();
  return text;
}

/** Distinct subject per case: the SW-owned store is shared across the suite. */
let subjectSeq = 0;

async function openDetail(
  extContext: import('@playwright/test').BrowserContext,
): Promise<{ page: import('@playwright/test').Page; key: string }> {
  const subjectId = `29${String(100000 + subjectSeq++).padStart(6, '0')}`;
  await installDoubanMocks(extContext, {
    movieDetailHtml: doubanMovieDetailHtml({ subjectId, title: `E2E 标记交互 ${subjectId}` }),
  });
  const page = await extContext.newPage();
  await page.goto(movieDetailUrl(subjectId), { waitUntil: 'domcontentloaded' });
  await expect(page.locator(MARK_BTN)).toBeVisible({ timeout: 60_000 });
  return { page, key: `movie::${subjectId}` };
}

async function readRecord(
  extPage: import('@playwright/test').Page,
  key: string,
): Promise<{ status?: number; rating?: number; comment?: string } | null> {
  const res = await sendRuntimeMessage(extPage, 'DB_GET', {
    storeName: DOUBAN_STORE,
    key,
  });
  return (res.record ?? null) as { status?: number; rating?: number; comment?: string } | null;
}

test('想看 tab：不提供评分行，保存后 status=1 且 rating=0', async ({ extContext, extPage }) => {
  const { page, key } = await openDetail(extContext);

  await page.locator(MARK_BTN).click();
  await expect(page.locator(PANEL)).toBeVisible();
  const wishLabel = await pickLabel(page, 'wish', { click: true });

  // The rating row is conditional on collect/do; claiming a star here would be a
  // contract change, so its absence is the assertion.
  await expect(page.locator(`${MASK} .umm-dialog-stars`)).toHaveCount(0);
  await page.locator(`${MASK} .umm-dialog-save`).click();

  await expect(page.locator(MARK_BTN)).toContainText(wishLabel, { timeout: 15_000 });
  await expect(page.locator(`${MASK} .umm-mark-score-num`)).toHaveCount(0);
  await expect
    .poll(() => readRecord(extPage, key), { timeout: 15_000 })
    .toMatchObject({
      status: 1,
    });
});

test('评论：字数计数随输入变化，保存后落库并在重开时回显', async ({ extContext, extPage }) => {
  const { page, key } = await openDetail(extContext);
  const comment = 'E2E 评论 123';

  await page.locator(MARK_BTN).click();
  const collectLabel = await pickLabel(page, 'collect', { click: true });
  const area = page.locator(`${MASK} .umm-dialog-textarea`);
  await expect(page.locator(`${MASK} .umm-dialog-charcount`)).toHaveText('0/350');
  await area.fill(comment);
  await expect(page.locator(`${MASK} .umm-dialog-charcount`)).toHaveText(`${comment.length}/350`);
  await page.locator(`${MASK} .umm-dialog-save`).click();

  await expect
    .poll(() => readRecord(extPage, key), { timeout: 15_000 })
    .toMatchObject({
      status: 2,
      comment,
    });

  await page.locator(MARK_BTN).click();
  await expect(page.locator(`${MASK} .umm-dialog-textarea`)).toHaveValue(comment);
  // Re-opening pre-selects the stored tab: the pick row shows it as active.
  await expect(page.locator(ACTIVE_PICK)).toHaveText(collectLabel);
});

test('标签：Enter 添加进已选列表、✕ 可移除，取消不写库', async ({ extContext, extPage }) => {
  const { page, key } = await openDetail(extContext);

  await page.locator(MARK_BTN).click();
  const input = page.locator(`${MASK} .umm-tag-add .umm-dialog-input`);
  await input.fill('诺兰');
  await input.press('Enter');

  const selected = page.locator(`${MASK} .umm-tag-selected`);
  await expect(selected).toHaveCount(1);
  await expect(selected).toContainText('诺兰');
  // The add field commits on Enter and clears itself, so the button is inert again.
  await expect(input).toHaveValue('');
  await expect(page.locator(`${MASK} .umm-tag-add-btn`)).toBeDisabled();

  await page.locator(`${MASK} .umm-tag-remove`).click();
  await expect(selected).toHaveCount(0);

  await page.locator(`${MASK} .umm-dialog-cancel`).click();
  await expect(page.locator(PANEL)).toHaveCount(0);
  expect(await readRecord(extPage, key)).toBeNull();
});

test('保存过的标签在重开时仍是已选态（提交结果回写 interest 状态）', async ({
  extContext,
  extPage,
}) => {
  const { page, key } = await openDetail(extContext);

  await page.locator(MARK_BTN).click();
  const collectLabel = await pickLabel(page, 'collect', { click: true });
  const input = page.locator(`${MASK} .umm-tag-add .umm-dialog-input`);
  await input.fill('重看');
  await page.locator(`${MASK} .umm-tag-add-btn`).click();
  await page.locator(`${MASK} .umm-dialog-save`).click();

  await expect(page.locator(MARK_BTN)).toContainText(collectLabel, { timeout: 15_000 });
  await expect
    .poll(() => readRecord(extPage, key), { timeout: 15_000 })
    .toMatchObject({
      status: 2,
    });

  await page.locator(MARK_BTN).click();
  await expect(page.locator(`${MASK} .umm-tag-selected`)).toContainText('重看');
});

test('三条关闭路径（取消 / 遮罩 / Escape）都不写库，且 Escape 后焦点归还标按钮', async ({
  extContext,
  extPage,
}) => {
  const { page, key } = await openDetail(extContext);

  await page.locator(MARK_BTN).click();
  await page.locator(pick('collect')).click();
  await page.locator(`${MASK} .umm-dialog-cancel`).click();
  await expect(page.locator(PANEL)).toHaveCount(0);

  await page.locator(MARK_BTN).click();
  await page.locator(`${MASK} .umm-dialog-overlay`).click({ position: { x: 4, y: 4 } });
  await expect(page.locator(PANEL)).toHaveCount(0);

  await page.locator(MARK_BTN).click();
  await expect(page.locator(PANEL)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator(PANEL)).toHaveCount(0);

  // Focus return is the a11y half of the Escape contract.
  const focused = await page.evaluate(() => {
    const host = document.querySelector('#umm-detail-mask');
    const shadow = host?.shadowRoot ?? null;
    const active = (shadow ? shadow.activeElement : document.activeElement) as HTMLElement | null;
    return active?.className ?? 'none';
  });
  expect(focused).toContain('umm-mark-btn');

  expect(await readRecord(extPage, key)).toBeNull();
});

test('已看 + 4 星：保存后条上显示 8/10，重开时星数与 tab 均回显', async ({
  extContext,
  extPage,
}) => {
  const { page, key } = await openDetail(extContext);

  await page.locator(MARK_BTN).click();
  const collectLabel = await pickLabel(page, 'collect', { click: true });
  const stars = page.locator(`${MASK} .umm-dialog-stars .umm-star`);
  await expect(stars).toHaveCount(5);
  await stars.nth(3).click();
  await expect(page.locator(`${MASK} .umm-star--filled`)).toHaveCount(4);
  await page.locator(`${MASK} .umm-dialog-save`).click();

  await expect(page.locator(`${MASK} .umm-mark-score-num`)).toHaveText('8', { timeout: 15_000 });
  await expect
    .poll(() => readRecord(extPage, key), { timeout: 15_000 })
    .toMatchObject({
      status: 2,
      rating: 8,
    });

  await page.locator(MARK_BTN).click();
  await expect(page.locator(`${MASK} .umm-star--filled`)).toHaveCount(4);
  await expect(page.locator(ACTIVE_PICK)).toHaveText(collectLabel);
});
