import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';

initFileSandbox();
import { JSDOM } from 'jsdom';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * game-detail-data unit coverage (X11-5b).
 *
 * Two loading constraints drive the setup below:
 *  - the extractor reads ambient document/location (content-script style);
 *  - it statically imports dompurify, which binds `window` AT MODULE-LOAD
 *    time (without one, DOMPurify.sanitize is undefined and the try/catch
 *    wrapper swallows the TypeError → always null). So the module must be
 *    dynamically imported after a jsdom window is installed.
 *
 * Fixture: tests/fixtures/douban/game-detail.html (synthetic
 * www.douban.com/game/<id>/ page). identity/providerId + recItems.subjectId
 * are locked explicitly: they feed the record-refresh path (ADR-015).
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(HERE, '../fixtures/douban/game-detail.html');

const BASE_URL = 'https://www.douban.com/game/35317744/';

type GameDetailModule = typeof import('@/scenario/douban/pages/game-detail/game-detail-data');
type GameDetailData = GameDetailModule['extractGameDetailData'] extends () => infer R
  ? Exclude<R, null>
  : never;

// Persistent window for dompurify's load-time binding (created before the
// dynamic import below; per-test fixture DOMs only replace document/location).
defineGlobal('window', new JSDOM('<!doctype html><html><body></body></html>').window);

let mod: GameDetailModule | undefined;
async function load(): Promise<GameDetailModule> {
  mod ??= await import('@/scenario/douban/pages/game-detail/game-detail-data');
  return mod;
}

/** Fresh JSDOM over the fixture with document/location installed as globals. */
function domAt(url: string): Document {
  const dom = new JSDOM(fs.readFileSync(FIXTURE, 'utf-8'), { url });
  defineGlobal('document', dom.window.document);
  defineGlobal('location', dom.window.location);
  return dom.window.document as unknown as Document;
}

async function extractAt(url: string = BASE_URL): Promise<GameDetailData | null> {
  domAt(url);
  const { extractGameDetailData } = await load();
  return extractGameDetailData();
}

test.describe('game-detail 数据提取', () => {
  test('identity：providerId 从 /game/<id>/ 路径解析（record-refresh 关键）', async () => {
    const d = await extractAt();
    expect(d).not.toBeNull();
    const g = d as GameDetailData;
    expect(g.identity).toEqual({
      platform: 'douban',
      type: 'game',
      providerId: '35317744',
      url: BASE_URL,
    });
  });

  test('非 /game/<digits>/ 路径 → null（身份解析失败即放弃整页）', async () => {
    domAt('https://movie.douban.com/subject/1292052/');
    const { extractGameDetailData } = await load();
    expect(extractGameDetailData()).toBeNull();
  });

  test('头部字段：标题 / 海报 / 评分 / 评价人数 / bigstar 档位', async () => {
    const g = (await extractAt()) as GameDetailData;
    expect(g.title).toBe('塞尔达传说 王国之泪');
    expect(g.posterSrc).toBe('https://img3.doubanio.com/view/game/subject/public/p480747492.jpg');
    expect(g.ratingNum).toBe('9.5');
    expect(g.ratingPeople).toBe('5678');
    // class "bigstar bigstar45" → 数字剥离
    expect(g.bigstarNum).toBe('45');
  });

  test('ratingBars：starstop→rating_per 兄弟链按序解析五档', async () => {
    const g = (await extractAt()) as GameDetailData;
    expect(g.ratingBars).toEqual([
      { label: '力荐', pct: '71.4%' },
      { label: '推荐', pct: '19.8%' },
      { label: '还行', pct: '5.3%' },
      { label: '较差', pct: '2.1%' },
      { label: '很差', pct: '1.4%' },
    ]);
  });

  test('metaRows：冒号剥离 + DOMPurify 清洗（onclick 移除、链接保留），空 dd / 尾 dt 跳过', async () => {
    const g = (await extractAt()) as GameDetailData;
    expect(g.metaRows.map((r) => r.label)).toEqual(['平台', '开发商', '发行商', '发售日期']);
    const platform = g.metaRows.find((r) => r.label === '平台');
    expect(platform?.html).toContain(
      '<a href="https://www.douban.com/game/type/switch">Switch</a>',
    );
    expect(platform?.html).not.toContain('onclick');
  });

  test('收藏区：文案/日期/短评 + 状态映射 我玩过→2、评分按钮→9', async () => {
    const g = (await extractAt()) as GameDetailData;
    expect(g.hasCollected).toBe(true);
    expect(g.collectionText).toContain('我玩过');
    expect(g.collectionDate).toBe('2023-05-20 标记');
    expect(g.collectionComment).toBe('开放世界设计教科书，值得全收集。');
    expect(g.initialStatus).toBe(2);
    expect(g.initialRating).toBe(9);
  });

  test('收藏状态映射：我想玩→1、我最近在玩→3；无收藏区→false/0', async () => {
    const statuses: Array<[string, number]> = [
      ['我想玩 · 待发售', 1],
      ['我最近在玩', 3],
      ['随便写的文案', 0],
    ];
    for (const [text, expected] of statuses) {
      const document = domAt(BASE_URL);
      const result = document.querySelector('.collection-result');
      if (result) result.textContent = text;
      const { extractGameDetailData } = await load();
      const g = extractGameDetailData() as GameDetailData;
      expect(g.initialStatus).toBe(expected);
    }
    const document = domAt(BASE_URL);
    document.querySelector('.collection-section')?.remove();
    document.querySelector('a.collect-btn')?.remove();
    const { extractGameDetailData } = await load();
    const g = extractGameDetailData() as GameDetailData;
    expect(g.hasCollected).toBe(false);
    expect(g.initialStatus).toBe(0);
    expect(g.initialRating).toBe(0);
  });

  test('简介：DOMPurify 清洗（script/onclick 移除，正文与链接保留）', async () => {
    const g = (await extractAt()) as GameDetailData;
    expect(g.synopsisHtml).toContain('海拉鲁大陆突逢异变');
    expect(g.synopsisHtml).toContain('<a href="https://www.douban.com/games/"');
    expect(g.synopsisHtml).not.toContain('<script');
    expect(g.synopsisHtml).not.toContain('onclick');
  });

  test('图集：视频区 isVideo+标题+时长 tag，图片区排除 photos-upload 占位', async () => {
    const g = (await extractAt()) as GameDetailData;
    expect(g.galleryItems.length).toBe(4);
    const [trailer1, trailer2, photo1] = g.galleryItems;
    expect(trailer1).toMatchObject({
      src: 'https://img3.doubanio.com/view/video/cover/t1.jpg',
      link: 'https://v.douban.com/game/35317744/trailer1/',
      isVideo: true,
      title: '先导预告片',
      tag: '01:23',
    });
    // 无直属 span → tag undefined
    expect(trailer2?.isVideo).toBe(true);
    expect(trailer2?.tag).toBeUndefined();
    expect(photo1).toMatchObject({
      isVideo: false,
      link: 'https://www.douban.com/game/35317744/photo/9001/',
    });
    expect(g.galleryItems.some((i) => i.link.includes('upload'))).toBe(false);
  });

  test('短评：评分 allstar40→4、digg 票数、平台标签；无正文无昵称的项跳过', async () => {
    const g = (await extractAt()) as GameDetailData;
    expect(g.shortComments.length).toBe(2);
    const first = g.shortComments[0];
    expect(first).toMatchObject({
      user: '游戏迷小李',
      userLink: 'https://www.douban.com/people/gamefan001/',
      rating: 4,
      content: '迷宫设计太惊艳，究手残也能通关。',
      time: '2023-06-02',
      votes: 328,
      platform: 'Switch',
    });
    // pubtime（排除类）与「推荐」文案（排除词表）都不会误入 platform
    const second = g.shortComments[1];
    expect(second).toMatchObject({
      user: '沉默玩家',
      rating: 0,
      votes: 0,
      time: '2023-07-11',
    });
    expect(second?.platform).toBeUndefined();
  });

  test('推荐位：subjectId 从 /game/<id>/ href 解析（跨记录刷新依赖），无链接 dl 跳过', async () => {
    const g = (await extractAt()) as GameDetailData;
    expect(g.recItems.length).toBe(2);
    expect(g.recItems[0]).toEqual({
      title: '艾尔登法环',
      poster: 'https://img3.doubanio.com/view/game/subject/s27204857.jpg',
      link: 'https://www.douban.com/game/27204857/',
      subjectId: '27204857',
    });
    expect(g.recItems[1]?.subjectId).toBe('30236436');
  });

  test('缺块 fallback：评分/收藏/图集/评论/推荐模块整体移除 → 各字段空态，仍出 identity', async () => {
    const document = domAt(BASE_URL);
    document.getElementById('interest_sectl')?.remove();
    document.querySelector('.collection-section')?.remove();
    document.querySelectorAll('.mod#th-photos').forEach((m) => m.remove());
    document.querySelector('.comment-list')?.remove();
    document.getElementById('recommendations')?.remove();
    document.getElementById('link-report')?.remove();
    const { extractGameDetailData } = await load();
    const g = extractGameDetailData() as GameDetailData;
    expect(g.identity.providerId).toBe('35317744');
    expect(g.ratingNum).toBe('');
    expect(g.ratingPeople).toBe('');
    expect(g.bigstarNum).toBe('');
    expect(g.ratingBars).toEqual([]);
    expect(g.hasCollected).toBe(false);
    expect(g.galleryItems).toEqual([]);
    expect(g.shortComments).toEqual([]);
    expect(g.recItems).toEqual([]);
    expect(g.synopsisHtml).toBe('');
  });
});
