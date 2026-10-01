import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';
import { JSDOM } from 'jsdom';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractUserProfileData } from '@/scenario/douban/pages/user-profile/user-profile-data';
import type { UserProfileData } from '@/scenario/douban/pages/user-profile/types';

// Installs happen inside tests below; register this file's sandbox hooks at module scope.
initFileSandbox();

/**
 * user-profile (www.douban.com/people/{uid}/) extraction spec — X11-4
 * coverage wave. Global-DOM module (document + location.href) → each test
 * installs a fresh JSDOM over tests/fixtures/douban/user-profile.html
 * (synthetic Douban-shaped DOM covering the sandwich sections, doulist,
 * friends, reviews and statuses blocks).
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(HERE, '../fixtures/douban/user-profile.html');
const PAGE_URL = 'https://www.douban.com/people/unforgetmemory/';

function mount(url: string = PAGE_URL): Document {
  const dom = new JSDOM(fs.readFileSync(FIXTURE, 'utf-8'), { url, runScripts: 'outside-only' });
  defineGlobal('window', dom.window);
  defineGlobal('document', dom.window.document);
  defineGlobal('location', dom.window.location);
  defineGlobal('Node', dom.window.Node);
  defineGlobal('HTMLElement', dom.window.HTMLElement);
  return dom.window.document;
}

function extract(): UserProfileData {
  const data = extractUserProfileData();
  expect(data).not.toBeNull();
  return data as UserProfileData;
}

test.describe('user-profile-data 提取', () => {
  test('身份块 — 昵称首文本节点 / 头像 / 简介 / 签名 / 常居地 / 加入时间 / 粉丝 / 关注态', () => {
    mount();
    const d = extract();
    expect(d.userId).toBe('unforgetmemory');
    // h1 首文本节点（子元素前）即昵称，不混入 IP 属地
    expect(d.displayName).toBe('UnforgetMemory');
    expect(d.avatarUrl).toBe('https://img1.doubanio.com/icon/u55667788-9.jpg');
    expect(d.bio).toBe('记录电影、书和偶尔的愤怒。');
    expect(d.signature).toBe('勿在深夜做决定');
    expect(d.location).toBe('上海 中国');
    expect(d.joinDate).toBe('2013-05-20');
    expect(d.followerCount).toBe(128);
    expect(d.following).toEqual({
      label: '已关注',
      url: '/people/unforgetmemory/contacts',
      isFollowing: true,
    });
  });

  test('四平台计数块 — movie/music/book/game stats 分类解析', () => {
    mount();
    const d = extract();
    expect(d.movieStats).toEqual({ watching: 5, wish: 88, collect: 2513, doulist: 3 });
    expect(d.musicStats).toEqual({ collect: 314 });
    expect(d.bookStats).toEqual({ wish: 21, collect: 305, doulist: 2 });
    expect(d.gameStats).toEqual({ playing: 3, played: 12 });
  });

  test('三明治区块 — movie/music/book/game 子版块与条目（含无图回退与无锚点跳过）', () => {
    mount();
    const d = extract();
    expect(d.sections.map((s) => s.id)).toEqual(['movie', 'music', 'book', 'game']);

    const movie = d.sections[0]!;
    expect(movie.title).toBe('我看');
    expect(movie.statLinks.map((l) => l.text)).toEqual([
      '看过 2513',
      '在看 5',
      '想看 88',
      '片单 3',
    ]);
    expect(movie.subsections.map((s) => s.label)).toEqual(['最近看过', '正在看']);
    const recent = movie.subsections[0]!;
    expect(recent.items).toHaveLength(2); // 无锚点 li.aob 被跳过
    expect(recent.items[0]).toEqual({
      title: '好东西',
      url: 'https://movie.douban.com/subject/36185501/',
      posterUrl: 'https://img1.doubanio.com/poster/g.jpg',
    });
    // 无 img.climg → title 取链接文本，posterUrl 空
    expect(recent.items[1]).toEqual({
      title: '宇宙探索编辑部',
      url: 'https://movie.douban.com/subject/2589592/',
      posterUrl: '',
    });

    const book = d.sections.find((s) => s.id === 'book')!;
    expect(book.title).toBe('我读');
    expect(book.subsections[0]!.items[0]!.title).toBe('太古和其他的时间');
    const game = d.sections.find((s) => s.id === 'game')!;
    expect(game.title).toBe('我的游戏');
    expect(game.subsections[0]!.items[0]!.title).toBe('黑帝斯II');
  });

  test('edge — 区块无 .obssin 时从 sections 剔除，但计数块不受影响', () => {
    const doc = mount();
    doc.querySelectorAll('#movie .obssin').forEach((el) => el.remove());
    const d = extract();
    expect(d.sections.map((s) => s.id)).toEqual(['music', 'book', 'game']);
    expect(d.movieStats.collect).toBe(2513);
  });

  test('豆列区块 — "(N)" 计数解析与无计数回退；无锚点 li 跳过', () => {
    mount();
    const d = extract();
    const dl = d.doulistSection as NonNullable<UserProfileData['doulistSection']>;
    expect(dl.totalCount).toBe(4);
    expect(dl.totalUrl).toBe('https://www.douban.com/people/unforgetmemory/doulists');
    expect(dl.items).toEqual([
      { title: '华语佳片', url: 'https://www.douban.com/doulist/1500001/', itemCount: 52 },
      { title: '还没想好名字', url: 'https://www.douban.com/doulist/1500002/', itemCount: 0 },
    ]);
  });

  test('朋友区块 — img 头像 / verify-avatar 双 url() 取末个 / 无头像空串 / 无名跳过', () => {
    mount();
    const d = extract();
    const fr = d.friendSection as NonNullable<UserProfileData['friendSection']>;
    expect(fr.totalCount).toBe(128);
    expect(fr.totalUrl).toBe('https://www.douban.com/people/unforgetmemory/contacts');
    expect(fr.items).toHaveLength(3);
    expect(fr.items[0]).toEqual({
      name: '阿毛',
      url: 'https://www.douban.com/people/amao/',
      avatarUrl: 'https://img1.doubanio.com/icon/u111-1.jpg',
    });
    // 认证账号背景含两个 url()：验证图标 + 头像 → 取最后一个
    expect(fr.items[1]?.avatarUrl).toBe('https://img2.doubanio.com/icon/verified-av.jpg');
    expect(fr.items[2]).toEqual({
      name: '无头像好友',
      url: 'https://www.douban.com/people/noav/',
      avatarUrl: '',
    });
  });

  test('影评区块 — 标题/主体/评分/摘要；无评分与缺主体条目字段清空；非 /review/ 链接跳过', () => {
    mount();
    const d = extract();
    expect(d.reviewCount).toBe(3);
    expect(d.reviews).toHaveLength(2);

    const r1 = d.reviews[0]!;
    expect(r1).toEqual({
      id: '3666098',
      title: '她不再道歉：性别叙事',
      url: 'https://movie.douban.com/review/3666098/',
      subjectTitle: '好东西',
      subjectUrl: 'https://movie.douban.com/subject/36185501/',
      posterUrl: 'https://img1.doubanio.com/poster/g.jpg',
      rating: 4.5,
      excerpt: '举重若轻的寓言，前夫哥也很好。',
    });
    const r2 = d.reviews[1]!;
    expect(r2.id).toBe('3600001');
    expect(r2.rating).toBe(0);
    expect(r2.subjectTitle).toBe('');
    expect(r2.subjectUrl).toBe('');
    expect(r2.posterUrl).toBe('');
    expect(r2.excerpt).toBe('');
  });

  test('动态区块 — 双锚点动作文本 / 评分 / 正文 / 时间；缺 sid 与单锚点条目跳过', () => {
    mount();
    const d = extract();
    expect(d.statuses).toHaveLength(2);

    const s1 = d.statuses[0]!;
    expect(s1).toEqual({
      id: '9876543210',
      action: '看过',
      targetType: 'movie',
      targetTitle: '好东西',
      targetUrl: 'https://movie.douban.com/subject/36185501/',
      rating: '5',
      content: '年度最佳，看得我头皮发麻。',
      time: '2024-11-23',
      timeUrl: 'https://www.douban.com/topic/293741/?from=group',
    });
    const s2 = d.statuses[1]!;
    expect(s2.action).toBe('标记了');
    expect(s2.targetType).toBe('music');
    expect(s2.targetTitle).toBe('拉威尔: 钢琴协奏曲');
    // 无评分/正文/时间 → 空值兜底
    expect(s2.rating).toBe('0');
    expect(s2.content).toBe('');
    expect(s2.time).toBe('');
    expect(s2.timeUrl).toBe('');
  });

  test('edge — h1 缺失时 displayName 空串（「用户 {userId}」兜底在渲染层，见 x108 e2e）', () => {
    const doc = mount();
    doc.querySelector('#db-usr-profile .info h1')?.remove();
    expect(extract().displayName).toBe('');
  });

  test('URL 无 /people/ → null（非个人主页）', () => {
    mount('https://www.douban.com/subject/36185501/');
    expect(extractUserProfileData()).toBeNull();
  });
});
