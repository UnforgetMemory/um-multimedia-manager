import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';

initFileSandbox();
import { JSDOM } from 'jsdom';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractBookReviewsData } from '@/scenario/douban/pages/book-reviews/book-reviews-data';

/**
 * book-reviews（用户书评列表页）数据提取单元测试（X11-5a 行为锁定）。
 *
 * 夹具 book-reviews.html 复刻 book.douban.com/people/{uid}/reviews 的 DOM 形态
 * （#db-usr-profile + .article > div > .tlst + .paginator）。模块直接读取全局
 * document/window，故先安装 JSDOM 全局（precedent: doulist-dialog-render.spec.ts）。
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HTML = fs.readFileSync(path.resolve(HERE, '../fixtures/douban/book-reviews.html'), 'utf-8');

const BASE_URL = 'https://book.douban.com/people/reader01/reviews';

function domAt(url: string): Document {
  const dom = new JSDOM(HTML, { url, runScripts: 'outside-only' });
  defineGlobal('window', dom.window);
  defineGlobal('document', dom.window.document);
  defineGlobal('location', dom.window.location);
  return dom.window.document;
}

type ReviewsData = NonNullable<ReturnType<typeof extractBookReviewsData>>;

test.describe('book-reviews 用户信息与汇总', () => {
  test('userId/显示名/头像/总数/导航链接', () => {
    domAt(BASE_URL);
    const data = extractBookReviewsData();
    expect(data).not.toBeNull();
    const d = data as ReviewsData;

    expect(d.userId).toBe('reader01');
    expect(d.displayName).toBe('读书的小林');
    expect(d.avatarUrl).toBe('https://img1.doubanio.com/icon/ur765432-20.jpg');
    // h1 "我的书评(12)" → total
    expect(d.total).toBe(12);
    // 无 a 的 li.sep 天然不进 navLinks
    expect(d.navLinks).toEqual([
      { label: '主页', url: 'https://book.douban.com/people/reader01/' },
      { label: '书评', url: 'https://book.douban.com/people/reader01/reviews' },
    ]);
  });

  test('分页器：thispage + 相对 ?sort&page 链接解析', () => {
    domAt(BASE_URL);
    const d = extractBookReviewsData() as ReviewsData;
    expect(d.pageLinks).toEqual([
      { label: '1', url: '', current: true },
      { label: '2', url: `${BASE_URL}?sort=time&page=2`, current: false },
      { label: '3', url: `${BASE_URL}?sort=time&page=3`, current: false },
    ]);
    expect(d.prevPageUrl).toBe('');
    expect(d.nextPageUrl).toBe(`${BASE_URL}?sort=time&page=2`);
  });
});

test.describe('book-reviews 条目提取', () => {
  test('完整书评：标题/链接/图书/星级/阅读数/来源/有用数', () => {
    domAt(BASE_URL);
    const d = extractBookReviewsData() as ReviewsData;
    // 推广位 .tlst 无 review id → 跳过
    expect(d.items.length).toBe(3);

    const first = d.items[0];
    expect(first).toBeDefined();
    expect(first?.id).toBe('42831570');
    expect(first?.title).toBe('荔枝里的驿路程序');
    expect(first?.reviewUrl).toBe('https://book.douban.com/review/42831570/');
    expect(first?.posterUrl).toBe('https://img3.doubanio.com/view/subject/l/public/s36185161.jpg');
    expect(first?.subjectUrl).toBe('https://book.douban.com/subject/36185161/');
    expect(first?.subjectTitle).toBe('长安的荔枝');
    // allstar40 → 4（五星制，parseRating 语义）
    expect(first?.rating).toBe(4);
    expect(first?.content).toBe('马伯庸把小吏写成了主角，驿路即程序，荔枝即 KPI。');
    expect(first?.authorName).toBe('读书的小林');
    expect(first?.usefulCount).toBe(120);
    expect(first?.uselessCount).toBe(3);
    expect(first?.readCount).toBe(1456);
    expect(first?.source).toBe('来自：本站');
  });

  test('全文态书评：.review-content p 优先；无 allstar → rating 0；相对标题链接解析（边界）', () => {
    domAt(BASE_URL);
    const d = extractBookReviewsData() as ReviewsData;
    const full = d.items.find((r) => r.id === '41000000');
    expect(full).toBeDefined();
    expect(full?.title).toBe('冰与海的边界');
    expect(full?.reviewUrl).toBe('https://book.douban.com/review/41000000/');
    expect(full?.rating).toBe(0);
    expect(full?.content).toBe('第一章的隐喻铺陈得极慢，像潮汐一样反复，直到最后一页才收束。');
    // 无 .ilst → 封面与图书字段回落空串
    expect(full?.posterUrl).toBe('');
    expect(full?.subjectUrl).toBe('');
    expect(full?.subjectTitle).toBe('');
    expect(full?.readCount).toBe(88);
    expect(full?.source).toBe('');
  });

  test('极简书评：作者回落 displayName；短内容 span；无任何计数（边界）', () => {
    domAt(BASE_URL);
    const d = extractBookReviewsData() as ReviewsData;
    const minimal = d.items.find((r) => r.id === '39900001');
    expect(minimal).toBeDefined();
    expect(minimal?.title).toBe('读卡机之死');
    expect(minimal?.authorName).toBe('读书的小林');
    expect(minimal?.content).toBe('关于媒介考古的一篇短记。');
    expect(minimal?.rating).toBe(0);
    expect(minimal?.usefulCount).toBe(0);
    expect(minimal?.uselessCount).toBe(0);
    expect(minimal?.readCount).toBe(0);
    expect(minimal?.source).toBe('');
  });
});

test.describe('book-reviews 容器回退与整体兜底', () => {
  test('无 .tlst 类名时经 .article > div 回退发现评论容器', () => {
    const doc = domAt(BASE_URL);
    // 模拟无 .tlst 类名但有 .review-* 结构的变体版式
    doc.querySelectorAll('.tlst').forEach((el) => {
      el.className = 'review-box';
    });
    expect(doc.querySelectorAll('.tlst').length).toBe(0);
    const d = extractBookReviewsData() as ReviewsData;
    // 推广位容器无 review 特征子节点，仍被过滤
    expect(d.items.length).toBe(3);
    expect(d.items.map((r) => r.id)).toEqual(['42831570', '41000000', '39900001']);
  });

  test('无条目但 h1 有总数 → 返回 total + 空列表（文档化兜底）', () => {
    const doc = domAt(BASE_URL);
    doc.querySelectorAll('.tlst').forEach((el) => el.remove());
    const d = extractBookReviewsData() as ReviewsData;
    expect(d.total).toBe(12);
    expect(d.items).toEqual([]);
  });

  test('无条目且无总数 → null（非书评页兜底）', () => {
    const doc = domAt(BASE_URL);
    doc.querySelectorAll('.tlst').forEach((el) => el.remove());
    const h1 = doc.querySelector('#db-usr-profile .info h1');
    if (h1) h1.textContent = '我的书房';
    expect(extractBookReviewsData()).toBeNull();
  });

  test('URL 不含 /people/ → userId 空串但列表仍提取（文档化行为）', () => {
    domAt('https://book.douban.com/review/42831570/');
    const d = extractBookReviewsData() as ReviewsData;
    expect(d.userId).toBe('');
    expect(d.items.length).toBe(3);
  });
});
