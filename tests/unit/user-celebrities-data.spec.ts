import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';
import { JSDOM } from 'jsdom';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractUserCelebritiesData } from '@/scenario/douban/pages/user-celebrities/user-celebrities-data';
import type { UserCelebritiesData } from '@/scenario/douban/pages/user-celebrities/types';

// Installs happen inside tests below; register this file's sandbox hooks at module scope.
initFileSandbox();

/**
 * user-celebrities (movie.douban.com/people/{uid}/celebrities) extraction spec
 * — X11-4 coverage wave. The module reads global `document`/`location`, so
 * each test installs a fresh JSDOM over
 * tests/fixtures/douban/user-celebrities.html (synthetic Douban-shaped DOM).
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(HERE, '../fixtures/douban/user-celebrities.html');
const PAGE_URL = 'https://movie.douban.com/people/xingxing/celebrities';

function mount(url: string = PAGE_URL): Document {
  const dom = new JSDOM(fs.readFileSync(FIXTURE, 'utf-8'), { url, runScripts: 'outside-only' });
  defineGlobal('window', dom.window);
  defineGlobal('document', dom.window.document);
  defineGlobal('location', dom.window.location);
  defineGlobal('Node', dom.window.Node);
  defineGlobal('HTMLElement', dom.window.HTMLElement);
  return dom.window.document;
}

function extract(): UserCelebritiesData {
  const data = extractUserCelebritiesData();
  expect(data).not.toBeNull();
  return data as UserCelebritiesData;
}

test.describe('user-celebrities-data 提取', () => {
  test('happy path — 用户信息 + 统计 + 侧栏导航子域重写', () => {
    mount();
    const d = extract();
    expect(d.userId).toBe('xingxing');
    // displayName 优先级：.side-info-txt h3 > avatar alt > userId
    expect(d.displayName).toBe('星星同学');
    // avatar 选择器两源并存时取 #db-usr-profile .pic img（文档序第一）
    expect(d.avatarUrl).toBe('https://img3.doubanio.com/icon/u9876543-2.jpg');
    expect(d.total).toBe(14);
    // 仅精确前缀 https://www.douban.com 被重写为 movie 子域，其他子域不动
    expect(d.navLinks).toEqual([
      { label: '主页', url: 'https://movie.douban.com/people/xingxing/' },
      { label: '我看', url: 'https://movie.douban.com/people/xingxing/collect' },
      { label: '我读', url: 'https://book.douban.com/people/xingxing/collect' },
    ]);
  });

  test('items — 3 条有效（无锚点条目跳过），em 名 / 文本回退 / works 含非 subject 链接', () => {
    mount();
    const d = extract();
    expect(d.items).toHaveLength(3);

    const natalie = d.items[0]!;
    expect(natalie.name).toBe('娜塔莉-波特曼');
    expect(natalie.url).toBe('https://movie.douban.com/celebrity/1000596/');
    expect(natalie.photoUrl).toBe('https://img1.doubanio.com/cele/b/public/1000596.jpg');
    expect(natalie.roles).toBe('演员');
    // works 来自 intros[1] 的全部锚点
    expect(natalie.works.map((w) => w.title)).toEqual(['黑天鹅', '这个杀手不太冷']);

    // 单 intro → roles 有值、works 必须为空（与 book-authors 行为不同）
    const keanu = d.items.find((i) => i.name === '基努-里维斯');
    expect(keanu?.roles).toBe('演员 / 制片人');
    expect(keanu?.works).toEqual([]);

    // 无 em → name 取链接全文；works 不过滤 /subject/ —— 个人主页链接也在
    const miyazaki = d.items.find((i) => i.name.includes('宫崎骏'));
    expect(miyazaki?.name).toBe('宫崎骏 Hayao Miyazaki');
    expect(miyazaki?.photoUrl).toBe('');
    expect(miyazaki?.works.map((w) => w.title)).toEqual(['千与千寻', '个人主页']);
  });

  test('paginator — thispage/数字链接/前后页 URL 均相对页面基址解析', () => {
    mount();
    const d = extract();
    expect(d.pageLinks).toEqual([
      { label: '1', url: '', current: true },
      { label: '2', url: `${PAGE_URL}?start=30`, current: false },
    ]);
    expect(d.prevPageUrl).toBe(`${PAGE_URL}?start=0`);
    expect(d.nextPageUrl).toBe(`${PAGE_URL}?start=30`);
  });

  test('edge — "|" 分隔符锚点被过滤（mutation：注入锚点版分隔符）', () => {
    const doc = mount();
    const li = doc.createElement('li');
    li.innerHTML = '<a href="https://movie.douban.com/people/xingxing/">|</a>';
    doc.querySelector('#db-usr-profile .info ul')?.appendChild(li);
    const d = extract();
    expect(d.navLinks.map((n) => n.label)).not.toContain('|');
  });

  test('edge — displayName 回退链：.side-info-txt 移除 → avatar alt', () => {
    const doc = mount();
    doc.querySelector('.side-info')?.remove();
    expect(extract().displayName).toBe('星星');
  });

  test('edge — displayName 二次回退：无头像 alt → URL 中的 userId', () => {
    const doc = mount();
    doc.querySelector('.side-info')?.remove();
    doc.querySelector('#db-usr-profile .pic img')?.remove();
    expect(extract().displayName).toBe('xingxing');
  });

  test('空列表回退 — items 与 h1 计数同时为 0 → null（ documented fallback）', () => {
    const doc = mount();
    doc.querySelectorAll('.grid-view .item').forEach((el) => el.remove());
    const h1 = doc.querySelector('#db-usr-profile .info h1');
    if (h1) h1.textContent = '我关注的名人(0)';
    expect(extractUserCelebritiesData()).toBeNull();
  });

  test('items 为空但 h1 计数 > 0 → 仍返回数据（items: []，total: 14）', () => {
    const doc = mount();
    doc.querySelectorAll('.grid-view .item').forEach((el) => el.remove());
    const d = extract();
    expect(d.items).toEqual([]);
    expect(d.total).toBe(14);
  });
});
