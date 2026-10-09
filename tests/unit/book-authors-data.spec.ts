import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';

initFileSandbox();
import { JSDOM } from 'jsdom';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractBookAuthorsData } from '@/scenario/douban/pages/book-authors/book-authors-data';
import type { BookAuthorsData } from '@/scenario/douban/pages/book-authors/types';

/**
 * book-authors (book.douban.com/people/{uid}/authors) extraction spec —
 * X11-4 coverage wave. Global-DOM module → each test installs a fresh JSDOM
 * over tests/fixtures/douban/book-authors.html (synthetic Douban-shaped DOM).
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(HERE, '../fixtures/douban/book-authors.html');
const PAGE_URL = 'https://book.douban.com/people/renji/authors';

function mount(url: string = PAGE_URL): Document {
  const dom = new JSDOM(fs.readFileSync(FIXTURE, 'utf-8'), { url, runScripts: 'outside-only' });
  defineGlobal('window', dom.window);
  defineGlobal('document', dom.window.document);
  defineGlobal('location', dom.window.location);
  defineGlobal('Node', dom.window.Node);
  defineGlobal('HTMLElement', dom.window.HTMLElement);
  return dom.window.document;
}

function extract(): BookAuthorsData {
  const data = extractBookAuthorsData();
  expect(data).not.toBeNull();
  return data as BookAuthorsData;
}

test.describe('book-authors-data 提取', () => {
  test('happy path — 用户信息 + h1 计数 + 原样 href 的导航', () => {
    mount();
    const d = extract();
    expect(d.userId).toBe('renji');
    // book-authors 无 .side-info-txt 优先链：displayName 只认头像 alt
    expect(d.displayName).toBe('Renji');
    expect(d.avatarUrl).toBe('https://img1.doubanio.com/icon/u1234567-8.jpg');
    expect(d.total).toBe(28);
    // '|' 是文本节点而非锚点 → 天然不进 navLinks；href 原样保留（无子域重写）
    expect(d.navLinks.map((n) => n.label)).toEqual(['主页', '书影音', '动态']);
    expect(d.navLinks[0]!.url).toBe('https://book.douban.com/people/renji/');
  });

  test('items — 3 条有效（无链接条目跳过），em 名 + 双 intro works', () => {
    mount();
    const d = extract();
    expect(d.items).toHaveLength(3);

    const remarque = d.items[0]!;
    expect(remarque.name).toBe('厄希恩-马里亚-雷马克');
    expect(remarque.url).toBe('https://book.douban.com/author/10098/');
    expect(remarque.photoUrl).toBe('https://img2.doubanio.com/spic/za/public/10098.jpg');
    expect(remarque.roles).toBe('作者 Author');
    expect(remarque.works.map((w) => w.title)).toEqual(['西线无战事', '三个战友', '凯旋门']);
    expect(remarque.works[0]!.url).toBe('https://book.douban.com/subject/1010066/');
  });

  test('edge — 单 intro 作者：works 回用最后一个 intro，且仅收 /subject/ 链接', () => {
    const doc = mount();
    // 注入非 subject 锚点：works 过滤（a[href*="/subject/"]）必须排除它
    const saramagoIntro = doc.querySelectorAll('.item')[1]!.querySelector('.intro');
    const extra = doc.createElement('a');
    extra.href = 'https://book.douban.com/author/30226/';
    extra.textContent = '全部作品';
    saramagoIntro?.appendChild(extra);

    const saramago = extract().items.find((i) => i.name === '若泽-萨拉马戈');
    expect(saramago).toBeDefined();
    // roles 与 works 同源（intros[0]），roles 为整段文本
    expect(saramago?.roles.startsWith('葡萄牙作家')).toBe(true);
    expect(saramago?.works.map((w) => w.title)).toEqual(['失明症漫记', '杀死一只歌鸟']);
  });

  test('edge — 无 em / 无头像作者：name 文本回退，photoUrl 空串', () => {
    mount();
    const tokarczuk = extract().items.find((i) => i.name.includes('奥尔加'));
    expect(tokarczuk?.name).toBe('奥尔加-托卡尔丘克');
    expect(tokarczuk?.photoUrl).toBe('');
    expect(tokarczuk?.roles).toBe('作家');
    expect(tokarczuk?.works.map((w) => w.title)).toEqual(['太古和其他的时间']);
  });

  test('edge — displayName 回退：头像无 alt → URL userId；URL 无 /people/ → 空串', () => {
    const doc = mount();
    doc.querySelector('#db-usr-profile .pic img')?.removeAttribute('alt');
    expect(extract().displayName).toBe('renji');

    mount('https://book.douban.com/nobody/authors');
    const d = extract();
    expect(d.userId).toBe('');
    // 无 /people/ 也不炸：displayName 仍取头像 alt，仅 userId 为空
    expect(d.displayName).toBe('Renji');
  });

  test('paginator — thispage + 数字页链接；无 prev span 时 prevPageUrl 空', () => {
    mount();
    const d = extract();
    expect(d.pageLinks).toEqual([
      { label: '1', url: '', current: true },
      { label: '2', url: `${PAGE_URL}?start=25`, current: false },
    ]);
    expect(d.prevPageUrl).toBe('');
    expect(d.nextPageUrl).toBe(`${PAGE_URL}?start=25`);
  });

  test('空列表回退 — items 与 h1 计数同时为 0 → null（documented fallback）', () => {
    const doc = mount();
    doc.querySelectorAll('.grid-view .item').forEach((el) => el.remove());
    const h1 = doc.querySelector('#db-usr-profile .info h1');
    if (h1) h1.textContent = '关注的作者(0)';
    expect(extractBookAuthorsData()).toBeNull();
  });

  test('items 为空但计数 > 0 → 仍返回数据（items: []，total: 28）', () => {
    const doc = mount();
    doc.querySelectorAll('.grid-view .item').forEach((el) => el.remove());
    const d = extract();
    expect(d.items).toEqual([]);
    expect(d.total).toBe(28);
  });
});
