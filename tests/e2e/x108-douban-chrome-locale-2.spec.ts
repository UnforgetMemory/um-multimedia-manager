/**
 * X108 — witness that the second batch of extracted chrome copy renders THROUGH
 * the content i18n dictionary (same mechanism as x107).
 *
 * Covered pages: photos / detail / trailer / celebrities / movie-profile /
 * doulists / book-reviews / series, plus the profile display-name FALLBACK
 * (user-profile served without its `<h1>` — the data layer now returns '' and
 * the render layer resolves `douban.user_fallback`).
 *
 * Each page is loaded twice (pinned zh-CN, then en-US); probed nodes must equal
 * the dictionary value of the pinned language, and the two languages' expected
 * values are proven different up front — a hardcoded string passes at most one
 * of the two loads. Page types not listed here (game-detail / book-homepage /
 * search / doulist-detail) ride the same `t()`-in-template path; their key sets
 * are additionally pinned by unit-level key↔dictionary pairings (see the X108
 * notes in the audit doc for the exact split).
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

/** 模板键（任意数量 {{占位}}）→ 匹配数字的正则：先按占位符切段，逐段转义后用 \d+ 拼接。 */
function templatePattern(lang: Lang, key: string): RegExp {
  const parts = dict(lang, key).split(/\{\{\w+\}\}/);
  return new RegExp(`^${parts.map(escapeRegExp).join('\\d+')}$`);
}

/** 「lead + 数字 + tail」组合（句内计数带样式节点的三段式）。 */
function composedPattern(lang: Lang, leadKey: string, tailKey: string): RegExp {
  return new RegExp(
    `^${escapeRegExp(dict(lang, leadKey))}\\d+${escapeRegExp(dict(lang, tailKey))}$`,
  );
}

function countPattern(lang: Lang, key: string): RegExp {
  return templatePattern(lang, key);
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

test('photos：下载控件 title 与分页文案经词典渲染（双挂载）', async ({ extContext, extPage }) => {
  const rule: DoubanFixtureRule = {
    host: 'movie.douban.com',
    match: '/subject/1292052/photos',
    fixture: 'photos-gallery',
  };
  const url = 'https://movie.douban.com/subject/1292052/photos/';
  for (const key of [
    'douban.photos.download',
    'douban.photos.prev',
    'douban.photos.count',
    'douban.photos.page_info',
  ])
    expectBilingual(key);

  for (const lang of LANGS) {
    const page = await openPinned(
      extContext,
      extPage,
      lang,
      url,
      rule,
      '#umm-photos-overlay .umm-photos-count',
    );
    await expect(page.locator('#umm-photos-overlay .umm-dl-btn').first()).toHaveAttribute(
      'title',
      dict(lang, 'douban.photos.download'),
    );
    await expect(page.locator('#umm-photos-overlay .umm-nav-btn').first()).toHaveText(
      dict(lang, 'douban.photos.prev'),
    );
    // 分页文案整句（X108 复审：x56 的改为文案无关后，这一侧必须补回词典见证）。
    await expect(page.locator('#umm-photos-overlay .umm-nav-page').first()).toHaveText(
      templatePattern(lang, 'douban.photos.page_info'),
    );
    await expect(page.locator('#umm-photos-overlay .umm-photos-count')).toHaveText(
      countPattern(lang, 'douban.photos.count'),
    );
    await page.close();
  }
});

test('detail：添加到列表按钮 / 简介标题 / 人评价经词典渲染（双挂载）', async ({
  extContext,
  extPage,
}) => {
  const rule: DoubanFixtureRule = {
    host: 'movie.douban.com',
    match: '/subject/1292052',
    fixture: 'detail-movie',
  };
  const url = 'https://movie.douban.com/subject/1292052/';
  for (const key of ['douban.add_movielist', 'douban.synopsis.movie', 'douban.rating_people'])
    expectBilingual(key);

  for (const lang of LANGS) {
    const page = await openPinned(extContext, extPage, lang, url, rule, '.umm-dl-trigger');
    await expect(page.locator('.umm-dl-trigger')).toHaveText(dict(lang, 'douban.add_movielist'));
    await expect(page.locator('.umm-synopsis-heading').first()).toHaveText(
      dict(lang, 'douban.synopsis.movie'),
    );
    await expect(page.locator('.umm-rating-people')).toHaveText(
      countPattern(lang, 'douban.rating_people'),
    );
    await page.close();
  }
});

test('trailer：类型标签经词典渲染（双挂载）', async ({ extContext, extPage }) => {
  const rule: DoubanFixtureRule = {
    host: 'movie.douban.com',
    match: '/subject/1292052/trailer',
    fixture: 'trailer-list',
  };
  const url = 'https://movie.douban.com/subject/1292052/trailer/';
  expectBilingual('douban.trailer_word');

  for (const lang of LANGS) {
    const page = await openPinned(
      extContext,
      extPage,
      lang,
      url,
      rule,
      '#umm-trailer-overlay .umm-trailer-type',
    );
    await expect(page.locator('#umm-trailer-overlay .umm-trailer-type').first()).toHaveText(
      dict(lang, 'douban.trailer_word'),
    );
    await page.close();
  }
});

test('celebrities：计数与「查看…影人主页」title 经词典渲染（双挂载，名字现场配对）', async ({
  extContext,
  extPage,
}) => {
  const rule: DoubanFixtureRule = {
    host: 'movie.douban.com',
    match: '/subject/1292052/celebrities',
    fixture: 'celebrities',
  };
  const url = 'https://movie.douban.com/subject/1292052/celebrities/';
  for (const key of ['douban.celeb.count', 'douban.celeb.view']) expectBilingual(key);

  for (const lang of LANGS) {
    const page = await openPinned(
      extContext,
      extPage,
      lang,
      url,
      rule,
      '#umm-celebrities-overlay .umm-celebrity-card',
    );
    await expect(page.locator('#umm-celebrities-overlay .umm-photos-count')).toHaveText(
      countPattern(lang, 'douban.celeb.count'),
    );
    // title 必须由「该卡片自己的名字」拼出，避免恒一文案也能过。
    const card = page.locator('#umm-celebrities-overlay .umm-celebrity-card').first();
    const name = (await card.locator('.umm-celebrity-name').innerText()).trim();
    expect(name.length, '卡片没有名字，配对无从谈起').toBeGreaterThan(0);
    await expect(card).toHaveAttribute(
      'title',
      dict(lang, 'douban.celeb.view').replace('{{name}}', name),
    );
    await page.close();
  }
});

test('movie-profile：统计条标签与「全部 N →」经词典渲染（双挂载）', async ({
  extContext,
  extPage,
}) => {
  const rule: DoubanFixtureRule = {
    host: 'movie.douban.com',
    match: '/people/27235071',
    fixture: 'movie-profile',
  };
  const url = 'https://movie.douban.com/people/27235071/';
  for (const key of ['douban.mp.celebrities', 'douban.mp.all_count']) expectBilingual(key);

  for (const lang of LANGS) {
    const page = await openPinned(
      extContext,
      extPage,
      lang,
      url,
      rule,
      '#umm-douban-overlay .umm-statbar-item',
    );
    // 该页还有一条**宿主派生**标签的统计条（如「看过」，language-independent），
    // 故按「标签集合包含词典值」判定——硬编码串过不了另一侧（值先证不同）。
    const labels = (await page.locator('#umm-douban-overlay .umm-statbar-lbl').allInnerTexts()).map(
      (t) => t.trim(),
    );
    expect(labels, '统计条里没有「收藏的影人」键的词典值').toContain(
      dict(lang, 'douban.mp.celebrities'),
    );
    await expect(page.locator('#umm-douban-overlay .umm-dash-more').first()).toHaveText(
      countPattern(lang, 'douban.mp.all_count'),
    );
    await page.close();
  }
});

test('doulists：条目统计与分类徽标经词典渲染（双挂载，徽标须是词典值之一）', async ({
  extContext,
  extPage,
}) => {
  const rule: DoubanFixtureRule = {
    host: 'www.douban.com',
    match: '/people/1234567/doulists',
    fixture: 'doulists-www',
  };
  const url = 'https://www.douban.com/people/1234567/doulists';
  for (const key of [
    'douban.doulists.watched',
    'douban.dl.cat_movie',
    'douban.dl.cat_music',
    'douban.dl.cat_book',
    'douban.dl.cat_thing_place',
    'douban.dl.cat_other',
  ])
    expectBilingual(key);

  for (const lang of LANGS) {
    const page = await openPinned(
      extContext,
      extPage,
      lang,
      url,
      rule,
      '#umm-douban-overlay .umm-doulist-card',
    );
    await expect(page.locator('#umm-douban-overlay .umm-doulist-stat-item').first()).toHaveText(
      countPattern(lang, 'douban.doulists.watched'),
    );
    const badges = page.locator('#umm-douban-overlay .umm-doulist-cat-badge');
    const badgeCount = await badges.count();
    expect(badgeCount, '夹具没有分类徽标，本例无从判别').toBeGreaterThan(0);
    // 徽标文本必须与它**自己的分类类名**配对（换键/换类都会红）——单纯「属于集合」
    // 会放过 category 之间互换。
    const CAT_KEY: Record<string, string> = {
      'umm-doulist-cat--movie': 'douban.dl.cat_movie',
      'umm-doulist-cat--music': 'douban.dl.cat_music',
      'umm-doulist-cat--book': 'douban.dl.cat_book',
      'umm-doulist-cat--thing_place': 'douban.dl.cat_thing_place',
    };
    for (let i = 0; i < badgeCount; i++) {
      const badge = badges.nth(i);
      const cls = (await badge.getAttribute('class')) ?? '';
      const key = Object.keys(CAT_KEY).find((c) => cls.includes(c));
      expect(key, `徽标类名没有可识别的分类：${cls}`).toBeTruthy();
      await expect(badge).toHaveText(dict(lang, CAT_KEY[key!]!));
    }
    await page.close();
  }
});

test('book-reviews：标题栏与展开开关经词典渲染（双挂载）', async ({ extContext, extPage }) => {
  const rule: DoubanFixtureRule = {
    host: 'book.douban.com',
    match: '/people/reader01/reviews',
    fixture: 'book-reviews',
  };
  const url = 'https://book.douban.com/people/reader01/reviews';
  for (const key of ['douban.br.title', 'douban.rev.count']) expectBilingual(key);

  for (const lang of LANGS) {
    const page = await openPinned(
      extContext,
      extPage,
      lang,
      url,
      rule,
      '#umm-douban-overlay .umm-titlebar-label',
    );
    await expect(page.locator('#umm-douban-overlay .umm-titlebar-label')).toHaveText(
      dict(lang, 'douban.br.title'),
    );
    await expect(page.locator('#umm-douban-overlay .umm-titlebar-count')).toHaveText(
      countPattern(lang, 'douban.rev.count'),
    );
    await page.close();
  }
});

test('series：收藏按钮与排序前缀经词典渲染（双挂载）', async ({ extContext, extPage }) => {
  const rule: DoubanFixtureRule = {
    host: 'book.douban.com',
    match: '/series/16390',
    fixture: 'series-list',
  };
  const url = 'https://book.douban.com/series/16390/';
  for (const key of [
    'douban.series.collect',
    'douban.series.sort',
    'douban.series.sort_collection',
  ])
    expectBilingual(key);

  for (const lang of LANGS) {
    const page = await openPinned(
      extContext,
      extPage,
      lang,
      url,
      rule,
      '#umm-douban-overlay .umm-series-item',
    );
    await expect(page.locator('#umm-douban-overlay .umm-series-collect-btn')).toHaveText(
      dict(lang, 'douban.series.collect'),
    );
    await expect(page.locator('#umm-douban-overlay .umm-series-sort-label')).toHaveText(
      dict(lang, 'douban.series.sort'),
    );
    // X108 复审：排序项文案（数据层发键后的可见产物）+ 两条统计的**整句**
    // （空 lead 值曾在 t() 的 truthy 兜底下跌成键名，如「douban.series.volume_count_lead12 册」）。
    await expect(page.locator('#umm-douban-overlay .umm-series-sort-link').first()).toHaveText(
      dict(lang, 'douban.series.sort_collection'),
    );
    await expect(page.locator('#umm-douban-overlay .umm-series-stat-item').nth(0)).toHaveText(
      composedPattern(lang, 'douban.series.books_count_lead', 'douban.series.books_count_tail'),
    );
    await expect(page.locator('#umm-douban-overlay .umm-series-stat-item').nth(1)).toHaveText(
      composedPattern(lang, 'douban.series.volume_count_lead', 'douban.series.volume_count_tail'),
    );
    await page.close();
  }
});

test('doulist-detail：句内计数整句经词典渲染（双挂载；空 lead 键的键名泄漏回归）', async ({
  extContext,
  extPage,
}) => {
  const rule: DoubanFixtureRule = {
    host: 'www.douban.com',
    match: '/doulist/1500001',
    fixture: 'doulist-detail',
  };
  const url = 'https://www.douban.com/doulist/1500001/';
  for (const key of ['douban.dl.total_lead', 'douban.dl.director', 'douban.dl.cast'])
    expectBilingual(key);

  for (const lang of LANGS) {
    const page = await openPinned(
      extContext,
      extPage,
      lang,
      url,
      rule,
      '#umm-douban-overlay .umm-dlist-stat-item',
    );
    await expect(page.locator('#umm-douban-overlay .umm-dlist-stat-item').nth(0)).toHaveText(
      composedPattern(lang, 'douban.dl.total_lead', 'douban.dl.total_tail'),
    );
    await expect(page.locator('#umm-douban-overlay .umm-dlist-stat-item').nth(1)).toHaveText(
      composedPattern(lang, 'douban.dl.page_count_lead', 'douban.dl.page_count_tail'),
    );
    await page.close();
  }
});

test('user-profile：h1 缺失时英雄名走词典兜底（双挂载；数据层返回空串）', async ({
  extContext,
  extPage,
}) => {
  const rule: DoubanFixtureRule = {
    host: 'www.douban.com',
    match: '/people/unforgetmemory',
    fixture: 'user-profile',
    // 只去掉昵称 h1（爬取件里唯一一个），其余结构与字节保持爬取样。
    transform: (html) => html.replace(/<h1>[\s\S]*?<\/h1>/, ''),
  };
  const url = 'https://www.douban.com/people/unforgetmemory/';
  expectBilingual('douban.user_fallback');

  for (const lang of LANGS) {
    const page = await openPinned(
      extContext,
      extPage,
      lang,
      url,
      rule,
      '#umm-douban-overlay .umm-statbar-item',
    );
    await expect(page.locator('#umm-douban-overlay .umm-hero-name').first()).toHaveText(
      dict(lang, 'douban.user_fallback').replace('{{id}}', 'unforgetmemory'),
    );
    await page.close();
  }
});
