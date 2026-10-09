import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';
import { JSDOM } from 'jsdom';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractReviewDetailData } from '@/scenario/douban/pages/review-detail/review-detail-data';
import type { ReviewDetailData } from '@/scenario/douban/pages/review-detail/types';

// Installs happen inside tests below; register this file's sandbox hooks at module scope.
initFileSandbox();

/**
 * review-detail（movie.douban.com/review/{id}）数据提取单元测试（X11-2 覆盖波）。
 *
 * 夹具 tests/fixtures/douban/review-detail.html 复刻豆瓣影评详情页契约：
 * header.main-hd（v:summary 标题 / author-avatar / main-meta）、全站首个
 * [class*="allstar"] 作评分、.review-content.clearfix 段落、.main-author 阅读数与
 * 来源、.btn.useful_count/.useless_count、侧栏 .subject-info 影人条目。
 * 侧栏条目字段走 key.includes(...) 前缀匹配，故只断言本页声明的 5 个键。
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(HERE, '../fixtures/douban/review-detail.html');
const REVIEW_URL = 'https://movie.douban.com/review/26732313/';

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

test.describe('review-detail 数据提取', () => {
  test('完整影评页：id/正文/侧栏条目字段全量提取', () => {
    mountFixture(REVIEW_URL);
    const data = extractReviewDetailData() as ReviewDetailData;

    expect(data).not.toBeNull();
    expect(data.id).toBe('26732313');
    expect(data.reviewUrl).toBe(REVIEW_URL);
    expect(data.title).toBe('科幻的骨架，情感的血肉');

    expect(data.authorName).toBe('UnforgetMemory');
    expect(data.authorId).toBe('unforgetmemory');
    expect(data.authorUrl).toBe('https://movie.douban.com/people/unforgetmemory/');
    expect(data.avatarUrl).toBe('https://img3.doubanio.com/icon/u150361821-2.jpg');

    expect(data.rating).toBe(4);
    expect(data.date).toBe('2023-02-11 18:24:03');
    expect(data.location).toBe('(上海)');

    // 空 <p> 被丢弃；正文只用 textContent（内链/强调不泄漏成 HTML）
    expect(data.paragraphs).toEqual([
      '先说结论：第二部把第一部的设定债全部还上了。',
      '数字生命那条线本来最容易失控，图恒宇的处理却收得很紧。',
      '配乐在月球段落里几乎抢了台词。',
    ]);

    expect(data.readCount).toBe(1847);
    expect(data.source).toBe('来自 Android客户端');
    expect(data.usefulCount).toBe(86);
    expect(data.uselessCount).toBe(3);

    expect(data.posterUrl).toBe(
      'https://img1.doubanio.com/view/photo/s_ratio_poster/public/p2887380238.jpg',
    );
    // 侧栏标题带站内的 "&gt; " 前缀，提取时剥掉
    expect(data.subjectTitle).toBe('流浪地球2');
    expect(data.subjectUrl).toBe('https://movie.douban.com/subject/35466880/');
    expect(data.director).toBe('郭帆');
    expect(data.cast).toBe('吴京 / 刘德华 / 李雪健');
    expect(data.genre).toBe('科幻 / 冒险 / 灾难');
    expect(data.region).toBe('中国大陆');
    expect(data.releaseDate).toBe('2023-01-22(中国大陆)');
  });

  test('非影评 URL（无 /review/{id}）→ null', () => {
    mountFixture('https://movie.douban.com/subject/35466880/reviews');
    expect(extractReviewDetailData()).toBeNull();
  });

  test('无评分星节点 → rating 0', () => {
    const doc = mountFixture(REVIEW_URL);
    doc.querySelector('[class*="allstar"]')?.remove();
    expect(extractReviewDetailData()?.rating).toBe(0);
  });

  test('main-meta 只有日期 span（无 IP 归属地）→ location 空串', () => {
    const doc = mountFixture(REVIEW_URL);
    doc.querySelector('.main-meta .ip-location')?.remove();
    doc.querySelector('.main-meta .user-rating')?.remove();
    const data = extractReviewDetailData() as ReviewDetailData;

    // last-child 落回日期本身，与 date 同值即视为无归属地
    expect(data.date).toBe('2023-02-11 18:24:03');
    expect(data.location).toBe('');
  });

  test('main-meta 无 [content] 时间节点 → date 空串（textContent 兜底分支不可达）', () => {
    const doc = mountFixture(REVIEW_URL);
    // 选择器本身要求 span[content]；抹掉属性后该节点不再被选中，
    // 因此 dateEl 为 null，代码里的 textContent 兜底永远走不到（已作为可疑点上报）
    doc.querySelector('.main-meta span[content]')?.removeAttribute('content');
    const data = extractReviewDetailData() as ReviewDetailData;

    expect(data.date).toBe('');
    expect(data.id).toBe('26732313');
  });

  test('正文与统计块缺失 → 段落数组为空、阅读/点赞计数为 0、来源空串', () => {
    const doc = mountFixture(REVIEW_URL);
    doc.querySelector('.review-content.clearfix')?.remove();
    doc.querySelector('.main-author')?.remove();
    doc.querySelector('.btn.useful_count')?.remove();
    doc.querySelector('.btn.useless_count')?.remove();
    const data = extractReviewDetailData() as ReviewDetailData;

    expect(data.paragraphs).toEqual([]);
    expect(data.readCount).toBe(0);
    expect(data.source).toBe('');
    expect(data.usefulCount).toBe(0);
    expect(data.uselessCount).toBe(0);
    // 正文缺失不影响其余字段与 id 的提取
    expect(data.id).toBe('26732313');
    expect(data.title).toBe('科幻的骨架，情感的血肉');
  });

  test('侧栏条目缺失 → 条目字段全部空串（影评本体仍算有效）', () => {
    const doc = mountFixture(REVIEW_URL);
    doc.querySelector('.aside')?.remove();
    const data = extractReviewDetailData() as ReviewDetailData;

    expect(data.posterUrl).toBe('');
    expect(data.subjectTitle).toBe('');
    expect(data.subjectUrl).toBe('');
    expect(data.director).toBe('');
    expect(data.cast).toBe('');
    expect(data.genre).toBe('');
    expect(data.region).toBe('');
    expect(data.releaseDate).toBe('');
  });

  test('作者头像缺失 → avatarUrl/authorId/authorUrl 空串，rating 等不受影响', () => {
    const doc = mountFixture(REVIEW_URL);
    doc.querySelector('a.avatar.author-avatar')?.remove();
    const data = extractReviewDetailData() as ReviewDetailData;

    expect(data.avatarUrl).toBe('');
    expect(data.authorId).toBe('');
    expect(data.authorUrl).toBe('');
    expect(data.rating).toBe(4);
  });

  test('带来源查询串的分享链接：id 与 reviewUrl 各自保持原样', () => {
    const shared = `${REVIEW_URL}?_i=2&source=douban`;
    mountFixture(shared);
    const data = extractReviewDetailData() as ReviewDetailData;

    expect(data.id).toBe('26732313');
    expect(data.reviewUrl).toBe(shared);
  });
});
