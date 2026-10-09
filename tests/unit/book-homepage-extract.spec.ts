import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';

initFileSandbox();
import { JSDOM } from 'jsdom';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseBookExpress,
  parsePopularBooks,
  parseBookActivities,
} from '@/scenario/douban/pages/book-homepage/book-homepage-extract';

/**
 * book-homepage-extract behavior lock (book.douban.com/ overlay).
 *
 * Fixture tests/fixtures/douban/book-homepage.html reproduces the three
 * native homepage sections (.section.books-express, .section.popular-books,
 * .section.books-activities). The module reads the global `document`, so
 * each test installs a fresh JSDOM as globalThis document/window/location.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(HERE, '../fixtures/douban/book-homepage.html');

// Origin matters: sanitizeHref resolves relative hrefs against window.location.origin.
function mountFixture(url = 'https://book.douban.com/'): void {
  const html = fs.readFileSync(FIXTURE, 'utf-8');
  const dom = new JSDOM(html, { url, runScripts: 'outside-only' });
  defineGlobal('window', dom.window);
  defineGlobal('document', dom.window.document);
  defineGlobal('location', dom.window.location);
}

function mountBlank(): void {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://book.douban.com/',
    runScripts: 'outside-only',
  });
  defineGlobal('window', dom.window);
  defineGlobal('document', dom.window.document);
  defineGlobal('location', dom.window.location);
}

test.describe('parseBookExpress — 新书速递 .list-express li', () => {
  test('happy path: title/author/cover/year/publisher, rate always empty by design', () => {
    mountFixture();
    const items = parseBookExpress();
    expect(items.map((i) => i.subjectId)).toEqual(['37110001', '37110002', '37110003']);

    const first = items[0]!;
    expect(first.title).toBe('晚祷的钟声'); // from a[title] attribute
    expect(first.author).toBe('[日] 山崎芙由 著');
    expect(first.coverUrl).toBe('https://img1.doubanio.com/view/cover_s/public/p37110001.jpg');
    expect(first.posterUrl).toBe(first.coverUrl);
    expect(first.href).toBe('https://book.douban.com/subject/37110001/');
    expect(first.year).toBe('2026-8');
    expect(first.publisher).toBe('潮汐出版社');
    expect(first.rate).toBe('');
  });

  test('edge: title falls back to textContent; missing more-meta → undefined fields', () => {
    mountFixture();
    const items = parseBookExpress();

    const second = items[1]!;
    expect(second.title).toBe('盐的路线'); // no a[title] → textContent fallback
    expect(second.year).toBe('2026-7');
    expect(second.publisher).toBe('山河书局');

    const third = items[2]!;
    expect(third.title).toBe('夜航西飞新注');
    expect(third.author).toBe('');
    expect(third.year).toBeUndefined();
    expect(third.publisher).toBeUndefined();
  });

  test('edge: li without cover link skipped; duplicate subjectId deduplicated', () => {
    mountFixture();
    const items = parseBookExpress();
    expect(items.length).toBe(3); // promo li and duplicated 37110001 dropped
  });

  test('fallback: blank DOM yields empty array', () => {
    mountBlank();
    expect(parseBookExpress()).toEqual([]);
  });
});

test.describe('parsePopularBooks — 每月热门图书榜 .list-summary li', () => {
  test('happy path: rank, trend, prevRank, author prefix stripped, tags', () => {
    mountFixture();
    const items = parsePopularBooks();
    expect(items.map((i) => i.rank)).toEqual([1, 2, 3]);

    const first = items[0]!;
    expect(first.subjectId).toBe('36990001');
    expect(first.title).toBe('静默的河床');
    expect(first.author).toBe('林萌'); // '作者：林萌' → prefix stripped
    expect(first.rating).toBe('8.7');
    expect(first.trend).toBe('up');
    expect(first.prevRank).toBe(3);
    expect(first.tags).toEqual(['小说', '乡土']);
    expect(first.coverUrl).toBe('https://img9.doubanio.com/view/cover_s/public/p36990001.jpg');
    expect(first.href).toBe('https://book.douban.com/subject/36990001/');

    const second = items[1]!;
    expect(second.trend).toBe('down');
    expect(second.prevRank).toBe(1);
    expect(second.author).toBe('[美] R. D. Hart'); // half-width '作者:' also stripped
    expect(second.tags).toEqual(['科普']);
  });

  test('edge: trend new captured; missing rating and prevRank fall back to empty/undefined', () => {
    mountFixture();
    const items = parsePopularBooks();
    const third = items[2]!;
    expect(third.trend).toBe('new'); // .trend.new captured
    expect(third.prevRank).toBeUndefined();
    expect(third.rating).toBe('');
    expect(third.author).toBe('顾一帆'); // no prefix → untouched
    expect(third.tags).toEqual([]);
  });

  test('edge: li without green-num-box rank or without cover link skipped', () => {
    mountFixture();
    const items = parsePopularBooks();
    expect(items.length).toBe(3);
    expect(items.some((i) => i.title === '无名条目')).toBe(false);
    expect(items.some((i) => i.title === '没有封面')).toBe(false);
  });

  test('fallback: blank DOM yields empty array', () => {
    mountBlank();
    expect(parsePopularBooks()).toEqual([]);
  });
});

test.describe('parseBookActivities — 读书活动 a.book-activity', () => {
  test('happy path: title/label/date + background-image url extraction', () => {
    mountFixture();
    const items = parseBookActivities();
    expect(items.length).toBe(3);

    const first = items[0]!;
    expect(first.title).toBe('夏末读诗会 · 第三期');
    expect(first.href).toBe('https://book.douban.com/activity/1001/');
    expect(first.coverUrl).toBe('https://img1.doubanio.com/view/activity/photo/p1001_cover.jpg');
    expect(first.label).toBe('线上活动');
    expect(first.date).toBe('2026-08-22');

    // double-quoted url() variant
    expect(items[1]!.coverUrl).toBe(
      'https://img2.doubanio.com/view/activity/photo/p1002_cover.jpg',
    );
  });

  test('edge: activity without style/title → empty coverUrl/title but item kept', () => {
    mountFixture();
    const items = parseBookActivities();
    const third = items[2]!;
    expect(third.title).toBe('');
    expect(third.coverUrl).toBe('');
    expect(third.label).toBe('线下共读');
    expect(third.href).toBe('https://book.douban.com/activity/1003/');
  });

  test('edge: non-http href (javascript:;) skipped', () => {
    mountFixture();
    const items = parseBookActivities();
    expect(items.some((i) => i.title === '无效链接活动')).toBe(false);
  });

  test('fallback: blank DOM yields empty array', () => {
    mountBlank();
    expect(parseBookActivities()).toEqual([]);
  });
});
