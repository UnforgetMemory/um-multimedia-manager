import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';
import { JSDOM } from 'jsdom';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractMusicCollectData } from '@/scenario/douban/pages/music-collect/music-collect-data';
import type { MusicCollectData } from '@/scenario/douban/pages/music-collect/types';

// Installs happen inside tests below; register this file's sandbox hooks at module scope.
initFileSandbox();

/**
 * music-collect 数据提取单元测试（X11-2 覆盖波）。
 *
 * 夹具 tests/fixtures/douban/music-collect.html 复刻 music.douban.com 网格标记列表的
 * .grid-view > .item.comment-item 契约：标题 `<em>专辑名</em> / 副标题`、
 * .ratingN-t 三档评分、.intro 短评、.date，以及 #user-id 隐藏域这一 /mine 专属 userId 来源。
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(HERE, '../fixtures/douban/music-collect.html');
const PEOPLE_URL = 'https://music.douban.com/people/unforgetmemory/collect?status=collect&mode=g';

/** The extractor reads the ambient `document` (content-script contract), so each case mounts its own DOM. */
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

test.describe('music-collect 数据提取', () => {
  test('听过列表（/people/{uid}/collect）：外壳 + 条目字段', () => {
    mountFixture(PEOPLE_URL);
    const data = extractMusicCollectData() as MusicCollectData;

    expect(data).not.toBeNull();
    expect(data.subType).toBe('collect');
    // URL 优先，#user-id 只是 /mine 的回落来源
    expect(data.userId).toBe('unforgetmemory');
    expect(data.displayName).toBe('UnforgetMemory');
    expect(data.avatarUrl).toBe('https://img3.doubanio.com/icon/u150361821-2.jpg');
    expect(data.currentPage).toBe('1-30');
    expect(data.total).toBe(212);
    expect(data.mode).toBe('grid');
    expect(data.navLinks).toHaveLength(3);
    expect(data.sortOptions).toEqual([
      { label: '按时间排序', url: '', active: true },
      { label: '按评分排序', url: '?status=collect&sort=rating', active: false },
    ]);

    // 已注销行（无 subject 链接）与广告位（缺 comment-item 类）都不进结果
    expect(data.items.map((i) => i.subjectId)).toEqual(['26986462', '35523944', '1440508']);

    const insight = data.items[0]!;
    expect(insight.title).toBe('Insight');
    expect(insight.subtitle).toBe('日本首版');
    expect(insight.rating).toBe('3');
    expect(insight.intro).toBe('编曲层次铺得很满，第二遍才听得出贝斯线。');
    expect(insight.date).toBe('2024-03-02 听过');
    expect(insight.url).toBe('https://music.douban.com/subject/26986462/');
    expect(insight.posterUrl).toBe('https://img2.doubanio.com/view/subject/s/public/s27145671.jpg');
  });

  test('/mine 变体：URL 无 /people/ 时 userId 回落 #user-id 隐藏域', () => {
    mountFixture('https://music.douban.com/mine/?status=collect');
    const data = extractMusicCollectData() as MusicCollectData;
    expect(data.userId).toBe('150361821');
    expect(data.subType).toBe('collect');
    expect(data.items).toHaveLength(3);
  });

  test('status 变体：/wish → wish、/do → doing', () => {
    mountFixture('https://music.douban.com/people/unforgetmemory/wish?status=wish');
    expect(extractMusicCollectData()?.subType).toBe('wish');

    mountFixture('https://music.douban.com/people/unforgetmemory/do?status=do');
    expect(extractMusicCollectData()?.subType).toBe('doing');
  });

  test('三档评分映射：rating1-t → 1、rating3-t → 3、无评分节点 → 0', () => {
    mountFixture(PEOPLE_URL);
    const data = extractMusicCollectData() as MusicCollectData;

    expect(data.items[0]?.rating).toBe('3');
    expect(data.items[1]?.rating).toBe('1');
    expect(data.items[2]?.rating).toBe('0');
  });

  test('标题拆分：无 <em> 时整串作主标题、副标题为空', () => {
    mountFixture(PEOPLE_URL);
    const data = extractMusicCollectData() as MusicCollectData;

    const wish = data.items.find((i) => i.subjectId === '1440508');
    expect(wish?.title).toBe('Wish You Were Here');
    expect(wish?.subtitle).toBe('');
    expect(wish?.intro).toBe('');
    expect(wish?.date).toBe('');
    expect(wish?.posterUrl).toBe('https://img1.doubanio.com/view/subject/s/public/s1437828.jpg');
  });

  test('标题只有 <em> 无后缀时副标题为空串（不残留分隔符）', () => {
    const doc = mountFixture(PEOPLE_URL);
    const title = doc.querySelector('.grid-view > .item.comment-item .info .title');
    if (title)
      title.innerHTML = '<a href="https://music.douban.com/subject/26986462/"><em>Insight</em></a>';
    const data = extractMusicCollectData() as MusicCollectData;

    expect(data.items[0]?.title).toBe('Insight');
    expect(data.items[0]?.subtitle).toBe('');
  });

  test('有条目但无 .subject-num 计数 → 由末页 start 反推 total', () => {
    const doc = mountFixture(PEOPLE_URL);
    doc.querySelector('.subject-num')?.remove();
    const data = extractMusicCollectData() as MusicCollectData;

    // 末页 pageLinks 最后一项 start=60 + 当前页 3 张 = 63
    expect(data.total).toBe(63);
  });

  test('.subject-num 有计数却一张专辑都没渲染 → null（交给 withRetry 重试）', () => {
    const doc = mountFixture(PEOPLE_URL);
    doc.querySelectorAll('.grid-view > .item.comment-item').forEach((el) => el.remove());
    expect(extractMusicCollectData()).toBeNull();
  });

  test('空专辑架（无条目且 total=0）→ 合法空结果而非 null', () => {
    const doc = mountFixture(PEOPLE_URL);
    doc.querySelectorAll('.grid-view > .item.comment-item').forEach((el) => el.remove());
    doc.querySelector('.subject-num')?.remove();
    doc.querySelector('.paginator')?.remove();
    const data = extractMusicCollectData() as MusicCollectData;

    expect(data).not.toBeNull();
    expect(data.items).toEqual([]);
    expect(data.total).toBe(0);
    expect(data.currentPage).toBe('');
    expect(data.prevPageUrl).toBe('');
    expect(data.nextPageUrl).toBe('');
  });
});
