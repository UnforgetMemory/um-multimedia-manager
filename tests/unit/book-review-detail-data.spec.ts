import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';

initFileSandbox();
import { JSDOM } from 'jsdom';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractBookReviewDetailData } from '@/scenario/douban/pages/book-review-detail/book-review-detail-data';
import type { BookReviewDetailData } from '@/scenario/douban/pages/book-review-detail/types';

/**
 * book-review-detail（book.douban.com/review/{id}）数据提取单元测试（X11-2 覆盖波）。
 *
 * 夹具 tests/fixtures/douban/book-review-detail.html 复刻豆瓣书评详情页契约：
 * header.main-hd（v:summary 标题 / author-avatar / main-meta）、全站首个
 * [class*="allstar"] 作评分（45 → 4.5）、.review-content.clearfix 段落、
 * .main-author 阅读数与来源、.btn.useful_count/.useless_count，
 * 侧栏 .subject-info 的 作者 / 出版社 / 页数 三键。
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(HERE, '../fixtures/douban/book-review-detail.html');
const REVIEW_URL = 'https://book.douban.com/review/15432198/';

/** The extractor reads `window.document` (content-script contract), so each case mounts its own DOM. */
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

test.describe('book-review-detail 数据提取', () => {
  test('完整书评页：id/正文/图书条目字段全量提取', () => {
    mountFixture(REVIEW_URL);
    const data = extractBookReviewDetailData() as BookReviewDetailData;

    expect(data).not.toBeNull();
    expect(data.id).toBe('15432198');
    expect(data.reviewUrl).toBe(REVIEW_URL);
    expect(data.title).toBe('市井话语里的时间刻度');

    expect(data.authorName).toBe('UnforgetMemory');
    expect(data.authorId).toBe('unforgetmemory');
    expect(data.authorUrl).toBe('https://book.douban.com/people/unforgetmemory/');
    expect(data.avatarUrl).toBe('https://img3.doubanio.com/icon/u150361821-2.jpg');

    // allstar45 → 4.5（半星档位）
    expect(data.rating).toBe(4.5);
    expect(data.date).toBe('2021-05-07 09:12:44');
    expect(data.location).toBe('(杭州)');

    // 末段是空 <p>，按约定丢弃
    expect(data.paragraphs).toEqual([
      '金宇澄把评话的口气缝进现代叙事，读起来像有人在耳边讲故事。',
      '不响不是沉默，是一种留白的叙事权。',
    ]);

    expect(data.readCount).toBe(632);
    expect(data.source).toBe('来自 读书号');
    expect(data.usefulCount).toBe(27);
    expect(data.uselessCount).toBe(1);

    expect(data.posterUrl).toBe('https://img1.doubanio.com/view/subject/s/public/s6941968.jpg');
    expect(data.subjectTitle).toBe('繁花');
    expect(data.subjectUrl).toBe('https://book.douban.com/subject/6781208/');
    expect(data.author).toBe('金宇澄');
    expect(data.publisher).toBe('上海文艺出版社');
    expect(data.pages).toBe('363');
  });

  test('URL 无 /review/{id} → null', () => {
    mountFixture('https://book.douban.com/review/');
    expect(extractBookReviewDetailData()).toBeNull();
  });

  test('分享链接带额外查询串：id 与正文解析不受影响', () => {
    mountFixture('https://book.douban.com/review/15432198/?_dt_uncomp=1&dt_ref=weixin');
    const data = extractBookReviewDetailData() as BookReviewDetailData;

    expect(data.id).toBe('15432198');
    expect(data.reviewUrl).toContain('?_dt_uncomp=1');
  });

  test('无评分星节点 → rating 0', () => {
    const doc = mountFixture(REVIEW_URL);
    doc.querySelector('[class*="allstar"]')?.remove();
    expect(extractBookReviewDetailData()?.rating).toBe(0);
  });

  test('main-meta 只有日期 span（无 IP 归属地）→ location 空串', () => {
    const doc = mountFixture(REVIEW_URL);
    doc.querySelector('.main-meta .ip-location')?.remove();
    doc.querySelector('.main-meta .user-rating')?.remove();
    const data = extractBookReviewDetailData() as BookReviewDetailData;

    expect(data.date).toBe('2021-05-07 09:12:44');
    expect(data.location).toBe('');
  });

  test('正文与统计块缺失 → 段落数组为空、阅读/有用数为 0', () => {
    const doc = mountFixture(REVIEW_URL);
    doc.querySelector('.review-content.clearfix')?.remove();
    doc.querySelector('.main-author')?.remove();
    doc.querySelector('.btn.useful_count')?.remove();
    doc.querySelector('.btn.useless_count')?.remove();
    const data = extractBookReviewDetailData() as BookReviewDetailData;

    expect(data.paragraphs).toEqual([]);
    expect(data.readCount).toBe(0);
    expect(data.source).toBe('');
    expect(data.usefulCount).toBe(0);
    expect(data.uselessCount).toBe(0);
    expect(data.id).toBe('15432198');
  });

  test('侧栏图书信息缺失 → 条目字段空串，正文照旧提取', () => {
    const doc = mountFixture(REVIEW_URL);
    doc.querySelector('.aside')?.remove();
    const data = extractBookReviewDetailData() as BookReviewDetailData;

    expect(data.posterUrl).toBe('');
    expect(data.subjectTitle).toBe('');
    expect(data.subjectUrl).toBe('');
    expect(data.author).toBe('');
    expect(data.publisher).toBe('');
    expect(data.pages).toBe('');
    expect(data.paragraphs).toHaveLength(2);
  });

  test('图书信息缺 作者/页数 键时对应字段留空（其余键不受影响）', () => {
    const doc = mountFixture(REVIEW_URL);
    doc.querySelectorAll('.subject-info .info-item').forEach((item) => {
      const key = item.querySelector('.info-item-key')?.textContent ?? '';
      if (key.includes('作者') || key.includes('页数')) item.remove();
    });
    const data = extractBookReviewDetailData() as BookReviewDetailData;

    expect(data.author).toBe('');
    expect(data.pages).toBe('');
    expect(data.publisher).toBe('上海文艺出版社');
  });

  test('标题节点缺失 → title 空串（页面仍返回数据对象）', () => {
    const doc = mountFixture(REVIEW_URL);
    doc.querySelector('h1 span[property="v:summary"]')?.remove();
    const data = extractBookReviewDetailData() as BookReviewDetailData;

    expect(data.title).toBe('');
    expect(data.id).toBe('15432198');
  });
});
