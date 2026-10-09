/**
 * X106 — does a language change reach an ALREADY-OPEN Douban overlay tab?
 *
 * `scenario/douban/main.ts:110-116` asserts it does: the comment there says the
 * pre-wave bug was "Options 页改语言不回填已开标签页", and X103 wired
 * `startLocaleSync()` into that chain as the fix. This file exists because that
 * claim is checkable and had never been checked: `t()` reads a module-level `let`,
 * so an already-mounted Vue tree has no reactive dependency to invalidate — the
 * sync call could be registering a listener that changes a variable nobody re-renders.
 *
 * Probe surface is the dynamic island's nav labels: mounted once per page, rebuilt
 * by nothing, and locale-resolved since X101. Deliberately NOT the marking dialog
 * or the Sehuatang menu — both are rebuilt on every open, so they would pass this
 * test with zero live-refresh code (X103's sehuatang leg has to reopen ☰ for
 * exactly that reason).
 *
 * Two legs, so a failure is attributable:
 *  - live leg: change the stored language, expect the mounted island to follow;
 *  - reload control: same change, then reload — must land in the new language.
 *    Without the control, a red live leg could also mean "storage never reaches
 *    the overlay", which is a different (and already-tested) defect.
 */

import { expect, setStoredLanguage, test } from './fixtures/extension-harness';
import { openDoubanFixturePage, type DoubanFixtureRule } from './fixtures/douban-crawl-fixtures';

const NAV_LABELS = '.umm-island-nav-label';
const MOVIE_URL = 'https://movie.douban.com/subject/1292052/';
const MOVIE_RULE: DoubanFixtureRule = {
  host: 'movie.douban.com',
  match: '/subject/1292052',
  fixture: 'detail-movie',
};

async function navLabels(page: import('@playwright/test').Page): Promise<string[]> {
  return page.locator(NAV_LABELS).allInnerTexts();
}

test.describe('豆瓣 overlay 的语言在线回填', () => {
  test.afterEach(async ({ extPage }) => {
    await setStoredLanguage(extPage, null);
  });

  test('改存储语言：已挂载的导航岛跟着换（不是等下一次导航）', async ({ extContext, extPage }) => {
    await setStoredLanguage(extPage, 'en-US');
    const page = await openDoubanFixturePage(extContext, MOVIE_RULE, MOVIE_URL);
    await expect(page.locator(NAV_LABELS)).toHaveCount(5, { timeout: 60_000 });

    const before = await navLabels(page);
    expect(before.length, '导航岛没有渲染出频道标签').toBe(5);
    expect(
      before.every((t) => t.trim() !== ''),
      '有标签是空串',
    ).toBe(true);

    await setStoredLanguage(extPage, 'zh-TW');

    // 在线回填的判据是「不导航也换字」：给一次完整的事件循环 + 若干轮 tick，
    // 若实现是响应式的，这一 poll 必在超时内成立。
    await expect
      .poll(() => navLabels(page), {
        timeout: 5_000,
        message: '改了语言但已挂载的 overlay 仍是旧语言（没有在线回填）',
      })
      .not.toEqual(before);

    const after = await navLabels(page);
    expect(after.join('|'), '回填必须是整体换语言，不能只换掉一格').not.toContain(before[0]!);
  });

  test('对照：同一改动在重新导航后必须生效（证明存储链路本身是通的）', async ({
    extContext,
    extPage,
  }) => {
    await setStoredLanguage(extPage, 'en-US');
    const page = await openDoubanFixturePage(extContext, MOVIE_RULE, MOVIE_URL);
    await expect(page.locator(NAV_LABELS)).toHaveCount(5, { timeout: 60_000 });
    const en = await navLabels(page);
    expect(en.join('|')).not.toMatch(/[㐀-鿿]/);

    await setStoredLanguage(extPage, 'zh-TW');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator(NAV_LABELS)).toHaveCount(5, { timeout: 60_000 });
    const tw = await navLabels(page);
    expect(tw.join('|')).toMatch(/[㐀-鿿]/);
    expect(tw).not.toEqual(en);
  });

  test('回填不留下第二份页面样式（重挂载走的是同一条注入通道）', async ({
    extContext,
    extPage,
  }) => {
    await setStoredLanguage(extPage, 'en-US');
    const page = await openDoubanFixturePage(extContext, MOVIE_RULE, MOVIE_URL);
    await expect(page.locator(NAV_LABELS)).toHaveCount(5, { timeout: 60_000 });

    // 阴影根里的样式按 `style[data-umm-page-css]` 数：语言回填会重跑页面的 mountFn，
    // 而 mountUmmOverlay 是同一条注入通道——不去重就会每次多插一份等价的 <style>。
    const countPageStyles = (): Promise<number> =>
      page.evaluate(() => {
        let n = 0;
        for (const el of Array.from(document.querySelectorAll('*'))) {
          const root = el.shadowRoot;
          if (root) n += root.querySelectorAll('style[data-umm-page-css]').length;
        }
        return n;
      });

    const before = await countPageStyles();
    expect(before, '探针没数到页面样式（去重选择器失效或 overlay 没挂载）').toBe(1);

    await setStoredLanguage(extPage, 'zh-TW');
    await expect(page.locator(NAV_LABELS).first()).not.toHaveText('Movies', { timeout: 10_000 });
    expect(await countPageStyles(), '一次语言回填多插了页面样式').toBe(before);
  });
});
