import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';

initFileSandbox();
import { JSDOM } from 'jsdom';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractDoulistsData } from '@/scenario/douban/pages/doulists/doulists-data';

/**
 * doulists 数据提取单元测试（X11-5a 行为锁定）。
 *
 * 夹具为 www/movie 两套合成豆列列表页（doulists-www.html / doulists-movie.html），
 * 复刻 doulists-data.ts 实际查询的 DOM 形态。模块读取全局 document/location/window，
 * 因此每个用例先把 JSDOM 装进全局（precedent: doulist-dialog-render.spec.ts）。
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WWW_HTML = fs.readFileSync(
  path.resolve(HERE, '../fixtures/douban/doulists-www.html'),
  'utf-8',
);
const MOVIE_HTML = fs.readFileSync(
  path.resolve(HERE, '../fixtures/douban/doulists-movie.html'),
  'utf-8',
);

const WWW_URL = 'https://www.douban.com/people/1234567/doulists';
const MOVIE_URL = 'https://movie.douban.com/people/li4/doulists';

// Node 24 exposes some browser globals as getter-only; redefine instead of assign.
/** Install a fresh JSDOM (fixture html at given url) as the global DOM. */
function domAt(html: string, url: string): Document {
  const dom = new JSDOM(html, { url, runScripts: 'outside-only' });
  defineGlobal('window', dom.window);
  defineGlobal('document', dom.window.document);
  defineGlobal('location', dom.window.location);
  return dom.window.document;
}

test.describe('doulists www 页面（.switch_tabs + .doulist-list）', () => {
  test('用户信息 + 标签页 + 分类 xbar 全量提取', () => {
    domAt(WWW_HTML, WWW_URL);
    const data = extractDoulistsData();
    expect(data).not.toBeNull();
    const d = data as NonNullable<ReturnType<typeof extractDoulistsData>>;

    expect(d.userId).toBe('1234567');
    // www 页 h1 是页面标题"我的豆列"，显示名取头像 alt
    expect(d.displayName).toBe('书影漫游者');
    expect(d.avatarUrl).toBe('https://img1.doubanio.com/icon/u1234567-8.jpg');
    // '|' 分隔符 li 无 a，不进 navLinks
    expect(d.navLinks.map((l) => l.label)).toEqual(['主页', '动态', '豆列']);

    expect(d.createdCount).toBe(7);
    expect(d.collectedCount).toBe(3);
    // current span → location.href；非当前 → a 原始 href 属性（相对路径）
    expect(d.createdUrl).toBe(WWW_URL);
    expect(d.collectedUrl).toBe('/people/1234567/doulists?owned=followed');
    expect(d.activeTab).toBe('created');

    // xbar 分类链接 + span.now（current，追加在末尾）
    expect(d.xbarCategories).toEqual([
      { label: '片单', url: '/people/1234567/subject_doulists/movie', count: 52, current: false },
      { label: '书单', url: '/people/1234567/subject_doulists/book', count: 4, current: false },
      { label: '全部豆列', url: WWW_URL, count: 59, current: true },
    ]);
  });

  test('豆列项：分类/看过比例/更新时间/关注数 + 无封面与非法项边界', () => {
    domAt(WWW_HTML, WWW_URL);
    const d = extractDoulistsData() as NonNullable<ReturnType<typeof extractDoulistsData>>;
    // 第 4 个 li（/topic/ 链接）无豆列 id → 跳过
    expect(d.items.length).toBe(3);

    const movie = d.items[0];
    expect(movie).toBeDefined();
    expect(movie?.id).toBe('1500001');
    expect(movie?.title).toBe('华语犯罪片单');
    expect(movie?.category).toBe('movie');
    expect(movie?.watchedCount).toBe(17);
    expect(movie?.itemCount).toBe(20);
    expect(movie?.updateTime).toBe('2026-07-07 20:09');
    expect(movie?.followerCount).toBe(1283);
    expect(movie?.intro).toBe('2000 年后优秀的华语犯罪类型片，按年代排列。');
    expect(movie?.coverUrl).toBe('https://img1.doubanio.com/cpms/doulist/cover_1500001.jpg');

    // subject_collection 书籍榜单：大写字母数字 id
    const book = d.items[1];
    expect(book?.id).toBe('ECMXTQVB');
    expect(book?.category).toBe('book');
    expect(book?.watchedCount).toBe(10);
    expect(book?.itemCount).toBe(10);
    expect(book?.intro).toBe('');

    // 无封面边界：img 缺失 → coverUrl 空；分类回落 other；单项计数"听过24张"
    const music = d.items[2];
    expect(music?.id).toBe('1490003');
    expect(music?.coverUrl).toBe('');
    expect(music?.category).toBe('other');
    expect(music?.itemCount).toBe(24);
    expect(music?.watchedCount).toBe(0);
  });

  test('?owned=followed 时 activeTab=collected', () => {
    domAt(WWW_HTML, `${WWW_URL}?owned=followed`);
    const d = extractDoulistsData() as NonNullable<ReturnType<typeof extractDoulistsData>>;
    expect(d.activeTab).toBe('collected');
    expect(d.createdCount).toBe(7);
    expect(d.collectedCount).toBe(3);
  });

  test('.switch_tabs 缺失 → 计数为 0，回落 created（文档化兜底）', () => {
    const doc = domAt(WWW_HTML, WWW_URL);
    doc.querySelector('.switch_tabs')?.remove();
    const d = extractDoulistsData() as NonNullable<ReturnType<typeof extractDoulistsData>>;
    expect(d.createdCount).toBe(0);
    expect(d.collectedCount).toBe(0);
    expect(d.createdUrl).toBe('');
    expect(d.collectedUrl).toBe('');
    expect(d.activeTab).toBe('created');
    // xbar 与 items 不受影响
    expect(d.xbarCategories.length).toBe(3);
    expect(d.items.length).toBe(3);
  });

  test('分页器：thispage 当前页 + 相对链接解析为绝对 URL', () => {
    domAt(WWW_HTML, WWW_URL);
    const d = extractDoulistsData() as NonNullable<ReturnType<typeof extractDoulistsData>>;
    expect(d.pageLinks).toEqual([
      { label: '1', url: '', current: true },
      { label: '2', url: `${WWW_URL}?start=20`, current: false },
      { label: '3', url: `${WWW_URL}?start=40`, current: false },
    ]);
    expect(d.prevPageUrl).toBe('');
    expect(d.nextPageUrl).toBe(`${WWW_URL}?start=20`);
  });
});

test.describe('doulists movie 页面（.xbar + table.list-b）', () => {
  test('显示名去后缀 + nav 改写 movie 子域 + xbar/.now 标签计数', () => {
    domAt(MOVIE_HTML, MOVIE_URL);
    const d = extractDoulistsData() as NonNullable<ReturnType<typeof extractDoulistsData>>;

    expect(d.userId).toBe('li4');
    // h1 "李四的豆列" → 去掉 "的豆列"
    expect(d.displayName).toBe('李四');
    // movie 域下所有 www.douban.com 链接改写为 movie 子域（含 note）
    expect(d.navLinks).toEqual([
      { label: '主页', url: 'https://movie.douban.com/people/li4/' },
      { label: '电影', url: 'https://movie.douban.com/people/li4/movie/' },
      { label: '笔记', url: 'https://movie.douban.com/note/123456/' },
    ]);

    expect(d.createdCount).toBe(18);
    // .now 覆盖：pathname + ?type=create
    expect(d.createdUrl).toBe('/people/li4/doulists?type=create');
    expect(d.collectedCount).toBe(5);
    expect(d.collectedUrl).toBe('https://www.douban.com/people/li4/doulists?owned=followed');
    expect(d.activeTab).toBe('created');
    // 分类 xbar 仅 www 解析
    expect(d.xbarCategories).toEqual([]);
  });

  test('list-b 行提取：em [N] 条目数 + td.num 关注数 + 无链接行跳过', () => {
    domAt(MOVIE_HTML, MOVIE_URL);
    const d = extractDoulistsData() as NonNullable<ReturnType<typeof extractDoulistsData>>;
    // 第 3 行无 a → 跳过
    expect(d.items.length).toBe(2);

    const first = d.items[0];
    expect(first?.id).toBe('1450001');
    expect(first?.title).toBe('是枝裕和剧场');
    expect(first?.itemCount).toBe(28);
    expect(first?.followerCount).toBe(412);
    // movie 分支不采集封面/更新时间（固定空串）
    expect(first?.coverUrl).toBe('');
    expect(first?.updateTime).toBe('');
    expect(first?.url).toBe('https://movie.douban.com/doulist/1450001/');

    const second = d.items[1];
    // 无 em → itemCount 0；相对 href 原样保留；"36人" parseInt → 36
    expect(second?.id).toBe('1450003');
    expect(second?.itemCount).toBe(0);
    expect(second?.followerCount).toBe(36);
    expect(second?.url).toBe('/doulist/1450003/');
  });

  test('.xbar 缺失 → 计数与 URL 全为 0/空（文档化兜底）', () => {
    const doc = domAt(MOVIE_HTML, MOVIE_URL);
    doc.querySelector('.xbar')?.remove();
    const d = extractDoulistsData() as NonNullable<ReturnType<typeof extractDoulistsData>>;
    expect(d.createdCount).toBe(0);
    expect(d.collectedCount).toBe(0);
    expect(d.createdUrl).toBe('');
    expect(d.collectedUrl).toBe('');
    expect(d.activeTab).toBe('created');
    expect(d.items.length).toBe(2);
  });

  test('h1 缺失时显示名回落头像 alt', () => {
    const doc = domAt(MOVIE_HTML, MOVIE_URL);
    doc.querySelector('#db-usr-profile h1')?.remove();
    const d = extractDoulistsData() as NonNullable<ReturnType<typeof extractDoulistsData>>;
    // nameEl null → name = userId → 与 userId 相同 → 取 alt "李四"
    expect(d.displayName).toBe('李四');
  });

  test('URL 不含 /people/ → null', () => {
    domAt(MOVIE_HTML, 'https://movie.douban.com/doulist/1450001/');
    expect(extractDoulistsData()).toBeNull();
  });
});
