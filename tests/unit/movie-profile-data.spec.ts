import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';

initFileSandbox();
import { JSDOM } from 'jsdom';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractMovieProfileData } from '@/scenario/douban/pages/movie-profile/movie-profile-data';
import type { MovieProfileData } from '@/scenario/douban/pages/movie-profile/types';

/**
 * movie-profile-data unit coverage (X11-5b).
 *
 * The extractor reads the ambient `document`/`location` (content-script
 * style), so each test installs a fresh JSDOM over the synthetic fixture
 * tests/fixtures/douban/movie-profile.html via globals before calling it.
 * Locks: stats/section split, celebrity & review side-buckets, doulist
 * sidebar parsing, URL absolutisation, and the documented missing-section
 * fallbacks (the function never returns null for a people page).
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(HERE, '../fixtures/douban/movie-profile.html');

const BASE_URL = 'https://movie.douban.com/people/27235071/';

/** Fresh JSDOM over the fixture with document/location installed as globals. */
function domAt(url: string): Document {
  const dom = new JSDOM(fs.readFileSync(FIXTURE, 'utf-8'), { url });
  defineGlobal('document', dom.window.document);
  defineGlobal('location', dom.window.location);
  return dom.window.document as unknown as Document;
}

function extractAt(url: string = BASE_URL): MovieProfileData {
  domAt(url);
  // Never null in practice for a people page — the | null in the signature is
  // defensive only, which is exactly what the empty-page test pins down.
  return extractMovieProfileData() as MovieProfileData;
}

test.describe('movie-profile 数据提取', () => {
  test('用户信息：userId / 昵称 / 头像', () => {
    const d = extractAt();
    expect(d.userId).toBe('27235071');
    expect(d.displayName).toBe('贾探花');
    expect(d.avatarUrl).toBe('https://img1.doubanio.com/icon/u27235071-8.jpg');
  });

  test('stats：普通标记 h2 按 DOM 顺序收集，影人/影评被旁路，零标记 h2 不入 stats', () => {
    const d = extractAt();
    // '二刷' is dropped here on purpose: it has no `.pl` count link, and the
    // previous behaviour (collect it anyway) is the bug tested below.
    expect(d.stats.map((s) => s.label)).toEqual(['看过', '想看', '在看']);
    expect(d.stats[0]?.count).toBe(128);
    expect(d.stats[1]?.count).toBe(56);
    expect(d.stats[2]?.count).toBe(3);
    // 相对 count 链接补全 movie.douban.com 前缀
    expect(d.stats[0]?.url).toBe('https://movie.douban.com/people/27235071/movies?status=P');
    // 绝对 href 原样保留
    expect(d.stats[2]?.url).toBe('https://movie.douban.com/people/27235071/movies?status=L');
  });

  test('零标记边界：h2 无 .pl count 链接 ⇒ 不产出统计项（旧行为是可点的站点根 pill）', () => {
    // Characterisation replaced by contract. The old shape was
    // `{ label: '二刷', count: 0, url: 'https://movie.douban.com' }`: the empty
    // href degraded to the bare origin, so the overlay rendered a "0" pill that
    // opened the movie homepage — a heading with nothing to count is not a stat.
    const d = extractAt();
    expect(d.stats.find((s) => s.label === '二刷')).toBeUndefined();
    expect(d.stats.some((s) => s.url === 'https://movie.douban.com')).toBe(false);
    // And no other section's content was lost by skipping it.
    expect(d.sections.map((s) => s.label)).toEqual(['看过', '想看', '在看']);
  });

  test('影人/影评旁路桶：计数与链接单独归位，不进 stats/sections', () => {
    const d = extractAt();
    expect(d.celebrityCount).toBe(12);
    expect(d.celebrityUrl).toBe('https://movie.douban.com/people/27235071/celebrities');
    expect(d.reviewCount).toBe(5);
    expect(d.reviewUrl).toBe('https://movie.douban.com/people/27235071/reviews');
    expect(d.stats.some((s) => s.label.includes('影人') || s.label.includes('影评'))).toBe(false);
    expect(d.sections.map((s) => s.label)).toEqual(['看过', '想看', '在看']);
  });

  test('sections：条目字段、alt/title 兜底、无封格丢弃', () => {
    const d = extractAt();
    const watched = d.sections.find((s) => s.label === '看过');
    expect(watched?.count).toBe(128);
    expect(watched?.url).toBe('https://movie.douban.com/people/27235071/movies?status=P');
    expect(watched?.items.length).toBe(2);
    expect(watched?.items[0]).toEqual({
      title: '肖申克的救赎',
      posterUrl: 'https://img3.doubanio.com/view/photo/s_ratio_poster/public/p480747492.webp',
      url: 'https://movie.douban.com/subject/1292052/',
    });
    // alt 缺失 → title 属性兜底（霸王别姬）；无 a.cover 的占位格被丢
    expect(watched?.items[1]?.title).toBe('霸王别姬');

    // 影 img 既无 alt 又无 title → title '' → 条目被丢弃（活着保留）
    const ongoing = d.sections.find((s) => s.label === '在看');
    expect(ongoing?.items.map((i) => i.title)).toEqual(['活着']);
  });

  test('doulists：侧栏片单标题/链接/关注数，无链接占位行跳过', () => {
    const d = extractAt();
    expect(d.doulists.length).toBe(2);
    expect(d.doulists[0]).toEqual({
      title: '华语悬疑片单',
      url: 'https://movie.douban.com/doulist/143184672/',
      followers: 34,
    });
    expect(d.doulists[1]?.followers).toBe(7);
  });

  test('昵称缺失 → displayName 兜底为 userId（文档化 fallback）', () => {
    const document = domAt(BASE_URL);
    document.querySelector('.side-info-txt h3')?.remove();
    const d = extractMovieProfileData() as MovieProfileData;
    expect(d.displayName).toBe('27235071');
  });

  test('空壳人页：#db-movie-mine / .aside 全缺 → 返回空集合而非 null', () => {
    const document = domAt(BASE_URL);
    document.getElementById('db-movie-mine')?.remove();
    document.querySelector('.aside')?.remove();
    const d = extractMovieProfileData();
    expect(d).not.toBeNull();
    expect(d?.stats).toEqual([]);
    expect(d?.sections).toEqual([]);
    expect(d?.doulists).toEqual([]);
    expect(d?.celebrityCount).toBe(0);
    expect(d?.celebrityUrl).toBe('');
    expect(d?.reviewCount).toBe(0);
    expect(d?.reviewUrl).toBe('');
    expect(d?.userId).toBe('27235071');
  });

  test('URL 无 /people/ 段 → userId 为空串（不抛错）', () => {
    const d = extractAt('https://movie.douban.com/subject/1292052/');
    expect(d.userId).toBe('');
    // 无 .side-info-txt h3？夹具仍有昵称 → displayName 正常解析
    expect(d.displayName).toBe('贾探花');
  });
});
