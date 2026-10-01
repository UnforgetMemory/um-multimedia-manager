import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';

initFileSandbox();
import { JSDOM } from 'jsdom';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractCelebritiesPageData,
  type CelebritiesPageData,
} from '@/scenario/douban/pages/celebrities/celebrities-data';

/**
 * celebrities (subject /celebrities) extraction spec — X11-4 coverage wave.
 * The module reads the global `document`, so each test installs a fresh JSDOM
 * over tests/fixtures/douban/celebrities.html (synthetic Douban-shaped DOM).
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(HERE, '../fixtures/douban/celebrities.html');
const PAGE_URL = 'https://movie.douban.com/subject/36299525/celebrities';

/** Install a fresh JSDOM (globals + returned document) for one test. */
function mount(): Document {
  const dom = new JSDOM(fs.readFileSync(FIXTURE, 'utf-8'), {
    url: PAGE_URL,
    runScripts: 'outside-only',
  });
  defineGlobal('window', dom.window);
  defineGlobal('document', dom.window.document);
  defineGlobal('location', dom.window.location);
  defineGlobal('Node', dom.window.Node);
  defineGlobal('HTMLElement', dom.window.HTMLElement);
  return dom.window.document;
}

/** Extract with non-null assertion centralized (null cases assert explicitly elsewhere). */
function extract(): CelebritiesPageData {
  const data = extractCelebritiesPageData();
  expect(data).not.toBeNull();
  return data as CelebritiesPageData;
}

test.describe('celebrities-data 提取（/subject/{id}/celebrities）', () => {
  test('happy path — 标题 + 分组顺序 + 导演条目全字段', () => {
    mount();
    const d = extract();
    expect(d.title).toBe('抓特务 的全部演职员');
    // 制片人组唯一条目缺 .info → 组空 → 整组丢弃（celebrities.length>0 门槛）
    expect(d.groups.map((g) => g.heading)).toEqual(['导演 Director', '演员 Cast']);

    const director = d.groups[0]!.celebrities[0]!;
    expect(director.personageId).toBe('27481219');
    expect(director.name).toBe('冯小刚 Xiaogang Feng');
    expect(director.personageUrl).toBe('https://movie.douban.com/personage/27481219/');
    // avatar 从 style="background-image: url('...')" 提取（单引号变体）
    expect(director.avatar).toBe('https://img2.doubanio.com/view/personage/m/public/27481219.jpg');
    expect(director.role).toBe('导演 Director');
    expect(director.roleDetail).toBe('导演 Director');
    expect(director.hasDoubanAccount).toBe(false);
    // works 保持页面顺序，title 属性优先
    expect(director.works.map((w) => w.title)).toEqual(['芳华', '非诚勿扰3', '一声叹息']);
    expect(director.works[0]!.url).toBe('https://movie.douban.com/subject/1291858/');
  });

  test('演员组 — has-account / sns-card 两种认证标记，无标记为 false', () => {
    mount();
    const cast = extract().groups[1]!.celebrities;
    // 雷佳音：a.has-account → true；roleDetail 取 title 属性
    const lei = cast.find((c) => c.personageId === '27559201');
    expect(lei?.hasDoubanAccount).toBe(true);
    expect(lei?.roleDetail).toBe('演员 Actor (饰 肖大力)');
    expect(lei?.works).toHaveLength(2);
    // 周野芒：无 has-account 类，但 li 含 .sns-card → true
    const zhou = cast.find((c) => c.personageId === '27520001');
    expect(zhou?.hasDoubanAccount).toBe(true);
    // avatar 无内联背景 → 空串
    expect(zhou?.avatar).toBe('');
    // 冯小刚（导演组）不带任何认证标记 → false，见 happy path 断言
  });

  test('edge — 无 title 属性的 role 回退为 role 文本；&quot; 双引号 url() 背景可解析', () => {
    mount();
    const hu = extract().groups[1]!.celebrities.find((c) => c.personageId === '27400011');
    expect(hu?.role).toBe('演员 Actor (饰 马识途)');
    expect(hu?.roleDetail).toBe('演员 Actor (饰 马识途)');
    // 无 works 区块 → 空数组
    expect(hu?.works).toEqual([]);
    // style 里 url(&quot;...&quot;) → 解析回双引号包裹的 URL
    expect(hu?.avatar).toBe('https://img1.doubanio.com/f/movie/placeholder.png');
  });

  test('edge — 无 personage 链接 / 无 info 的条目被跳过', () => {
    mount();
    const d = extract();
    // 演员组 4 个 li，"饰 路人甲" 无 personage 链接 → 只剩 3
    expect(d.groups[1]!.celebrities).toHaveLength(3);
    expect(d.groups[1]!.celebrities.some((c) => c.role.includes('路人甲'))).toBe(false);
  });

  test('works 无 title 属性时回退链接文本（mutation：剥掉 title）', () => {
    const doc = mount();
    doc.querySelector<HTMLAnchorElement>('.works a[href*="1291858"]')?.removeAttribute('title');
    const director = extract().groups[0]!.celebrities[0]!;
    expect(director.works[0]?.title).toBe('芳华');
  });

  test('#celebrities 缺失 → null', () => {
    const doc = mount();
    doc.getElementById('celebrities')?.remove();
    expect(extractCelebritiesPageData()).toBeNull();
  });
});
