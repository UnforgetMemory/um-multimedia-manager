import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';
import { JSDOM } from 'jsdom';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractUserReviewsData } from '@/scenario/douban/pages/user-reviews/user-reviews-data';
import type { UserReviewsData } from '@/scenario/douban/pages/user-reviews/types';

// Installs happen inside tests below; register this file's sandbox hooks at module scope.
initFileSandbox();

/**
 * user-reviews (movie.douban.com/people/{uid}/reviews) extraction spec —
 * X11-4 coverage wave. Global-DOM module (window.document + doc.location) →
 * each test installs a fresh JSDOM over
 * tests/fixtures/douban/user-reviews.html (synthetic Douban-shaped DOM).
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(HERE, '../fixtures/douban/user-reviews.html');
const PAGE_URL = 'https://movie.douban.com/people/unforgetmemory/reviews';

function mount(): Document {
  const dom = new JSDOM(fs.readFileSync(FIXTURE, 'utf-8'), {
    url: PAGE_URL,
    runScripts: 'outside-only',
  });
  defineGlobal('window', dom.window);
  defineGlobal('document', dom.window.document);
  defineGlobal('location', dom.window.location);
  defineGlobal('Node', dom.window.Node);
  defineGlobal('HTMLElement', dom.window.HTMLElement);
  return dom.window.document;
}

function extract(): UserReviewsData {
  const data = extractUserReviewsData();
  expect(data).not.toBeNull();
  return data as UserReviewsData;
}

test.describe('user-reviews-data 提取', () => {
  test('happy path — 用户身份 + h1 计数 + www→movie 导航重写', () => {
    mount();
    const d = extract();
    expect(d.userId).toBe('unforgetmemory');
    // h1 是「UnforgetMemory的影评(3)」→ displayName 取头像 alt（模块注释明示）
    expect(d.displayName).toBe('UnforgetMemory');
    expect(d.avatarUrl).toBe('https://img1.doubanio.com/icon/u55667788-9.jpg');
    expect(d.total).toBe(3);
    expect(d.navLinks).toEqual([
      { label: '主页', url: 'https://movie.douban.com/people/unforgetmemory/' },
      { label: '动态', url: 'https://movie.douban.com/people/unforgetmemory/monitor' },
      { label: '我看', url: 'https://movie.douban.com/people/unforgetmemory/collect' },
    ]);
  });

  test('items — 完整影评：评分/正文/作者/阅读数/来源/有用数', () => {
    mount();
    const d = extract();
    // 第三条 ul 缺 [id^=review_] → 跳过
    expect(d.items).toHaveLength(2);

    const r1 = d.items[0]!;
    expect(r1.id).toBe('3666098');
    expect(r1.title).toBe('她不再道歉：《好东西》里的性别叙事');
    expect(r1.reviewUrl).toBe('https://movie.douban.com/review/3666098/');
    expect(r1.subjectTitle).toBe('好东西');
    expect(r1.subjectUrl).toBe('https://movie.douban.com/subject/36185501/');
    expect(r1.posterUrl).toBe(
      'https://img1.doubanio.com/view/photo/s_ratio_poster/p2923492298.jpg',
    );
    expect(r1.rating).toBe(5);
    expect(r1.content.startsWith('邵艺辉的第二部长片')).toBe(true);
    expect(r1.authorName).toBe('UnforgetMemory');
    expect(r1.readCount).toBe(4562);
    expect(r1.source).toBe('来自: 好东西');
    expect(r1.usefulCount).toBe(218);
    expect(r1.uselessCount).toBe(9);
  });

  test('edge — 无评分 + 无 .review-content：rating 0，正文走 .review-short span 兜底，计数缺省 0', () => {
    mount();
    const r2 = extract().items[1]!;
    expect(r2.id).toBe('3600001');
    expect(r2.rating).toBe(0);
    expect(r2.content).toBe('豆瓣同步的短评节选，没给分。');
    expect(r2.readCount).toBe(89);
    expect(r2.source).toBe('');
    expect(r2.usefulCount).toBe(0);
    expect(r2.uselessCount).toBe(0);
    expect(r2.posterUrl).toBe(
      'https://img9.doubanio.com/view/photo/s_ratio_poster/p2870827646.jpg',
    );
  });

  test('paginator — thispage/数字页/后页；无 prev span → prevPageUrl 空', () => {
    mount();
    const d = extract();
    expect(d.pageLinks).toEqual([
      { label: '1', url: '', current: true },
      { label: '2', url: `${PAGE_URL}?p=2`, current: false },
    ]);
    expect(d.nextPageUrl).toBe(`${PAGE_URL}?p=2`);
    expect(d.prevPageUrl).toBe('');
  });

  test('edge — "|" 分隔符锚点被过滤（mutation：注入锚点版分隔符）', () => {
    const doc = mount();
    const li = doc.createElement('li');
    li.innerHTML = '<a href="https://movie.douban.com/people/unforgetmemory/">|</a>';
    doc.querySelector('#db-usr-profile .info ul')?.appendChild(li);
    expect(extract().navLinks.map((n) => n.label)).not.toContain('|');
  });

  test('body 级兜底 — 无 .grid-16-8 外壳时仍能经 body 扫描取回 2 条', () => {
    const doc = mount();
    // 主路径依赖 #db-usr-profile.closest(.grid-16-8)；抹掉类名逼出 fallback 分支
    doc.querySelector('.grid-16-8')?.classList.remove('grid-16-8');
    const d = extract();
    expect(d.items.map((i) => i.id)).toEqual(['3666098', '3600001']);
  });

  test('空列表 — items 为 0 但 h1 计数 > 0 → 返回空 items（不误报 null）', () => {
    const doc = mount();
    doc.querySelectorAll('ul.item-list').forEach((ul) => ul.remove());
    const d = extract();
    expect(d.items).toEqual([]);
    expect(d.total).toBe(3);
  });

  test('空列表回退 — items 与 total 同时为 0 → null（documented fallback）', () => {
    const doc = mount();
    doc.querySelectorAll('ul.item-list').forEach((ul) => ul.remove());
    const h1 = doc.querySelector('#db-usr-profile .info h1');
    if (h1) h1.textContent = 'UnforgetMemory的影评(0)';
    expect(extractUserReviewsData()).toBeNull();
  });
});
