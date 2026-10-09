import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';

initFileSandbox();
import { JSDOM } from 'jsdom';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseScreeningItems,
  parseBillboardItems,
  parseHotSection,
  parseReviewItems,
} from '@/scenario/douban/pages/homepage/homepage-extract';

/**
 * homepage-extract behavior lock (movie.douban.com/ overlay).
 *
 * Fixture tests/fixtures/douban/homepage.html reproduces the four native
 * sections the extractor queries: #screening .ui-slide-item carousel,
 * #billboard table, .recent-hot-movie/.recent-hot-tv swiper cards and
 * #reviews .review blocks. The module reads the global `document`, so each
 * test installs a fresh JSDOM as globalThis document/window/location.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(HERE, '../fixtures/douban/homepage.html');

function mountFixture(url = 'https://movie.douban.com/'): void {
  const html = fs.readFileSync(FIXTURE, 'utf-8');
  const dom = new JSDOM(html, { url, runScripts: 'outside-only' });
  defineGlobal('window', dom.window);
  defineGlobal('document', dom.window.document);
  defineGlobal('location', dom.window.location);
}

/** Minimal blank page — documents the empty-DOM fallbacks. */
function mountBlank(): void {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://movie.douban.com/',
    runScripts: 'outside-only',
  });
  defineGlobal('window', dom.window);
  defineGlobal('document', dom.window.document);
  defineGlobal('location', dom.window.location);
}

test.describe('parseScreeningItems — #screening .ui-slide-item', () => {
  test('happy path: data-* fields, dedup, duplicate-clone skip, group sort', () => {
    mountFixture();
    const items = parseScreeningItems();

    // group 0 items come first (stable sort), then group 1;
    // .ui-slide-item-duplicate clone, ad card without subject link and the
    // duplicate subjectId of 36770002 are all skipped → 4 items.
    expect(items.map((i) => i.subjectId)).toEqual(['36770003', '36770004', '36770001', '36770002']);

    const first = items[0]!;
    expect(first.groupIndex).toBe(0);
    expect(first.title).toBe('长夜将尽');
    expect(first.rate).toBe('8.4');
    expect(first.starNum).toBe('45');
    expect(first.intro).toBe('2026-07-31 上映');
    expect(first.posterUrl).toBe(
      'https://img3.doubanio.com/view/photo/s_ratio_poster/public/p2937700030.jpg',
    );
    // img without alt falls back to data-title
    expect(first.posterAlt).toBe('长夜将尽');
    expect(first.href).toBe('https://movie.douban.com/subject/36770003/');

    // item with explicit alt keeps it
    expect(items[2]!.posterAlt).toBe('海边的消息');
    expect(items[2]!.groupIndex).toBe(1);
  });

  test('edge: item without data-dstat-areaid inherits last group index', () => {
    mountFixture();
    const items = parseScreeningItems();
    const inherited = items.find((i) => i.subjectId === '36770004');
    expect(inherited?.groupIndex).toBe(0);
    // defaults when data attrs are absent
    expect(inherited?.starNum).toBe('00');
    expect(inherited?.rate).toBe('');
    expect(inherited?.intro).toBe('');
  });

  test('fallback: blank DOM yields empty array', () => {
    mountBlank();
    expect(parseScreeningItems()).toEqual([]);
  });
});

test.describe('parseBillboardItems — #billboard table tr', () => {
  test('happy path: order + title link, relative href resolved', () => {
    mountFixture();
    const items = parseBillboardItems();
    expect(items.length).toBe(2);

    const first = items[0]!;
    expect(first.order).toBe('1');
    expect(first.title).toBe('初步举证');
    expect(first.subjectId).toBe('36451002');
    expect(first.href).toBe('https://movie.douban.com/subject/36451002/');

    const second = items[1]!;
    expect(second.order).toBe('2');
    expect(second.title).toBe('坂本日常');
    expect(second.subjectId).toBe('26997634');
    expect(second.href).toBe('https://movie.douban.com/subject/26997634/');
  });

  test('edge: rows without td.order or without a subject id are skipped', () => {
    mountFixture();
    const items = parseBillboardItems();
    expect(items.some((i) => i.title === '无序号条目')).toBe(false);
    expect(items.some((i) => i.title === '2025 年度榜单')).toBe(false);
  });

  test('fallback: blank DOM yields empty array', () => {
    mountBlank();
    expect(parseBillboardItems()).toEqual([]);
  });
});

test.describe('parseHotSection — swiper .subject-card', () => {
  test('happy path: movie section extracts cards, skips clones/linkless', () => {
    mountFixture();
    const items = parseHotSection('.recent-hot-movie');
    expect(items.map((i) => i.subjectId)).toEqual(['36770101', '36770102']);

    const first = items[0]!;
    expect(first.title).toBe('暗涌');
    expect(first.rate).toBe('9.0');
    expect(first.href).toBe('https://movie.douban.com/subject/36770101/');
    expect(first.posterUrl).toBe(
      'https://img1.doubanio.com/view/photo/cover/s_public/p2937701010.jpg',
    );
    // movie cards carry no episodes node → key stays absent
    expect(first.episodes).toBeUndefined();

    // card without rating span → rate ''
    expect(items[1]!.rate).toBe('');
  });

  test('tv section: episodes info captured when present', () => {
    mountFixture();
    const items = parseHotSection('.recent-hot-tv');
    expect(items.length).toBe(1);
    expect(items[0]!.episodes).toBe('更新至第8集');
    expect(items[0]!.title).toBe('回廊亭案件簿');
  });

  test('edge: unknown selector (section not rendered) yields empty array', () => {
    mountFixture();
    expect(parseHotSection('.recent-hot-documentary')).toEqual([]);
  });

  test('fallback: blank DOM yields empty array', () => {
    mountBlank();
    expect(parseHotSection('.recent-hot-movie')).toEqual([]);
  });
});

test.describe('parseReviewItems — #reviews .review', () => {
  test('happy path: subject id + href from .review-hd a', () => {
    mountFixture();
    const items = parseReviewItems();
    expect(items).toEqual([
      { subjectId: '1292052', href: 'https://movie.douban.com/subject/1292052/' },
      { subjectId: '6874403', href: 'https://movie.douban.com/subject/6874403/' },
    ]);
  });

  test('edge: reviews without a subject link are skipped', () => {
    mountFixture();
    const items = parseReviewItems();
    // /review/xxx-only anchor and anchor-less review block both excluded
    expect(items.length).toBe(2);
  });

  test('fallback: blank DOM yields empty array', () => {
    mountBlank();
    expect(parseReviewItems()).toEqual([]);
  });
});
