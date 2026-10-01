import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';
import { JSDOM, type DOMWindow } from 'jsdom';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractBookProfileData } from '@/scenario/douban/pages/book-profile/data';
import type { BookProfileData } from '@/scenario/douban/pages/book-profile/types';

// Installs happen inside mount() below; register this file's sandbox hooks at module scope.
initFileSandbox();

/**
 * book-profile/data.ts behavior lock — book.douban.com/people/<uid>/ page.
 *
 * Fixture tests/fixtures/douban/book-profile.html is a synthetic replica of the
 * DOM contract data.ts queries, so every expected value below is read off the
 * fixture bytes (ids/labels/counts/star classes), never recomputed from the
 * parser. Covers: 侧栏用户信息（含 `用户 <uid>`/空昵称/无日期兜底）、
 * nav-list（链接项 vs activated li vs sep 丢弃）、读过/想读 grid（位置选择器、
 * img[title] 优先于 alt、相对 href/src 绝对化、readTotal 计数优先 + 侧栏兜底、
 * 缺 section）、收藏的作者、最近阅读（日期继承 + action 判定 + 两种星标形态）、
 * 书评（parseRating 半星 allstar45 → 4.5、缺 .ilst 的空字段）、图书豆列，
 * 以及每个提取器各自的「必须跳过」行与 URL 无 /people/<uid> → null。
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(HERE, '../fixtures/douban/book-profile.html');

const BASE = 'https://book.douban.com/people/27235071/';

function mount(url: string): Document {
  const dom: DOMWindow = new JSDOM(fs.readFileSync(FIXTURE, 'utf-8'), { url }).window;
  defineGlobal('window', dom);
  defineGlobal('document', dom.document);
  defineGlobal('location', dom.location);
  return dom.document;
}

/** Narrowed extraction — a null return is a test failure, not a skipped assert. */
function extract(): BookProfileData {
  const data = extractBookProfileData();
  if (!data) throw new Error(`book profile DOM at ${location.href} must extract, got null`);
  return data;
}

test.describe('book-profile 侧栏用户信息与挂载守卫', () => {
  test('happy path: uid/昵称/绝对头像/加入日期/读过·书评计数（未知标签 在读 不参与）', () => {
    mount(BASE);
    expect(extract().user).toEqual({
      userId: '27235071',
      displayName: '贾探花',
      avatarUrl: 'https://img1.doubanio.com/icon/u27235071-8.jpg',
      joinDate: '2011-05-20',
      readCount: 45,
      reviewCount: 7,
    });
  });

  test('uid 取 /people/<id> 首段，查询参数不参与截断', () => {
    mount('https://book.douban.com/people/27235071/?tab=note');
    expect(extract().user.userId).toBe('27235071');
  });

  test('URL 无 /people/<uid> → 整页 null（挂载守卫）', () => {
    mount('https://book.douban.com/subject/36185161/');
    expect(extractBookProfileData()).toBeNull();
  });

  test('edge: 侧栏三项全缺 → displayName 空串（「用户 <uid>」兜底在渲染层，见 x108 e2e）+ 头像/日期空串 + 计数 0', () => {
    const doc = mount(BASE);
    doc.querySelector('.book-user-profile .username')?.remove();
    doc.querySelector('.book-user-profile .avatar')?.remove();
    doc.querySelector('.book-user-profile .time-registered')?.remove();
    doc.querySelector('.book-user-profile .number-item')?.remove();
    expect(extract().user).toEqual({
      userId: '27235071',
      displayName: '',
      avatarUrl: '',
      joinDate: '',
      readCount: 0,
      reviewCount: 7,
    });
  });

  test('edge: .username 存在但为空文案 → displayName 空串（兜底只在节点缺失时生效）', () => {
    const doc = mount(BASE);
    const name = doc.querySelector('.book-user-profile .username');
    if (name) name.textContent = '';
    const time = doc.querySelector('.book-user-profile .time-registered');
    if (time) time.textContent = '加入豆瓣';
    const d = extract();
    expect(d.user.displayName).toBe('');
    expect(d.user.joinDate).toBe('');
  });
});

test.describe('book-profile 导航 tab（#db-usr-profile .nav-list > li）', () => {
  test('5 个 li 出 4 项：链接项 active=false，activated 无链接项取 textContent 且 url 空串', () => {
    const doc = mount(BASE);
    expect(doc.querySelectorAll('#db-usr-profile .nav-list > li')).toHaveLength(5);
    expect(extract().navItems).toEqual([
      { label: '我的主页', url: 'https://book.douban.com/people/27235071/', active: false },
      { label: '图书', url: '', active: true },
      { label: '书评', url: 'https://book.douban.com/people/27235071/reviews', active: false },
      {
        label: '豆列',
        url: 'https://book.douban.com/people/27235071/doulists?subject=0',
        active: false,
      },
    ]);
  });
});

test.describe('book-profile 读过/想读 grid', () => {
  test('读过（第一个 div）5 行出 3 项：img[title] 优先 alt，相对 href/src 绝对化，计数取 h2 .pl a', () => {
    const doc = mount(BASE);
    expect(
      doc.querySelectorAll('#db-book-mine > div:first-child .sub-list .list-s li'),
    ).toHaveLength(5);
    const d = extract();
    expect(d.readBooks).toEqual([
      {
        subjectId: '36185161',
        title: '长安的荔枝（插图珍藏本）',
        coverUrl: 'https://img3.doubanio.com/view/subject/s/public/s36185161.jpg',
        href: 'https://book.douban.com/subject/36185161/',
      },
      {
        subjectId: '26800002',
        title: '盐的路线',
        coverUrl: 'https://book.douban.com/view/subject/s/26800002.jpg',
        href: 'https://book.douban.com/subject/26800002/',
      },
      {
        subjectId: '1001234',
        title: '夜航西飞·新注本',
        coverUrl: 'https://book.douban.com/view/subject/s/1001234.jpg',
        href: 'https://book.douban.com/subject/1001234/',
      },
    ]);
    expect(d.readTotal).toBe(45);
  });

  test('跳过行：无 a.cover 的占位 li 与 href 无 /subject/<数字> 的封面行均不入表', () => {
    const doc = mount(BASE);
    // 夹具前置：5 个 li 只有 4 个 a.cover（占位行无封面链接），其中 1 个 href 无 subject 数字
    const grid = '#db-book-mine > div:first-child .sub-list .list-s';
    expect(doc.querySelectorAll(`${grid} li`)).toHaveLength(5);
    expect(doc.querySelectorAll(`${grid} li a.cover`)).toHaveLength(4);
    const ids = extract().readBooks.map((b) => b.subjectId);
    expect(ids).toEqual(['36185161', '26800002', '1001234']);
    expect(ids).not.toContain('143184672');
  });

  test('想读（第二个 div）2 项 + 计数 18（与读过的 45 互不串台）', () => {
    mount(BASE);
    const d = extract();
    expect(d.wishBooks).toEqual([
      {
        subjectId: '26268201',
        title: '太平洋彼岸的孩子',
        coverUrl: 'https://book.douban.com/view/subject/s/26268201.jpg',
        href: 'https://book.douban.com/subject/26268201/',
      },
      {
        subjectId: '25980843',
        title: '沙丘译本考',
        coverUrl: 'https://img3.doubanio.com/view/subject/s/public/s25980843.jpg',
        href: 'https://book.douban.com/subject/25980843/',
      },
    ]);
    expect(d.wishTotal).toBe(18);
  });

  test('第三个 grid（在读）不参与：位置选择器只取第 1、2 个 div', () => {
    mount(BASE);
    const d = extract();
    const ids = [...d.readBooks, ...d.wishBooks].map((b) => b.subjectId);
    expect(ids).not.toContain('1002222');
    expect(ids).not.toContain('1003333');
    expect(d.readTotal).toBe(45);
    expect(d.wishTotal).toBe(18);
  });

  test('readTotal 回落链：grid 计数链接缺失 → 取侧栏「读过」数字（77 而非 grid 45）', () => {
    const doc = mount(BASE);
    doc.querySelector('#db-book-mine > div:first-child h2 .pl a')?.remove();
    const number = doc.querySelector('.book-user-profile .number-item .number');
    if (number) number.textContent = '77';
    const d = extract();
    expect(d.readTotal).toBe(77);
    expect(d.user.readCount).toBe(77);
    expect(d.readBooks).toHaveLength(3);
  });

  test('readTotal 优先 grid 计数：侧栏「读过」项整体缺失时仍为 45，readCount 归 0', () => {
    const doc = mount(BASE);
    doc.querySelector('.book-user-profile .number-item')?.remove();
    const d = extract();
    expect(d.user.readCount).toBe(0);
    expect(d.readTotal).toBe(45);
  });

  test('edge: #db-book-mine 下无 div → 两组均空，readTotal 回落侧栏，wishTotal 0', () => {
    const doc = mount(BASE);
    doc.querySelectorAll('#db-book-mine > div').forEach((div) => div.remove());
    const d = extract();
    expect(d.readBooks).toEqual([]);
    expect(d.wishBooks).toEqual([]);
    expect(d.readTotal).toBe(45);
    expect(d.wishTotal).toBe(0);
  });
});

test.describe('book-profile 收藏的作者（#author）', () => {
  test('4 行出 2 项：/author/<id> + a:not(.cover) 取姓名，封面相对 src 绝对化', () => {
    const doc = mount(BASE);
    expect(doc.querySelectorAll('#author .sub-list li')).toHaveLength(4);
    expect(extract().authors).toEqual([
      {
        authorId: '1005731',
        name: '刘慈欣',
        avatarUrl: 'https://img3.doubanio.com/img/author/normal/p1005731.jpg',
        href: 'https://book.douban.com/author/1005731/',
      },
      {
        authorId: '1005739',
        name: '加西亚·马尔克斯',
        avatarUrl: 'https://book.douban.com/img/author/normal/p1005739.jpg',
        href: 'https://book.douban.com/author/1005739/',
      },
    ]);
  });

  test('edge: #author 缺失 → authors []（页数据其余字段不受影响）', () => {
    const doc = mount(BASE);
    doc.querySelector('#author')?.remove();
    const d = extract();
    expect(d.authors).toEqual([]);
    expect(d.readBooks).toHaveLength(3);
  });
});

test.describe('book-profile 最近阅读（.aside .mod > .mbt）', () => {
  test('7 行出 3 条：日期跨条目继承、文案判定 read/review/wish、.starb 缺失与异形行跳过', () => {
    const doc = mount(BASE);
    const d = extract();
    expect(doc.querySelectorAll('.mbt > li')).toHaveLength(7);
    expect(d.recentReading).toEqual([
      {
        date: '2026-07-12',
        action: 'read',
        subjectId: '36185161',
        title: '长安的荔枝',
        href: 'https://book.douban.com/subject/36185161/',
        // 真实豆瓣自有评分形态 `user-stars rating40`：命中 [class*="stars"]
        // 却过不了 /stars(\d)/ → 现行为 0（见 spec 顶部说明，疑似生产缺陷）
        rating: 0,
        quote: '一骑红尘妃子笑，无人知是荔枝来。',
      },
      {
        date: '2026-07-12',
        action: 'review',
        subjectId: '26800002',
        title: '盐的路线',
        href: 'https://book.douban.com/subject/26800002/',
        rating: 4,
        quote: '',
      },
      {
        date: '2026-06-30',
        action: 'wish',
        subjectId: '26268201',
        title: '夜航西飞',
        href: 'https://book.douban.com/subject/26268201/',
        rating: 0,
        quote: '',
      },
    ]);
  });

  test('edge: 日期分隔行移除 → 三条 date 全为空串', () => {
    const doc = mount(BASE);
    doc.querySelectorAll('.mbt > li.contact-update-time').forEach((li) => li.remove());
    expect(extract().recentReading.map((r) => r.date)).toEqual(['', '', '']);
  });

  test('edge: 最近阅读 mod 缺失 → recentReading []，豆列 mod 仍正常提取', () => {
    const doc = mount(BASE);
    const mods = doc.querySelectorAll('.aside .mod');
    expect(mods).toHaveLength(2);
    mods[0]?.remove();
    const d = extract();
    expect(d.recentReading).toEqual([]);
    expect(d.doulists).toHaveLength(3);
  });
});

test.describe('book-profile 书评（.comment-m .tlst）', () => {
  test('3 个 .tlst 出 2 篇：allstar45 → 4.5（parseRating 半星）、allstar20 → 2、缺 .ilst 字段空串', () => {
    const doc = mount(BASE);
    expect(doc.querySelectorAll('.comment-m .tlst')).toHaveLength(3);
    expect(extract().reviews).toEqual([
      {
        id: '42831570',
        title: '荔枝里的驿路程序',
        url: 'https://book.douban.com/review/42831570/',
        subjectTitle: '长安的荔枝',
        subjectUrl: 'https://book.douban.com/subject/36185161/',
        coverUrl: 'https://img3.doubanio.com/view/subject/l/public/s36185161.jpg',
        rating: 4.5,
        excerpt: '马伯庸把小吏写成了主角，驿路即程序，荔枝即 KPI。',
      },
      {
        id: '41000000',
        title: '冰与海的边界',
        url: 'https://book.douban.com/review/41000000/',
        subjectTitle: '',
        subjectUrl: '',
        coverUrl: '',
        rating: 2,
        excerpt: '',
      },
    ]);
  });

  test('跳过：推广 .tlst 的标题链接无 /review/<数字> → id 空 → 整条丢弃', () => {
    mount(BASE);
    const titles = extract().reviews.map((r) => r.title);
    expect(titles).not.toContain('本周新书速递');
  });

  test('edge: .comment-m 缺失 → reviews []', () => {
    const doc = mount(BASE);
    doc.querySelector('.comment-m')?.remove();
    const d = extract();
    expect(d.reviews).toEqual([]);
    expect(d.readBooks).toHaveLength(3);
  });
});

test.describe('book-profile 图书豆列（.aside .mod .list-m）', () => {
  test('4 行出 3 项：.rec 取人数，缺 .rec → 0，无链接占位行跳过', () => {
    const doc = mount(BASE);
    expect(doc.querySelectorAll('.aside .mod .list-m li')).toHaveLength(4);
    expect(extract().doulists).toEqual([
      {
        title: '二十世纪中文小说',
        url: 'https://book.douban.com/doulist/143184672/',
        recommendCount: 34,
      },
      {
        title: '银河奖获奖书单',
        url: 'https://book.douban.com/doulist/150000001/',
        recommendCount: 7,
      },
      {
        title: '无关注数的豆列',
        url: 'https://book.douban.com/doulist/150000002/',
        recommendCount: 0,
      },
    ]);
  });

  test('edge: 豆列 mod 缺失 → doulists []', () => {
    const doc = mount(BASE);
    doc.querySelectorAll('.aside .mod')[1]?.remove();
    const d = extract();
    expect(d.doulists).toEqual([]);
    expect(d.recentReading).toHaveLength(3);
  });
});
