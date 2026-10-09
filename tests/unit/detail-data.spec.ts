import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';

initFileSandbox();
import { JSDOM } from 'jsdom';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import locales from '@/entrypoints/content/i18n/locales';
import type { DetailData } from '@/scenario/douban/pages/detail/types';

/**
 * detail-data orchestration unit tests (X11-1 behavior lock).
 *
 * Fixtures: detail-movie.html / detail-music.html / detail-book.html.
 * extractDetailData chains detail-extract + extra-extract (DOMPurify); the
 * record read lives in record-loader and is reached here only through the
 * "chrome is undefined" degradation. dompurify binds window AT MODULE-LOAD
 * time, so every module under test is dynamically imported AFTER the
 * global window is installed (precedent: game-detail-data.spec.ts).
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));

function fixtureHtml(name: string): string {
  return fs.readFileSync(path.resolve(HERE, '../fixtures/douban', name), 'utf-8');
}

// Node 24 exposes some browser globals as getter-only; redefine instead of assign.
// Anchor window for dompurify's load-time binding (fixture DOMs replace document only).
defineGlobal(
  'window',
  new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://movie.douban.com/' })
    .window,
);

type DetailDataModule = typeof import('@/scenario/douban/pages/detail/detail-data');
let modPromise: Promise<DetailDataModule> | null = null;
function load(): Promise<DetailDataModule> {
  modPromise ??= import('@/scenario/douban/pages/detail/detail-data');
  return modPromise;
}

function domAt(file: string, url: string): Document {
  const dom = new JSDOM(fixtureHtml(file), { url });
  defineGlobal('document', dom.window.document);
  defineGlobal('location', dom.window.location);
  defineGlobal('Node', dom.window.Node);
  return dom.window.document;
}

const MOVIE = 'detail-movie.html';
const MOVIE_URL = 'https://movie.douban.com/subject/1292052/';
const MUSIC = 'detail-music.html';
const MUSIC_URL = 'https://music.douban.com/subject/1422007/';
const BOOK = 'detail-book.html';
const BOOK_URL = 'https://book.douban.com/subject/26973406/';

function requireData(d: DetailData | null): DetailData {
  if (!d) throw new Error('detail page must not extract to null');
  return d;
}

test.describe('extractDetailData — 电影页全量装配', () => {
  test('身份/标题/海报/评分核心字段', async () => {
    domAt(MOVIE, MOVIE_URL);
    const { extractDetailData } = await load();
    const d = requireData(await extractDetailData());

    expect(d.identity).toEqual({
      platform: 'douban',
      type: 'movie',
      providerId: '1292052',
      url: MOVIE_URL,
    });
    expect(d.title).toBe('肖申克的救赎');
    expect(d.originalTitle).toBe('');
    expect(d.year).toBe('1994');
    expect(d.subtitle).toBe('');
    expect(d.isMusic).toBe(false);
    expect(d.isBook).toBe(false);
    expect(d.posterSrc).toBe('https://img9.doubanio.com/view/photo/x/public/p480988254.jpg');
    expect(d.posterAlt).toBe('肖申克的救赎');
    expect(d.posterLink).toBe('https://movie.douban.com/subject/1292052/photos');
    expect(d.ratingNum).toBe('9.7');
    expect(d.ratingPeople).toBe('2389412');
    expect(d.bigstarNum).toBe('10');
  });

  test('分区字段：评分分布/好于/元信息行/简介/演职员/获奖/榜单/图集', async () => {
    domAt(MOVIE, MOVIE_URL);
    const { extractDetailData } = await load();
    const d = requireData(await extractDetailData());

    expect(d.ratingBars.map((b) => b.label)).toEqual(['力荐', '推荐', '还行', '较差', '很差']);
    expect(d.betterThan).toEqual(['98% 的剧情片', '97% 的犯罪片']);
    expect(d.metaRows.map((r) => r.label)).toEqual([
      '导演',
      '编剧',
      '语言',
      '片长',
      '又名',
      'IMDb编号',
    ]);
    expect(d.synopsisHeadingKey).toBe('douban.synopsis.movie');
    expect(d.synopsisHtml).toContain('银行家安迪');
    expect(d.celebHeadingKey).toBe('douban.detail.celeb_cast');
    expect(d.celebCount).toBe('53');
    expect(d.celebItems.length).toBe(3);
    expect(d.celebItems[0]?.name).toBe('弗兰克·德拉邦特');
    expect(d.awardItems.length).toBe(2);
    expect(d.awardItems[0]?.isNomination).toBe(true);
    expect(d.rankNo).toBe('1');
    expect(d.rankText).toBe('豆瓣电影Top250');
    expect(d.rankHref).toBe('https://movie.douban.com/chart');
    expect(d.photoItems.length).toBe(2);
    expect(d.trailerCount).toBe('13');
    expect(d.photoCount).toBe('54');
  });

  test('推荐位为纯 DOM 提取：形状止于 subjectId，个人状态由渲染层活态派生', async () => {
    domAt(MOVIE, MOVIE_URL);
    const { extractDetailData } = await load();
    const d = requireData(await extractDetailData());

    expect(d.recItems.length).toBe(2);
    expect(d.recItems[0]).toEqual({
      title: '霸王别姬',
      poster: 'https://img3.doubanio.com/view/photo/x/public/p453706299.jpg',
      rating: '9.6',
      link: 'https://movie.douban.com/subject/1291544/',
      subjectId: '1291544',
    });
    // subjectId 是徽章解析的唯一入参：缺它则整条推荐位静默无状态。
    expect(d.recItems.map((r) => r.subjectId)).toEqual(['1291544', '1292937']);
  });

  test('短评装配 + 电影页不存在的专属字段全部为空 + record 恒 null', async () => {
    domAt(MOVIE, MOVIE_URL);
    const { extractDetailData } = await load();
    const d = requireData(await extractDetailData());

    expect(d.shortComments.length).toBe(2);
    expect(d.shortComments[0]?.votes).toBe(2038);
    expect(d.trackItems).toEqual([]);
    expect(d.tocItems).toEqual([]);
    expect(d.editionItems).toEqual([]);
    expect(d.blockquoteItems).toEqual([]);
    expect(d.authorBioHtml).toBe('');
    // record is hardcoded null in extractDetailData — record loading lives elsewhere.
    expect(d.record).toBeNull();
  });
});

test.describe('extractDetailData — 图书页形态', () => {
  test('isBook 分支：身份兜底 + 图书专属字段', async () => {
    domAt(BOOK, BOOK_URL);
    const { extractDetailData } = await load();
    const d = requireData(await extractDetailData());

    expect(d.identity.type).toBe('book');
    expect(d.isBook).toBe(true);
    expect(d.title).toBe('德米安：彷徨少年时');
    expect(d.originalTitle).toBe('Demian');
    expect(d.subtitle).toBe('赫尔曼·黑塞');
    expect(d.year).toBe('');
    // 图书封面在 #cover_block 而提取器只认 #mainpic → 海报字段空（疑点已上报）
    expect(d.posterSrc).toBe('');
    expect(d.bigstarNum).toBe('');
    expect(d.ratingNum).toBe('9.0');
    // isBook 触发 #interest_sectl 星档兜底
    expect(d.ratingBars.length).toBe(5);
    expect(d.ratingBars[0]).toEqual({ label: '力荐', pct: '53.9%' });
    expect(d.synopsisHeadingKey).toBe('douban.synopsis.book');
    expect(d.celebHeadingKey).toBe('douban.detail.celeb_creator');
    expect(d.celebItems.length).toBe(2);
    expect(d.tocItems.length).toBe(6);
    expect(d.editionItems.length).toBe(2);
    expect(d.blockquoteItems.length).toBe(2);
    expect(d.authorBioHtml).toContain('诺贝尔文学奖');
    expect(d.recItems).toEqual([]);
    expect(d.shortComments).toEqual([]);
    expect(d.trackItems).toEqual([]);
  });
});

test.describe('extractDetailData — 音乐页形态', () => {
  test('isMusic 分支：曲目/表演者/推荐容器回落', async () => {
    domAt(MUSIC, MUSIC_URL);
    const { extractDetailData } = await load();
    const d = requireData(await extractDetailData());

    expect(d.identity.type).toBe('music');
    expect(d.isMusic).toBe(true);
    expect(d.title).toBe('Wish You Were Here');
    expect(d.subtitle).toBe('Pink Floyd');
    expect(d.celebHeadingKey).toBe('douban.detail.celeb_performer');
    expect(d.trackItems).toEqual([
      '1 Shine On You Crazy Diamond (Parts I-V)',
      '2 Welcome to the Machine',
      'Have a Cigar',
    ]);
    expect(d.recItems.length).toBe(2);
    expect(d.recItems[0]?.title).toBe('The Dark Side of the Moon');
    // 徽章键来自条目 href 而非当前页身份：音乐页推荐位同样解析出 subjectId。
    expect(d.recItems.map((r) => r.subjectId)).toEqual(['1433673', '1461334']);
    expect(d.photoItems).toEqual([]);
    expect(d.awardItems).toEqual([]);
  });
});

test.describe('extractDetailData — 不支持 URL 返回 null', () => {
  test('首页 URL（无 subject 数字段）→ 身份为空 → null，不抛异常', async () => {
    domAt(MOVIE, 'https://movie.douban.com/');
    const { extractDetailData } = await load();
    expect(await extractDetailData()).toBeNull();
  });
});

test.describe('extractRecItemsDom / loadRecord — 提取层无 DB 依赖', () => {
  test('无 chrome 环境下推荐位纯 DOM 可得（提取层不触 Store）', async () => {
    domAt(MOVIE, MOVIE_URL);
    const mod = await load();
    const raw = mod.extractRecItemsDom();
    expect(raw.length).toBe(2);
    expect(raw.map((r) => r.subjectId)).toEqual(['1291544', '1292937']);
    for (const item of raw) {
      expect('recStatus' in item).toBe(false);
      expect('personalRating' in item).toBe(false);
    }
  });

  test('barrel 不再导出批量注入函数：个人状态只能由渲染层派生', async () => {
    const mod = await load();
    expect('enrichRecItems' in mod).toBe(false);
  });

  test('loadRecord 在无 chrome/IndexedDB 环境返回 null（catch 兜底）', async () => {
    domAt(MOVIE, MOVIE_URL);
    const mod = await load();
    const { identity } = mod.extractCoreMetadata();
    if (!identity) throw new Error('identity expected from movie fixture');
    expect(await mod.loadRecord(identity)).toBeNull();
  });
});

test.describe('detail-data barrel — re-export 同一性', () => {
  test('具名导出与源模块引用相等（薄壳不复制实现）', async () => {
    const mod = await load();
    const core = await import('@/scenario/douban/pages/detail/detail-extract');
    const extra = await import('@/scenario/douban/pages/detail/extra-extract');
    expect(mod.extractCoreMetadata).toBe(core.extractCoreMetadata);
    expect(mod.extractCelebrities).toBe(extra.extractCelebrities);
    expect(mod.extractDetailData).toBe(mod.extractDetailData);
    expect(typeof mod.loadRecord).toBe('function');
  });
});

test.describe('X108 标题键 ↔ 文案配对', () => {
  test('简介/创作者/演职员家族的键在 zh-CN 词典里解析为原可见串（换键即红）', () => {
    expect(locales['zh-CN']['douban.synopsis.movie']).toBe('剧情简介');
    expect(locales['zh-CN']['douban.synopsis.book']).toBe('内容简介');
    expect(locales['zh-CN']['douban.synopsis.short']).toBe('简介');
    expect(locales['zh-CN']['douban.detail.celeb_cast']).toBe('演职员');
    expect(locales['zh-CN']['douban.detail.celeb_creator']).toBe('创作者');
    expect(locales['zh-CN']['douban.detail.celeb_performer']).toBe('表演者');
  });
});
