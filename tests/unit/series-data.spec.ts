import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';
import { JSDOM, type DOMWindow } from 'jsdom';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import locales from '@/entrypoints/content/i18n/locales';
import { extractSeriesData } from '@/scenario/douban/pages/series/data';

// Installs happen inside tests below; register this file's sandbox hooks at module scope.
initFileSandbox();

/**
 * series/data.ts behavior lock (X11-G) — book.douban.com/series/{id}/ page.
 *
 * Fixture tests/fixtures/douban/series-list.html reproduces the header meta,
 * subject-list cards (s→l cover upgrade, rating parse, skip edges) and the
 * rich .paginator delegated to parseDoubanPaginatorDetail. location.search
 * drives sort-option activation → remount per URL.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));

function mount(url: string): Document {
  const dom: DOMWindow = new JSDOM(
    fs.readFileSync(path.resolve(HERE, '../fixtures/douban/series-list.html'), 'utf-8'),
    { url },
  ).window;
  defineGlobal('window', dom);
  defineGlobal('document', dom.document);
  defineGlobal('location', dom.location);
  defineGlobal('Node', dom.Node);
  return dom.document;
}

const BASE = 'https://book.douban.com/series/16390/';

test.describe('series 页头与 URL', () => {
  test('happy path: id/标题/出版社/册数/简介全量抽中', () => {
    mount(BASE);
    const data = extractSeriesData();
    if (!data) throw new Error('series page must not extract to null');

    expect(data.id).toBe('16390');
    expect(data.title).toBe('译文经典');
    expect(data.publisher).toBe('文汇出版社');
    expect(data.volumes).toBe(12); // .clear-both 的 `册数: N`
    expect(data.description).toBe('一套跨越六十年的世界文学丛书，收入多种传世译本。');
  });

  test('URL 无 /series/{数字} → null（挂载守卫）', () => {
    mount('https://book.douban.com/subject/26800001/');
    expect(extractSeriesData()).toBeNull();
  });

  test('edge: 缺 .clear-both / 简介 h2 → volumes 0 + description 空串（页数据仍成立）', () => {
    const doc = mount(BASE);
    doc.querySelector('.clear-both')?.remove();
    doc.querySelectorAll('h2').forEach((h) => {
      if (h.textContent?.includes('简介')) h.remove();
    });
    const data = extractSeriesData();
    expect(data?.volumes).toBe(0);
    expect(data?.description).toBe('');
  });

  test('排序项激活态由 order 查询参数决定，url 取 pathname 前缀', () => {
    mount(BASE);
    const def = extractSeriesData()?.sortOptions;
    expect(def).toEqual([
      { labelKey: 'douban.series.sort_collection', url: '/series/16390/', active: true },
      { labelKey: 'douban.series.sort_time', url: '/series/16390/?order=time', active: false },
    ]);

    mount(`${BASE}?order=time`);
    const byTime = extractSeriesData()?.sortOptions;
    expect(byTime?.[0]?.active).toBe(false);
    expect(byTime?.[1]?.active).toBe(true);
  });

  test('X108 键 ↔ 文案配对：两条排序键在 zh-CN 词典里解析为原可见串（换键即红）', () => {
    expect(locales['zh-CN']['douban.series.sort_collection']).toBe('按收藏人数排序');
    expect(locales['zh-CN']['douban.series.sort_time']).toBe('按出版时间先后排序');
  });
});

test.describe('series 书目卡片', () => {
  test('3 个有效项：相对链接补域名、s/ 缩略升 l/、绝对 doubanio 原样', () => {
    mount(BASE);
    const items = extractSeriesData()?.items ?? [];
    expect(items.map((i) => i.subjectId)).toEqual(['26800001', '26800002', '26800003']);

    const first = items[0];
    expect(first?.title).toBe('百年之期');
    expect(first?.subjectUrl).toBe('https://book.douban.com/subject/26800001/');
    // 相对 src 经浏览器解析后 /view/subject/s/ → /l/
    expect(first?.coverUrl).toBe('https://book.douban.com/view/subject/l/26800001.jpg');
    expect(first?.pubInfo).toBe('[美] 作者甲 / 文汇出版社 / 2021-3 / 68.00元');
    expect(first?.description).toBe('一部关于时间与社会记忆的小说。');

    // 已是绝对 http(s) → 不重复补前缀；doubanio cover_l 不在升级规则内（现状锁定）
    const second = items[1];
    expect(second?.subjectUrl).toBe('https://book.douban.com/subject/26800002/');
    expect(second?.coverUrl).toBe('https://img3.doubanio.com/view/cover_l/public/p26800002.jpg');

    // 无 .rating_nums → rating/ratingCount 双双 0（pl 有文字也不读）
    expect(items[2]?.rating).toBe(0);
    expect(items[2]?.ratingCount).toBe(0);
  });

  test('评分：小数分值 + 千分位人数；纯数字人数直取', () => {
    mount(BASE);
    const items = extractSeriesData()?.items ?? [];
    expect(items[0]?.rating).toBe(8.7);
    expect(items[0]?.ratingCount).toBe(1234); // '(1,234人评价)' 逗号剥离
    expect(items[1]?.rating).toBe(9.1);
    expect(items[1]?.ratingCount).toBe(3);
  });

  test('跳过项：缺 .pic a.nbg 与链接无 subject 数字均不入表', () => {
    mount(BASE);
    const items = extractSeriesData()?.items ?? [];
    expect(items).toHaveLength(3);
    expect(items.some((i) => i.title.includes('跳过'))).toBe(false);
  });

  test('edge: rating_nums 非数字文本 → parseFloat NaN 归 0', () => {
    const doc = mount(BASE);
    const nums = doc.querySelector('.rating_nums');
    if (nums) nums.textContent = 'N/A';
    expect(extractSeriesData()?.items[0]?.rating).toBe(0);
  });
});

test.describe('series 分页（委托 parseDoubanPaginatorDetail）', () => {
  test('多页：currentPage/totalPages 取 thispage，页码数字升序，totalCount 估算', () => {
    mount(`${BASE}?order=time`);
    const data = extractSeriesData();
    expect(data?.paginator).toEqual({
      currentPage: 2,
      totalPages: 3,
      // 相对 ?start=N 经浏览器按当前 URL 解析
      prevUrl: 'https://book.douban.com/series/16390/?start=0',
      nextUrl: 'https://book.douban.com/series/16390/?start=50',
      pages: [
        { label: '1', url: 'https://book.douban.com/series/16390/?start=0', current: false },
        { label: '2', url: '', current: true },
        { label: '3', url: 'https://book.douban.com/series/16390/?start=50', current: false },
      ],
    });
    // totalPages>1 → 页数 × 本页条数（3 × 3）
    expect(data?.totalCount).toBe(9);
  });

  test('无 paginator → 默认单页，totalCount 回退本页条数', () => {
    const doc = mount(BASE);
    doc.querySelector('.paginator')?.remove();
    const data = extractSeriesData();
    expect(data?.paginator.currentPage).toBe(1);
    expect(data?.paginator.totalPages).toBe(1);
    expect(data?.paginator.pages).toEqual([]);
    expect(data?.totalCount).toBe(3);
  });
});
