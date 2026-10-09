/**
 * X109 — witness that the third batch (template-text debt) renders THROUGH the
 * content i18n dictionary. Same mechanism as x107/x108: each page loads twice
 * (pinned zh-CN / en-US); the probed nodes must equal the dictionary value of
 * the pinned language, and the two languages' expected values are proven
 * different up front so a hardcoded string cannot pass both loads.
 *
 * Covered here in the real browser: personage / game-explore / search filter
 * bar / game-collect. The remaining X109 files (review-detail, book-review-
 * detail, music-profile, artists-overview, book-authors, genre, music-homepage,
 * user-celebrities, book-/music-collect, user-media, albums) ride the same
 * `t()`-in-template path but are NOT witnessed here. What still guards them:
 * the cjk ratchet (it blocks hardcoded zh from coming back — it cannot catch a
 * key swap) and, where a pure function owns the string, unit-level key↔value
 * pairing. Page-level strings like music-homepage's `douban.mh.hot_artists` /
 * `mh.new_albums` / `mh.pop_artists` have zero test references anywhere (grep
 * 实测；见审计 §33 行 5) — a swapped key there passes every gate today.
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

function expectBilingual(key: string): void {
  expect(dict('zh-CN', key), `${key} 两语言同值，双挂载证明退化为套壳`).not.toBe(
    dict('en-US', key),
  );
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 模板键（任意数量 {{占位}}）→ 匹配数字的正则：按占位符切段，逐段转义后用 \d+ 拼接。 */
function templatePattern(lang: Lang, key: string): RegExp {
  const parts = dict(lang, key).split(/\{\{\w+\}\}/);
  return new RegExp(`^${parts.map(escapeRegExp).join('\\d+')}$`);
}

/** 「文本 + 可选数字后缀」型（如「更多影视作品 12 →」）→ 正则；允许尾随空白。 */
function optionalCountPattern(lang: Lang, key: string, suffix: string): RegExp {
  return new RegExp(`^${escapeRegExp(dict(lang, key))}(?: \\d+)?${escapeRegExp(suffix)}\\s*$`);
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

test('personage：简介/获奖/未上映标题与「更多影视作品」按钮经词典渲染（双挂载）', async ({
  extContext,
  extPage,
}) => {
  const rule: DoubanFixtureRule = {
    host: 'www.douban.com',
    match: '/personage/',
    fixture: 'personage',
  };
  const url = 'https://www.douban.com/personage/90000001/';
  for (const key of [
    'douban.pg.bio',
    'douban.detail.awards',
    'douban.pg.more_works',
    'douban.pg.upcoming',
  ])
    expectBilingual(key);

  for (const lang of LANGS) {
    const page = await openPinned(
      extContext,
      extPage,
      lang,
      url,
      rule,
      '#umm-personage-overlay .umm-section-title',
    );
    const titles = (
      await page.locator('#umm-personage-overlay .umm-section-title').allInnerTexts()
    ).map((t) => t.trim());
    expect(titles, '影人页缺少「人物简介」小节').toContain(dict(lang, 'douban.pg.bio'));
    // 获奖标题与计数同元素（「获奖情况 （共 2 项）」），按前缀配对。
    expect(
      titles.some((t) => t.startsWith(dict(lang, 'douban.detail.awards'))),
      '影人页缺少「获奖情况」小节',
    ).toBe(true);
    // 「未上映作品」小节（夹具 ul.unreleased 有一条可解析项）：此前测试名里声称覆盖、
    // 断言却缺席（复审 1-1），换键无人拦——补上这条配对。
    expect(titles, '影人页缺少「未上映作品」小节').toContain(dict(lang, 'douban.pg.upcoming'));
    // 两个按钮都要断：DOMM 序 [0]=热门作品区（morePopularCount）、[1]=未上映区
    // （moreWorksCount）——x96 只钉了它们的 href，文本此前无见证（复审 1-1 盲区 2）。
    const btns = page.locator('#umm-personage-overlay .umm-personage-btn');
    await expect(btns).toHaveCount(2);
    await expect(btns.nth(0)).toHaveText(optionalCountPattern(lang, 'douban.pg.more_works', ' →'));
    await expect(btns.nth(1)).toHaveText(optionalCountPattern(lang, 'douban.pg.more_works', ' →'));
    await page.close();
  }
});

test('game-explore：标题/排序前缀/加载按钮经词典渲染（双挂载）', async ({
  extContext,
  extPage,
}) => {
  const rule: DoubanFixtureRule = {
    host: 'www.douban.com',
    match: '/game/explore',
    fixture: 'game-explore-dom',
  };
  const url = 'https://www.douban.com/game/explore?sort=hot';
  for (const key of ['douban.ge.title', 'douban.series.sort']) expectBilingual(key);

  for (const lang of LANGS) {
    const page = await openPinned(
      extContext,
      extPage,
      lang,
      url,
      rule,
      '#umm-douban-overlay .umm-game-explore-title',
    );
    await expect(page.locator('#umm-douban-overlay .umm-game-explore-title')).toHaveText(
      dict(lang, 'douban.ge.title'),
    );
    await expect(page.locator('#umm-douban-overlay .umm-game-sort-label')).toHaveText(
      dict(lang, 'douban.series.sort'),
    );
    // 加载按钮：夹具稳态只会显示「加载更多（共 N 个结果）」——初始不发请求，loading
    // 分支要点击后才出现。判据直钉这个可达分支，而不是 loading/load_more 的
    // alternation：alternation 对「按钮卡在加载中」和「两分支对调」都全绿（复审
    // 1-2 变异实证）。loading 文案要见证时另造点击后的延迟桩场景（x49 的 delayMs）。
    await expect(page.locator('#umm-douban-overlay .umm-game-load-btn').first()).toHaveText(
      templatePattern(lang, 'douban.ge.load_more'),
    );
    await page.close();
  }
});

test('search 筛选条：标题/三个页签/结果后缀经词典渲染（双挂载）', async ({
  extContext,
  extPage,
}) => {
  const rule: DoubanFixtureRule = {
    host: 'search.douban.com',
    match: '/movie/subject_search',
    fixture: 'search',
  };
  const url =
    'https://search.douban.com/movie/subject_search?search_text=%E6%B5%8B%E8%AF%95&cat=1002';
  for (const key of [
    'douban.search.title',
    'douban.search.filter_all',
    'douban.search.filter_movie',
    'douban.search.filter_tv',
    'douban.search.result_suffix',
  ])
    expectBilingual(key);

  for (const lang of LANGS) {
    const page = await openPinned(
      extContext,
      extPage,
      lang,
      url,
      rule,
      '#umm-search-overlay .umm-type-btn',
    );
    await expect(page.locator('#umm-search-overlay .umm-search-title')).toHaveText(
      dict(lang, 'douban.search.title'),
    );
    const chips = page.locator('#umm-search-overlay .umm-type-btn');
    await expect(chips.nth(0)).toHaveText(dict(lang, 'douban.search.filter_all'));
    await expect(chips.nth(1)).toHaveText(dict(lang, 'douban.search.filter_movie'));
    await expect(chips.nth(2)).toHaveText(dict(lang, 'douban.search.filter_tv'));
    await expect(page.locator('#umm-search-overlay .umm-search-hd-meta')).toContainText(
      dict(lang, 'douban.search.result_suffix'),
    );
    await page.close();
  }
});

test('game-collect：计数与分页整句经词典渲染（双挂载）', async ({ extContext, extPage }) => {
  const rule: DoubanFixtureRule = {
    host: 'www.douban.com',
    match: '/people/unforgetmemory/games',
    fixture: 'game-collect',
  };
  const url = 'https://www.douban.com/people/unforgetmemory/games';
  for (const key of ['douban.gc.count', 'douban.gc.page_info']) expectBilingual(key);

  for (const lang of LANGS) {
    const page = await openPinned(
      extContext,
      extPage,
      lang,
      url,
      rule,
      '#umm-douban-overlay .umm-titlebar-count',
    );
    await expect(page.locator('#umm-douban-overlay .umm-titlebar-count')).toHaveText(
      templatePattern(lang, 'douban.gc.count'),
    );
    await expect(page.locator('#umm-douban-overlay .umm-gc-pageinfo').first()).toHaveText(
      templatePattern(lang, 'douban.gc.page_info'),
    );
    await page.close();
  }
});
