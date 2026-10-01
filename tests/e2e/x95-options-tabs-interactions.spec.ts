/**
 * X95 — the options SPA's own tabs, driven with real clicks.
 *
 * Why these: X83 measured the SPA tabs (Overview / Rating / Appearance / Linked)
 * as "mostly `page.evaluate` injection rather than real clicks", and the only
 * click-heavy options spec so far (X48) covers the sync tab. What that leaves
 * unexercised is exactly what users break: the theme switch that has to reach
 * `documentElement` AND `chrome.storage`, the locale switch that has to re-render
 * every label in the app, and the rating form whose three guards sit in front of
 * a real IndexedDB write.
 *
 * Two rules this spec holds itself to:
 *  - Locators are PROVEN by effect, not trusted by position: the rating input is
 *    found as "the last text input", and the premise is that filling a Douban URL
 *    makes the parse-ok panel appear. A wrong locator fails there instead of
 *    silently testing nothing.
 *  - The write is read back through a DIFFERENT path than the one that wrote it
 *    (save → the form resets → re-query the same key → the stored rating comes
 *    back), so "the toast said saved" is not the evidence.
 *
 * Labels are matched as EN|zh alternations because the SPA locale in the test
 * browser is not pinned (and X95 itself changes it).
 */

import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/extension-harness';

const alt = (...parts: string[]): RegExp =>
  new RegExp(parts.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'));

const optionsUrl = (extensionId: string, tab: string): string =>
  `chrome-extension://${extensionId}/options.html#/${tab}`;

async function gotoTab(page: Page, extensionId: string, tab: string, anchor: RegExp) {
  await page.goto(optionsUrl(extensionId, tab), { waitUntil: 'domcontentloaded' });
  await expect(page.getByText(anchor).first()).toBeVisible({ timeout: 30_000 });
}

/** `umm:appearance` as persisted by the theme store. */
function storedTheme(page: Page): Promise<string | undefined> {
  return page.evaluate(async () => {
    const got = await chrome.storage.local.get('umm:appearance');
    return (got['umm:appearance'] as { theme?: string } | undefined)?.theme;
  });
}

const htmlHas = (page: Page, cls: string): Promise<boolean> =>
  page.evaluate((c) => document.documentElement.classList.contains(c), cls);

const SAVE_BTN = alt('Save Rating', '保存评分', '儲存評分');
// `toast.saved` in all three SPA locales; the rating handler's only success path.
const SAVED_TOAST = alt('Saved', '已保存', '已儲存');
const CANNOT_PARSE = alt(
  'Cannot parse the input ID or URL',
  '无法解析输入的 ID 或 URL',
  '無法解析',
);
const RATING_REQUIRED = alt('Please select a valid rating', '请选择有效的评分', '請選擇有效的評分');
const RATING_SUBJECT = 'https://movie.douban.com/subject/1292052/';

async function openRatingTab(page: Page, extensionId: string): Promise<void> {
  await gotoTab(page, extensionId, 'rating', alt('Rating', '评分', '評分'));
}

/** The rating search field: the last plain text input on the tab (the three
 *  selects before it are not text inputs). Proven by its effect, see callers. */
function searchInput(page: Page) {
  return page.locator('input[type="text"], input:not([type])').last();
}

test.describe('options 页：主题 / 语言 / 评分表单三道守卫与真实写库', () => {
  test('主题：点 Dark/Light 同时改 documentElement 与 chrome.storage', async ({
    extPage,
    extensionId,
  }) => {
    await gotoTab(extPage, extensionId, 'appearance', alt('Theme', '主题', '主題'));

    await extPage
      .getByRole('button', { name: alt('Dark', '深色') })
      .first()
      .click();
    await expect
      .poll(() => htmlHas(extPage, 'dark'), { message: '点 Dark 后 <html> 没有 .dark' })
      .toBe(true);
    expect(await htmlHas(extPage, 'light'), '切到深色后 .light 仍残留').toBe(false);
    expect(await storedTheme(extPage), '主题没有落进 chrome.storage').toBe('dark');

    await extPage
      .getByRole('button', { name: alt('Light', '浅色', '淺色') })
      .first()
      .click();
    await expect
      .poll(() => htmlHas(extPage, 'light'), { message: '点 Light 后 <html> 没有 .light' })
      .toBe(true);
    expect(await storedTheme(extPage), '切回浅色未落盘').toBe('light');
  });

  test('主题 Auto：跟随系统配色，两个方向都验', async ({ extPage, extensionId }) => {
    await gotoTab(extPage, extensionId, 'appearance', alt('Theme', '主题', '主題'));
    // The store DEFAULTS to 'auto', and a watcher on an unchanged value writes
    // nothing — leaving the state first is what makes "Auto landed in storage" an
    // observation instead of a false accusation against correct code.
    await extPage
      .getByRole('button', { name: alt('Light', '浅色', '淺色') })
      .first()
      .click();
    expect(await storedTheme(extPage), '前置失败：切到 Light 未落盘').toBe('light');

    await extPage
      .getByRole('button', { name: alt('System', '跟随系统', '跟隨系統') })
      .first()
      .click();
    expect(await storedTheme(extPage), 'Auto 未写入存储').toBe('auto');

    await extPage.emulateMedia({ colorScheme: 'dark' });
    await expect
      .poll(() => htmlHas(extPage, 'dark'), { message: 'Auto + 系统深色 ⇒ 应为 .dark' })
      .toBe(true);
    await extPage.emulateMedia({ colorScheme: 'light' });
    await expect
      .poll(() => htmlHas(extPage, 'light'), { message: 'Auto + 系统浅色 ⇒ 应为 .light' })
      .toBe(true);
  });

  test('语言：切换后界面文案真的重渲染，且写入存储', async ({ extPage, extensionId }) => {
    await gotoTab(extPage, extensionId, 'appearance', alt('Theme', '主题', '主題'));

    const anchor = () => extPage.getByText(alt('Theme', '主题', '主題')).first();
    const before = (await anchor().innerText()).trim();
    const looksChinese = /[一-龥]/.test(before);

    // Cross families (zh ↔ en): no string is shared between those dictionaries, so
    // "nothing re-rendered" cannot hide behind an identical term.
    const button = extPage
      .getByRole('button', { name: looksChinese ? /English/ : /简体中文/ })
      .first();
    await expect(button, `当前文案 ${JSON.stringify(before)} 下找不到对立语言项`).toBeVisible();
    await button.click();

    const after = (await anchor().innerText()).trim();
    expect(after, '切换语言后锚点文案未变（i18n 未重渲染）').not.toBe(before);
    expect(/[一-龥]/.test(after), '切到 English 后锚点仍是中文').toBe(!looksChinese);

    const keys = await extPage.evaluate(async () => {
      const got = await chrome.storage.local.get('language');
      return Object.keys(got);
    });
    expect(keys, '语言未写入 chrome.storage 的 language 键').toContain('language');
  });

  test('评分守卫一：空输入点保存只出提示，不写库', async ({ extPage, extensionId }) => {
    await openRatingTab(extPage, extensionId);
    await extPage.getByRole('button', { name: SAVE_BTN }).first().click();
    await expect(extPage.getByText(CANNOT_PARSE).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(extPage.getByText(SAVED_TOAST).first()).toHaveCount(0);
  });

  test('评分守卫二：可解析输入但未选星级 ⇒ 只提示评分必填', async ({ extPage, extensionId }) => {
    await openRatingTab(extPage, extensionId);
    await searchInput(extPage).fill(RATING_SUBJECT);
    // Premise: the locator really is the rating search field.
    await expect(extPage.getByText('1292052').first()).toBeVisible({ timeout: 15_000 });

    await extPage.getByRole('button', { name: SAVE_BTN }).first().click();
    await expect(extPage.getByText(RATING_REQUIRED).first()).toBeVisible({ timeout: 10_000 });
    await expect(extPage.getByText(SAVED_TOAST).first()).toHaveCount(0);
  });

  test('评分守卫三：无法解析的输入即使选了星也不写库', async ({ extPage, extensionId }) => {
    await openRatingTab(extPage, extensionId);
    await searchInput(extPage).fill('这不是一个番号或链接');
    await extPage.getByRole('button', { name: /^8$/ }).first().click();
    await extPage.getByRole('button', { name: SAVE_BTN }).first().click();
    await expect(extPage.getByText(CANNOT_PARSE).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(extPage.getByText(SAVED_TOAST).first()).toHaveCount(0);
  });

  test('评分写入：保存后表单清空，重新查询能从库里读回同一评分', async ({
    extPage,
    extensionId,
  }) => {
    await openRatingTab(extPage, extensionId);
    await searchInput(extPage).fill(RATING_SUBJECT);
    await expect(extPage.getByText('1292052').first()).toBeVisible({ timeout: 15_000 });
    await extPage.getByRole('button', { name: /^8$/ }).first().click();
    await extPage.getByRole('button', { name: SAVE_BTN }).first().click();

    await expect(extPage.getByText(SAVED_TOAST).first()).toBeVisible({
      timeout: 15_000,
    });
    // The handler clears the form on success — asserted, because that reset is
    // what makes the read-back below a genuinely separate path.
    await expect(searchInput(extPage)).toHaveValue('');

    await searchInput(extPage).fill(RATING_SUBJECT);
    await expect(extPage.getByText(/8\s*\/\s*10/).first()).toBeVisible({ timeout: 20_000 });
  });

  test('概览页：刷新按钮有可访问名，点击后加载期禁用、结束恢复', async ({
    extPage,
    extensionId,
  }) => {
    await gotoTab(extPage, extensionId, 'overview', alt('Overview', '概览', '概覽'));
    const refresh = extPage
      .getByRole('button', { name: alt('Refresh', '刷新', '重新整理') })
      .first();
    // The accessible name is itself the product fix in this wave: the control was
    // an icon-only button with no name, so it was invisible to assistive tech AND
    // unaddressable by role/name — this locator could not exist before it.
    await expect(refresh, '概览内容区没渲染出带可访问名的刷新按钮').toBeVisible({
      timeout: 30_000,
    });

    // The loading window is milliseconds wide on a local empty DB, so it is
    // observed with an attribute observer installed BEFORE the click rather than
    // polled afterwards (polling after the click measured: never caught it).
    const sawDisabled = await refresh.evaluate(async (el) => {
      const btn = el as HTMLButtonElement;
      let saw = false;
      const mo = new MutationObserver(() => {
        if (btn.disabled) saw = true;
      });
      mo.observe(btn, { attributes: true, attributeFilter: ['disabled'] });
      btn.click();
      await new Promise((r) => setTimeout(r, 400));
      mo.disconnect();
      return saw;
    });
    expect(sawDisabled, '点击刷新后加载期未出现禁用态（可能并发重入）').toBe(true);
    await expect(refresh, '加载结束后刷新按钮未恢复').toBeEnabled({ timeout: 30_000 });
    await expect(
      extPage.getByText(alt('Failed to load', '加载失败', '載入失敗')).first(),
      '刷新后落到错误分支',
    ).toHaveCount(0);
  });
});
