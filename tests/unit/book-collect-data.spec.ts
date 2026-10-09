import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';

initFileSandbox();
import { JSDOM } from 'jsdom';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractBookCollectData } from '@/scenario/douban/pages/book-collect/book-collect-data';
import type { BookCollectData } from '@/scenario/douban/pages/book-collect/types';

/**
 * book-collect 数据提取单元测试（X11-2 覆盖波）。
 *
 * 夹具 tests/fixtures/douban/book-collect.html 复刻 book.douban.com/people/{uid}/collect
 * 的 ul.interest-list > li.subject-item 契约；页面外壳（用户栏 / 排序 / subject-num /
 * paginator）经 extractCollectPageShell 复用，此处只锁定 book 页特有的字段映射与
 * 「无 subjectId 即跳过」「total 由末页反推」两条分支。
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(HERE, '../fixtures/douban/book-collect.html');
const COLLECT_URL =
  'https://book.douban.com/people/unforgetmemory/collect?sort=time&status=finish&mode=list';

/**
 * Mount the fixture as the ambient document — the extractor is a content-script
 * module that reads the global `document` by contract, so it cannot take a doc arg.
 */
function mountFixture(url: string): Document {
  const dom = new JSDOM(fs.readFileSync(FIXTURE, 'utf-8'), { url, runScripts: 'outside-only' });
  defineGlobal('window', dom.window);
  defineGlobal('document', dom.window.document);
  defineGlobal('location', dom.window.location);
  defineGlobal('Node', dom.window.Node);
  defineGlobal('Element', dom.window.Element);
  defineGlobal('HTMLElement', dom.window.HTMLElement);
  return dom.window.document as unknown as Document;
}

test.describe('book-collect 数据提取', () => {
  test('读过列表：外壳 + 三条书目字段全量提取', () => {
    mountFixture(COLLECT_URL);
    const data = extractBookCollectData() as BookCollectData;

    expect(data).not.toBeNull();
    expect(data.subType).toBe('collect');
    expect(data.userId).toBe('unforgetmemory');
    expect(data.displayName).toBe('UnforgetMemory');
    expect(data.avatarUrl).toBe('https://img3.doubanio.com/icon/u150361821-2.jpg');
    expect(data.navLinks.map((l) => l.label)).toEqual(['读过的 138', '想读的 62', '在读的 4']);
    expect(data.sortOptions).toEqual([
      { label: '按时间排序', url: '', active: true },
      {
        label: '按评分排序',
        // 排序链接保持 getAttribute 原值（相对 URL），调用方按当前页解析
        url: '?sort=rating',
        active: false,
      },
    ]);
    expect(data.currentPage).toBe('1-25');
    expect(data.total).toBe(138);
    expect(data.mode).toBe('list');

    // 已注销条目行（无 subject 链接）被跳过；侧栏推荐位不在 ul.interest-list 下
    expect(data.items.map((i) => i.subjectId)).toEqual(['6085146', '27087772', '3021615']);

    const huozhe = data.items[0]!;
    expect(huozhe.title).toBe('活着');
    expect(huozhe.url).toBe('https://book.douban.com/subject/6085146/');
    expect(huozhe.posterUrl).toBe('https://img1.doubanio.com/view/subject/s/public/s6384898.jpg');
    expect(huozhe.pubInfo).toBe('余华 / 作家出版社 / 2012-8 / 192 / 20.00元');
    expect(huozhe.date).toBe('2024-01-18 读过');
    expect(huozhe.comment).toBe('把苦难写到不动声色，福贵的每一次失去都算得清数目。');

    expect(data.prevPageUrl).toBe(
      'https://book.douban.com/people/unforgetmemory/collect?sort=time&status=finish&start=0',
    );
    expect(data.nextPageUrl).toBe(
      'https://book.douban.com/people/unforgetmemory/collect?sort=time&status=finish&start=25',
    );
  });

  test('paginator 页码链接为浏览器解析后的绝对地址', () => {
    mountFixture(COLLECT_URL);
    const data = extractBookCollectData() as BookCollectData;

    expect(data.pageLinks).toEqual([
      { label: '1', url: '', current: true },
      {
        label: '2',
        url: 'https://book.douban.com/people/unforgetmemory/collect?sort=time&status=finish&start=25',
        current: false,
      },
      {
        label: '3',
        url: 'https://book.douban.com/people/unforgetmemory/collect?sort=time&status=finish&start=50',
        current: false,
      },
    ]);
  });

  test('status 变体：/wish → wish、/do → doing（URL 为唯一判据）', () => {
    mountFixture('https://book.douban.com/people/unforgetmemory/wish?sort=time');
    expect(extractBookCollectData()?.subType).toBe('wish');

    mountFixture('https://book.douban.com/people/unforgetmemory/do?sort=time');
    expect(extractBookCollectData()?.subType).toBe('doing');
  });

  test('字段回落：链接无 title 属性时取 textContent；无 short-note 时日期/短评为空', () => {
    mountFixture(COLLECT_URL);
    const data = extractBookCollectData() as BookCollectData;

    // 房思琪：anchor 无 title 属性 → textContent 兜底；short-note 只有日期
    const fangsiqi = data.items.find((i) => i.subjectId === '27087772');
    expect(fangsiqi?.title).toBe('房思琪的初恋乐园');
    expect(fangsiqi?.date).toBe('2023-11-02 读过');
    expect(fangsiqi?.comment).toBe('');

    // 百年孤独：只做了标记
    const bainian = data.items.find((i) => i.subjectId === '3021615');
    expect(bainian?.date).toBe('');
    expect(bainian?.comment).toBe('');
    expect(bainian?.pubInfo).toBe('加西亚·马尔克斯 / 范晔 / 南海出版公司 / 2011-6 / 360 / 39.50元');
  });

  test('无封面 img 的条目 posterUrl 为空串（不抛错）', () => {
    const doc = mountFixture(COLLECT_URL);
    doc.querySelector('li.subject-item .pic .nbg img')?.remove();
    const data = extractBookCollectData() as BookCollectData;

    expect(data.items[0]?.posterUrl).toBe('');
    expect(data.items[0]?.subjectId).toBe('6085146');
  });

  test('有书目但无 .subject-num / h1 计数 → 由末页 start 反推 total', () => {
    const doc = mountFixture(COLLECT_URL);
    doc.querySelector('.subject-num')?.remove();
    const data = extractBookCollectData() as BookCollectData;

    // 末页 pageLinks 最后一项 start=50 + 当前页 3 条 = 53
    expect(data.total).toBe(53);
    expect(data.currentPage).toBe('');
  });

  test('.subject-num 有计数却一条书目都没渲染 → null（交给 withRetry 重试）', () => {
    const doc = mountFixture(COLLECT_URL);
    doc.querySelectorAll('ul.interest-list > li.subject-item').forEach((li) => li.remove());
    expect(extractBookCollectData()).toBeNull();
  });

  test('空书架（无条目且 total=0）→ 合法空结果而非 null', () => {
    const doc = mountFixture(COLLECT_URL);
    doc.querySelectorAll('ul.interest-list > li.subject-item').forEach((li) => li.remove());
    doc.querySelector('.subject-num')?.remove();
    doc.querySelector('.paginator')?.remove();
    const data = extractBookCollectData() as BookCollectData;

    expect(data).not.toBeNull();
    expect(data.items).toEqual([]);
    expect(data.total).toBe(0);
    expect(data.pageLinks).toEqual([]);
    expect(data.prevPageUrl).toBe('');
    expect(data.nextPageUrl).toBe('');
  });

  test('视图开关 .grid-on 存在 → mode=grid', () => {
    const doc = mountFixture(COLLECT_URL);
    const toggle = doc.querySelector('.view-toggle');
    const gridOn = doc.createElement('span');
    gridOn.className = 'grid-on';
    toggle?.appendChild(gridOn);
    expect(extractBookCollectData()?.mode).toBe('grid');
  });
});
