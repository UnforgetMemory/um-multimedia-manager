/**
 * X107 — witness that the wave's extracted chrome copy renders THROUGH the
 * content i18n dictionary in a real browser.
 *
 * The wave moved stat bars, profile dashboards, the creations filter bar, the
 * homepage rows and the mount panel copy into `douban.stat.*` / `douban.up.*` /
 * `douban.bp.*` / `douban.pc.*` / `douban.home.*` / `douban.mount.*` keys.
 * A key present in four dictionaries (what i18n:check proves) does not prove
 * any component actually reads it. So each page is loaded twice — pinned
 * zh-CN, then en-US — and representative nodes must equal the dictionary value
 * of the pinned language. Precondition before the loop: the two languages'
 * expected values must DIFFER (a hardcoded string cannot pass both sides, and
 * two "translations" that happen to be equal would make the double-load
 * vacuous).
 *
 * Expected values come from `locales` (the dictionary itself — kept symmetric
 * by i18n:check), never from `t()` (tautology) and never from copied literals
 * (rot).
 */

import type { BrowserContext, Page } from '@playwright/test';
import { expect, setStoredLanguage, test } from './fixtures/extension-harness';
import {
  installDoubanFixtureRoutes,
  type DoubanFixtureRule,
} from './fixtures/douban-crawl-fixtures';
import locales from '@/entrypoints/content/i18n/locales';

const LANGS = ['zh-CN', 'en-US'] as const;
type Lang = (typeof LANGS)[number];

function dict(lang: Lang, key: string): string {
  const value = locales[lang][key];
  if (value === undefined) throw new Error(`词典缺键 ${key}（${lang}）`);
  return value;
}

/** The two pinned languages must really differ for this key. */
function expectBilingual(key: string): void {
  expect(dict('zh-CN', key), `${key} 两语言同值，双挂载证明退化为套壳`).not.toBe(
    dict('en-US', key),
  );
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function openPinned(
  ctx: BrowserContext,
  extPage: Page,
  lang: Lang,
  url: string,
  rule: DoubanFixtureRule,
  waitFor: string,
): Promise<Page> {
  await setStoredLanguage(extPage, lang);
  await installDoubanFixtureRoutes(ctx, [rule]);
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await expect(page.locator(waitFor).first()).toBeVisible({ timeout: 60_000 });
  return page;
}

test('user-profile：统计条标题与标签经词典渲染（双挂载）', async ({ extContext, extPage }) => {
  const rule: DoubanFixtureRule = {
    host: 'www.douban.com',
    match: '/people/unforgetmemory',
    fixture: 'user-profile',
  };
  const url = 'https://www.douban.com/people/unforgetmemory/';
  for (const key of ['douban.stat.title_movie', 'douban.stat.movie_doing']) expectBilingual(key);

  for (const lang of LANGS) {
    const page = await openPinned(
      extContext,
      extPage,
      lang,
      url,
      rule,
      '#umm-douban-overlay .umm-statbar-item',
    );
    await expect(page.locator('#umm-douban-overlay .umm-statbar-title').first()).toHaveText(
      dict(lang, 'douban.stat.title_movie'),
    );
    await expect(page.locator('#umm-douban-overlay .umm-statbar-lbl').first()).toHaveText(
      dict(lang, 'douban.stat.movie_doing'),
    );
    await page.close();
  }
});

test('book-profile：统计条与看板标题经词典渲染（双挂载）', async ({ extContext, extPage }) => {
  const rule: DoubanFixtureRule = {
    host: 'book.douban.com',
    match: '/people/27235071',
    fixture: 'book-profile',
  };
  const url = 'https://book.douban.com/people/27235071/';
  for (const key of ['douban.stat.title_book', 'douban.stat.book_done', 'douban.bp.authors'])
    expectBilingual(key);

  for (const lang of LANGS) {
    const page = await openPinned(
      extContext,
      extPage,
      lang,
      url,
      rule,
      '#umm-douban-overlay .umm-statbar-item',
    );
    await expect(page.locator('#umm-douban-overlay .umm-statbar-title').first()).toHaveText(
      dict(lang, 'douban.stat.title_book'),
    );
    await expect(page.locator('#umm-douban-overlay .umm-statbar-lbl').first()).toHaveText(
      dict(lang, 'douban.stat.book_done'),
    );
    // 看板标题集合必须包含「收藏的作者」等键的词典值（整块不得残留裸串）。
    // 标题行还挂着计数链接（同一元素内），故按首行取值再配对——该前提依赖
    // `.umm-dash-head` 的 flex 布局（BookProfile.css）保持「标题在前、链接在后」。
    const headLines = (
      await page.locator('#umm-douban-overlay .umm-dash-head').allInnerTexts()
    ).map((t) => (t.split('\n')[0] ?? '').trim());
    expect(headLines, '书影看板缺少「收藏的作者」小节').toContain(dict(lang, 'douban.bp.authors'));
    expect(headLines, '书影看板缺少「图书豆列」小节').toContain(dict(lang, 'douban.bp.doulists'));
    await page.close();
  }
});

test('personage-creations：页签/角色条/计数经词典渲染（双挂载，计数按词典模板匹配）', async ({
  extContext,
  extPage,
}) => {
  const rule: DoubanFixtureRule = {
    host: 'www.douban.com',
    match: '/personage/90000001/creations',
    fixture: 'personage-creations',
  };
  const url = 'https://www.douban.com/personage/90000001/creations?type=filmmaker&sortby=time';
  for (const key of ['douban.pc.tab_filmmaker', 'douban.pc.role_all', 'douban.pc.count'])
    expectBilingual(key);

  const TABS = [
    'douban.pc.tab_filmmaker',
    'douban.pc.tab_writer',
    'douban.pc.tab_musician',
  ] as const;
  for (const lang of LANGS) {
    const page = await openPinned(
      extContext,
      extPage,
      lang,
      url,
      rule,
      '#umm-personage-overlay .umm-creations-tab',
    );
    const tabs = page.locator('#umm-personage-overlay .umm-creations-tab');
    await expect(tabs).toHaveCount(3);
    for (let i = 0; i < TABS.length; i++) {
      await expect(tabs.nth(i)).toHaveText(dict(lang, TABS[i]!));
    }
    await expect(
      page.locator('#umm-personage-overlay .umm-creations-role-chip').first(),
    ).toHaveText(dict(lang, 'douban.pc.role_all'));
    // 计数是模板键：先整串转义、再把 {{count}} 占位符换成 \d+（顺序反了会把
    // 反斜杠一起转义，正则退化成字面量 `\d+`——首轮实测如此）。
    const escaped = escapeRegExp(dict(lang, 'douban.pc.count'));
    const pattern = new RegExp(`^${escaped.replace('\\{\\{count\\}\\}', '\\d+')}$`);
    await expect(page.locator('#umm-personage-overlay .umm-creations-count')).toHaveText(pattern);
    await page.close();
  }
});

test('douban 首页：区块标题经词典渲染（双挂载）', async ({ extContext, extPage }) => {
  const rule: DoubanFixtureRule = { host: 'movie.douban.com', match: '/', fixture: 'homepage' };
  const url = 'https://movie.douban.com/';
  for (const key of ['douban.home.screening', 'douban.home.hot_movie']) expectBilingual(key);

  for (const lang of LANGS) {
    const page = await openPinned(
      extContext,
      extPage,
      lang,
      url,
      rule,
      '#umm-douban-overlay .umm-section-hd',
    );
    const heads = (await page.locator('#umm-douban-overlay .umm-section-hd').allInnerTexts()).map(
      (t) => t.trim(),
    );
    expect(heads[0], '首个区块标题应是「正在热映」').toBe(dict(lang, 'douban.home.screening'));
    expect(heads, '首页缺「最近热门电影」区块').toContain(dict(lang, 'douban.home.hot_movie'));
    expect(heads, '首页缺「最近热门电视剧」区块').toContain(dict(lang, 'douban.home.hot_tv'));
    await page.close();
  }
});
