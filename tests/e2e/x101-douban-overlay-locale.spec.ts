/**
 * X101 — the extension language setting actually reaches a Douban overlay.
 *
 * Audit §18 recorded this class of defect as "tests green ≠ production wired":
 * the Douban overlay consumed `t()` for years while its entry chain never called
 * `initI18n()`, so every translated string resolved back to the module default
 * (zh-CN) and the migration had zero user-visible effect. `scenario/douban/main.ts`
 * now awaits `initI18n()` — and until this file nothing in `tests/e2e` ever set a
 * language and checked what a content-script surface actually rendered
 * (`grep 'language' tests/e2e` used to find only the options-page assertions).
 *
 * Why zh-TW is the discriminating value, not en-US: the i18n module's default
 * locale is zh-CN and the harness browser reports `navigator.language = en-US`,
 * so a *missing* `initI18n()` still produces a plausible language in both of
 * those directions. Traditional Chinese is reachable ONLY through the stored
 * setting, so asserting 電影/豆瓣導航 proves the read happened, and asserting
 * 电影 does not (that is the fallback).
 *
 * Also pinned here, because both were the actual risk of extracting the island's
 * last bare strings:
 *  - the whole island switches together (one stale literal inside it shows up as
 *    a mixed-language nav, which the per-element equality catches);
 *  - `douban.island.search_aria` really interpolates its `{{label}}` (an
 *    un-substituted `{{` in the aria-label is the failure mode);
 *  - placeholder and aria-label are still PER-CHANNEL — the assertion compares
 *    two channel pages against each other instead of pinning a language, so it
 *    holds whichever locale the page resolves to.
 *
 * Measured scope, so this file is not over-claimed: the legs go red when the
 * Douban chain stops calling `initI18n()` at all — verified by replacing the call
 * with a bare reference, which reddened the zh-TW, en-US and interpolation legs
 * while the locale-agnostic per-channel leg stayed green. They do NOT police the
 * `await` in front of it: measured, `void initI18n()` keeps all four legs green,
 * because the mount does not read the locale before that promise settles.
 */

import type { BrowserContext } from '@playwright/test';
import { expect, setStoredLanguage as setLanguage, test } from './fixtures/extension-harness';
import { openDoubanFixturePage, type DoubanFixtureRule } from './fixtures/douban-crawl-fixtures';

const INPUT = '.umm-island-input';
const SUBMIT = '.umm-island-submit';
const NAV = '.umm-island-nav';
const NAV_LABELS = '.umm-island-nav-label';

const MOVIE_URL = 'https://movie.douban.com/subject/1292052/';
const GAME_URL = 'https://www.douban.com/game/explore?sort=hot';

const MOVIE_RULE: DoubanFixtureRule = {
  host: 'movie.douban.com',
  match: '/subject/1292052',
  fixture: 'detail-movie',
};
const GAME_RULE: DoubanFixtureRule = {
  host: 'www.douban.com',
  match: '/game/explore',
  fixture: 'game-explore-dom',
};

/** DOM order of the island's five navigation slots. */
const NAV_COPY = {
  'zh-TW': ['電影', '音樂', '圖書', '遊戲', '我的'],
  'en-US': ['Movies', 'Music', 'Books', 'Games', 'Me'],
} as const;
const NAV_ARIA = { 'zh-TW': '豆瓣導航', 'en-US': 'Douban navigation' } as const;
const SUBMIT_ARIA = { 'zh-TW': '搜尋', 'en-US': 'Search' } as const;

async function openIsland(extContext: BrowserContext, rule: DoubanFixtureRule, url: string) {
  const page = await openDoubanFixturePage(extContext, rule, url);
  await expect(page.locator(INPUT)).toBeVisible({ timeout: 60_000 });
  return page;
}

test.describe('内容语言设置抵达豆瓣 overlay（导航岛）', () => {
  test.afterEach(async ({ extPage }) => {
    // Storage outlives the tab: leave no language behind for other specs.
    await setLanguage(extPage, null);
  });

  test('存 zh-TW：整条导航岛落繁体（只有读到存储才会出现繁体）', async ({
    extContext,
    extPage,
  }) => {
    await setLanguage(extPage, 'zh-TW');
    const page = await openIsland(extContext, MOVIE_RULE, MOVIE_URL);

    const labels = await page.locator(NAV_LABELS).allInnerTexts();
    expect(
      labels.map((l) => l.trim()),
      '导航标签没有整体落到 zh-TW（残留简体/英文字面量说明还有裸串）',
    ).toEqual([...NAV_COPY['zh-TW']]);
    await expect(page.locator(NAV)).toHaveAttribute('aria-label', NAV_ARIA['zh-TW']);
    await expect(page.locator(SUBMIT)).toHaveAttribute('aria-label', SUBMIT_ARIA['zh-TW']);
    await page.close();
  });

  test('存 en-US：整条导航岛落英文，且没有漏出键名本身', async ({ extContext, extPage }) => {
    await setLanguage(extPage, 'en-US');
    const page = await openIsland(extContext, MOVIE_RULE, MOVIE_URL);

    const labels = await page.locator(NAV_LABELS).allInnerTexts();
    expect(
      labels.map((l) => l.trim()),
      '导航标签没有整体落到 en-US',
    ).toEqual([...NAV_COPY['en-US']]);
    await expect(page.locator(NAV)).toHaveAttribute('aria-label', NAV_ARIA['en-US']);
    await expect(page.locator(SUBMIT)).toHaveAttribute('aria-label', SUBMIT_ARIA['en-US']);
    // `t()` 找不到键会回落到「返回键名」——键名出现在界面上就是词典没接上。
    const body = await page.locator(NAV).innerText();
    expect(body, '界面漏出了 i18n 键名（词典缺键）').not.toContain('douban.island');
    await page.close();
  });

  test('搜索框的 aria-label 真的把频道名插进去了（不是留着 {{label}}）', async ({
    extContext,
    extPage,
  }) => {
    await setLanguage(extPage, 'en-US');
    const page = await openIsland(extContext, MOVIE_RULE, MOVIE_URL);

    const aria = (await page.locator(INPUT).getAttribute('aria-label')) ?? '';
    expect(aria, 'aria-label 里留下了未替换的模板占位符').not.toContain('{{');
    expect(aria.toLowerCase(), 'aria-label 没有带上当前频道名').toContain(
      NAV_COPY['en-US'][0]!.toLowerCase(),
    );
    await page.close();
  });

  test('占位文案随频道而变：电影页与游戏页不同，且各自包含自己的频道名', async ({
    extContext,
    extPage,
  }) => {
    await setLanguage(extPage, 'zh-CN');

    const movie = await openIsland(extContext, MOVIE_RULE, MOVIE_URL);
    const moviePh = (await movie.locator(INPUT).getAttribute('placeholder')) ?? '';
    const movieLabel = (await movie.locator(`${NAV} .umm-island-nav-link--active`).innerText())
      .trim()
      .split('\n')
      .pop()!;

    const game = await openIsland(extContext, GAME_RULE, GAME_URL);
    const gamePh = (await game.locator(INPUT).getAttribute('placeholder')) ?? '';
    const gameLabel = (await game.locator(`${NAV} .umm-island-nav-link--active`).innerText())
      .trim()
      .split('\n')
      .pop()!;

    expect(moviePh.length, '电影页没有占位文案').toBeGreaterThan(0);
    expect(gamePh.length, '游戏页没有占位文案').toBeGreaterThan(0);
    expect(moviePh, '两个频道共用同一条占位文案（类型派生分支被写死）').not.toBe(gamePh);
    // Locale-agnostic: each placeholder must mention its OWN active channel label.
    expect(moviePh.toLowerCase(), `电影页占位文案不含当前频道名（${movieLabel}）`).toContain(
      movieLabel.toLowerCase(),
    );
    expect(gamePh.toLowerCase(), `游戏页占位文案不含当前频道名（${gameLabel}）`).toContain(
      gameLabel.toLowerCase(),
    );

    await movie.close();
    await game.close();
  });
});
