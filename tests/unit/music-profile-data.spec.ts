import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';
import { JSDOM } from 'jsdom';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractMusicProfileData } from '@/scenario/douban/pages/music-profile/music-profile-data';
import type { MusicProfileData } from '@/scenario/douban/pages/music-profile/types';

// Installs happen inside tests below; register this file's sandbox hooks at module scope.
initFileSandbox();

/**
 * music-profile-data unit coverage (X11-5b).
 *
 * Ambient document/location extractor → each test installs a fresh JSDOM over
 * tests/fixtures/douban/music-profile.html. Locks: user block, number
 * accumulated stats, first-marked album section (title precedence
 * .album-title a > img[alt], href required), musician list ('div a' contract),
 * doulist sidebar (.dl-title required), and the documented null/empty
 * fallbacks when optional modules are absent.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(HERE, '../fixtures/douban/music-profile.html');

const BASE_URL = 'https://music.douban.com/people/88990011/';

/** Fresh JSDOM over the fixture with document/location installed as globals. */
function domAt(url: string): Document {
  const dom = new JSDOM(fs.readFileSync(FIXTURE, 'utf-8'), { url });
  defineGlobal('document', dom.window.document);
  defineGlobal('location', dom.window.location);
  return dom.window.document as unknown as Document;
}

function extractAt(url: string = BASE_URL): MusicProfileData {
  domAt(url);
  // The public wrapper try/catches everything else — null only on throw.
  return extractMusicProfileData() as MusicProfileData;
}

test.describe('music-profile 数据提取', () => {
  test('用户信息：userId / 昵称 / 头像（img.avatar 本体即图片）', () => {
    const d = extractAt();
    expect(d.userId).toBe('88990011');
    expect(d.displayName).toBe('耳机发烧友');
    expect(d.avatarUrl).toBe('https://img3.doubanio.com/icon/u88990011-3.jpg');
  });

  test('stats：.number-accumulated 逐项解析，无 label 项跳过，url 恒空', () => {
    const d = extractAt();
    expect(d.stats).toEqual([
      { label: '听过', count: 128, url: '' },
      { label: '在听', count: 6, url: '' },
      { label: '想听', count: 233, url: '' },
    ]);
  });

  test('albumSection：label/count/url 与条目字段', () => {
    const d = extractAt();
    expect(d.albumSection).not.toBeNull();
    expect(d.albumSection?.label).toBe('听过');
    expect(d.albumSection?.count).toBe(56);
    expect(d.albumSection?.url).toBe('https://music.douban.com/mine?status=progress');
    expect(d.albumSection?.items.length).toBe(2);
    expect(d.albumSection?.items[0]).toEqual({
      title: 'Faker',
      posterUrl: 'https://img3.doubanio.com/view/subject/s/public/s36447621.jpg',
      url: 'https://music.douban.com/subject/36447621/',
    });
  });

  test('albumSection 条目：.album-title a 优先于 img[alt]，缺 href 项被丢', () => {
    const d = extractAt();
    const titles = d.albumSection?.items.map((i) => i.title);
    // Faker 的 alt 是「Faker (期间限定盘)」，标题取 .album-title a 文本
    expect(titles).toEqual(['Faker', 'THE ALBUM']);
    // 第三格 a.cover 无 href → 整项丢弃（url 是必需字段）
    expect(d.albumSection?.items.some((i) => i.title.includes('未命名'))).toBe(false);
  });

  test('musicians：需 div 包裹的链接（li.querySelector("div a") 按文档祖先匹配），相对/绝对 href 均补全', () => {
    const d = extractAt();
    expect(d.musicians).toEqual([
      { name: '美依礼芽', url: 'https://music.douban.com/musician/6553435/' },
      { name: '周杰伦', url: 'https://music.douban.com/musician/11223/' },
    ]);
    // 无锚点的占位 li 被丢弃（link 为必需）
    expect(d.musicians.some((m) => m.name.includes('更多'))).toBe(false);
  });

  test('doulists：仅 .dl-title 链接入选，关注数从 .rec 解析', () => {
    const d = extractAt();
    expect(d.doulists).toEqual([
      {
        title: '2024 华语精选',
        url: 'https://music.douban.com/doulist/151122334/',
        followers: 88,
      },
      { title: '深夜爵士', url: 'https://music.douban.com/doulist/150000002/', followers: 12 },
    ]);
  });

  test('模块缺失 fallback：#db-music-mine 移除 → albumSection null，其余不受影响', () => {
    const document = domAt(BASE_URL);
    document.getElementById('db-music-mine')?.remove();
    const d = extractMusicProfileData() as MusicProfileData;
    expect(d.albumSection).toBeNull();
    expect(d.stats.length).toBe(3);
    expect(d.musicians.length).toBe(2);
  });

  test('空壳人页：用户/专辑/艺术家/片单模块全缺 → 空集合而非 null', () => {
    const document = domAt(BASE_URL);
    document.querySelector('.music-user-profile')?.remove();
    document.querySelector('.number-accumulated')?.remove();
    document.getElementById('db-music-mine')?.remove();
    document.getElementById('musicians')?.remove();
    document.querySelector('.mod.doulist')?.remove();
    const d = extractMusicProfileData();
    expect(d).not.toBeNull();
    expect(d?.displayName).toBe('88990011');
    expect(d?.avatarUrl).toBe('');
    expect(d?.stats).toEqual([]);
    expect(d?.albumSection).toBeNull();
    expect(d?.musicians).toEqual([]);
    expect(d?.doulists).toEqual([]);
  });

  test('URL 无 /people/ 段 → userId 空串；昵称缺失时兜底为 userId', () => {
    const document = domAt('https://music.douban.com/subject/36447621/');
    document.querySelector('.music-user-profile .username')?.remove();
    const d = extractMusicProfileData() as MusicProfileData;
    expect(d.userId).toBe('');
    // displayName 兜底链：username 缺失 → userId，两者皆空 → ''
    expect(d.displayName).toBe('');
  });
});
