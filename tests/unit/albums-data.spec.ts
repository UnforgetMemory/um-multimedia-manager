import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';

initFileSandbox();
import { JSDOM } from 'jsdom';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractAlbumsData } from '@/scenario/douban/pages/albums/albums-data';

/**
 * albums（音乐版本列表页）数据提取单元测试（X11-5a 行为锁定）。
 *
 * 夹具 albums.html 复刻 music.douban.com/albums/{id} 的 DOM 形态
 * （li.dlist 数字 id、img.cover 懒加载、a.pl2、p.pl、.star pl 人数、allstarNN）。
 * 模块直接读取全局 document，故先安装 JSDOM 全局
 * （precedent: doulist-dialog-render.spec.ts）。
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HTML = fs.readFileSync(path.resolve(HERE, '../fixtures/douban/albums.html'), 'utf-8');

const BASE_URL = 'https://music.douban.com/albums/5860000';

function domAt(url: string): Document {
  const dom = new JSDOM(HTML, { url, runScripts: 'outside-only' });
  defineGlobal('window', dom.window);
  defineGlobal('document', dom.window.document);
  defineGlobal('location', dom.window.location);
  return dom.window.document;
}

type PageData = NonNullable<ReturnType<typeof extractAlbumsData>>;

test.describe('albums 版本列表提取', () => {
  test('专辑标题 + 3 个有效版本（垃圾 li 全部跳过）', () => {
    domAt(BASE_URL);
    const data = extractAlbumsData();
    expect(data).not.toBeNull();
    const d = data as PageData;

    expect(d.albumTitle).toBe('夜航班 Night Flight');
    // 无 id / 非数字 id / 无 a.pl2 的三个 li 均被过滤
    expect(d.versions.length).toBe(3);
    expect(d.versions.map((v) => v.id)).toEqual([5860001, 5860002, 5860003]);
  });

  test('完整版本项：副标题/封面/摘要/评分/人数/allstar 星级', () => {
    domAt(BASE_URL);
    const d = extractAlbumsData() as PageData;
    const cd = d.versions[0];
    expect(cd).toBeDefined();
    // title 是 a.pl2 的完整 textContent（含内嵌副标题 span），subTitle 单列
    expect(cd?.title).toBe('夜航班 Night Flight[CD首版]');
    expect(cd?.subTitle).toBe('[CD首版]');
    expect(cd?.url).toBe('https://music.douban.com/subject/5860001/');
    expect(cd?.coverUrl).toBe('https://img1.doubanio.com/view/subject/m/public/s5860001.jpg');
    expect(cd?.abstract).toBe(
      '表演者: 星云乐团 / 发行时间: 2024-11-08 / 出版者: 星岛唱片 / 介质: CD / 条形码: 9787881234567',
    );
    expect(cd?.ratingValue).toBe(8.9);
    expect(cd?.ratingCount).toBe(277);
    // allstar45 → 45/10 = 4.5（五星制）
    expect(cd?.ratingStars).toBe(4.5);
  });

  test('懒加载封面：无 src 属性 → data-original 回落；无 rating_num → 0（边界）', () => {
    domAt(BASE_URL);
    const d = extractAlbumsData() as PageData;
    const lp = d.versions[1];
    expect(lp).toBeDefined();
    expect(lp?.coverUrl).toBe('https://img2.doubanio.com/view/subject/m/public/s5860002.jpg');
    // 无小字号 span → 副标题空
    expect(lp?.subTitle).toBe('');
    // 无 .rating_num → ratingValue 0；.star pl 仍给出计数
    expect(lp?.ratingValue).toBe(0);
    expect(lp?.ratingCount).toBe(12);
    expect(lp?.ratingStars).toBe(5);
  });

  test('千分位人数解析；无 allstar 星级元素 → stars 0（边界）', () => {
    domAt(BASE_URL);
    const d = extractAlbumsData() as PageData;
    const digital = d.versions[2];
    expect(digital?.ratingValue).toBe(7.2);
    // "(1,560人评价)" 逗号清洗
    expect(digital?.ratingCount).toBe(1560);
    expect(digital?.ratingStars).toBe(0);
  });
});

test.describe('albums 整体兜底', () => {
  test('h1 缺失 → null（无专辑标题）', () => {
    const doc = domAt(BASE_URL);
    doc.querySelector('h1')?.remove();
    expect(extractAlbumsData()).toBeNull();
  });

  test('无任何有效版本 → null', () => {
    const doc = domAt(BASE_URL);
    doc.querySelectorAll('li.dlist').forEach((li) => li.remove());
    expect(extractAlbumsData()).toBeNull();
  });

  test('空壳页面（无 h1 无列表）→ null', () => {
    // 与夹具完全不同的最小 DOM：验证函数对任意无结构页面的健壮性
    const dom = new JSDOM('<!doctype html><html><body><div id="footer"></div></body></html>', {
      url: BASE_URL,
    });
    defineGlobal('window', dom.window);
    defineGlobal('document', dom.window.document);
    defineGlobal('location', dom.window.location);
    expect(extractAlbumsData()).toBeNull();
  });
});
