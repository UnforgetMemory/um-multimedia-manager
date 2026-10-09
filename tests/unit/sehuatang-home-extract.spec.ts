import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';
import { JSDOM } from 'jsdom';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractIndexCategories,
  extractIndexStats,
  type SehuatangCategory,
} from '@/scenario/sehuatang/home-extract';

/**
 * sehuatang home-extract unit coverage (X11-5b).
 *
 * The module reads the ambient document (content-script style), so each test
 * installs a fresh JSDOM over tests/fixtures/sehuatang/index.html — a
 * synthetic Discuz pg_index page reproducing exactly the queried shape:
 * [id^="category_"] DIV.bm_c + preceding .bm_h h2, td.fl_g cells (dt a /
 * dt em "(N)" today count / dd em stats / lastpost dd / trailing .clp
 * sub-forum dd), the category_N_img id decoy, and #chart .chart em strip.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(HERE, '../fixtures/sehuatang/index.html');

const INDEX_URL = 'https://www.sehuatang.net/forum.php?mod=guide&view=index';

initFileSandbox();

/** Fresh JSDOM over the fixture with document installed as a global. */
function domAt(url: string = INDEX_URL): Document {
  const dom = new JSDOM(fs.readFileSync(FIXTURE, 'utf-8'), { url });
  defineGlobal('document', dom.window.document);
  return dom.window.document as unknown as Document;
}

function categoryById(cats: SehuatangCategory[], id: string): SehuatangCategory | undefined {
  return cats.find((c) => c.id === id);
}

test.describe('extractIndexCategories — 首页分区导航', () => {
  test('分区清单：有效 category 容器入选，img 诱饵/无 bm_c/空分区被守卫排除', () => {
    domAt();
    const cats = extractIndexCategories();
    expect(cats.map((c) => c.id)).toEqual(['category_2', 'category_5', 'category_7']);
    // category_2_img（IMG 诱饵）、category_99（无有效 fl_g）、category_9（无 bm_c）
    expect(cats.some((c) => c.id.includes('_img'))).toBe(false);
    expect(categoryById(cats, 'category_99')).toBeUndefined();
    expect(categoryById(cats, 'category_9')).toBeUndefined();
  });

  test('分区标题：h2>span 正常路径 + 无 span / 无 h2 的兜底', () => {
    domAt();
    const cats = extractIndexCategories();
    expect(categoryById(cats, 'category_2')?.title).toBe('原创BT电影');
    // h2 存在但无内层 span → h2 整段文本
    expect(categoryById(cats, 'category_5')?.title).toBe('欧美BT剧集');
    // 无 h2 → 以分区 id 兜底（不静默丢分区）
    expect(categoryById(cats, 'category_7')?.title).toBe('category_7');
  });

  test('子版块全字段：新帖二态图标 / 今日新增 / 主题帖数 / 最后发表', () => {
    domAt();
    const forums = extractIndexCategories()[0]?.forums ?? [];
    expect(forums.map((f) => f.name)).toEqual(['国产原创', '欧美原创', '鲍鱼直播盒子', '综合讨论']);
    // 无 dt>a 的占位格（广告位）被跳过
    expect(forums.some((f) => f.name.includes('广告位'))).toBe(false);

    const original = forums[0];
    expect(original).toMatchObject({
      href: 'forum-8-1.html',
      iconSrc: 'static/image/common/forum_new.gif',
      hasNew: true,
      todayCount: 45,
      threadsCount: '1万',
      postsCount: '247万',
      lastPostLabel: '最后发表: 2 小时前',
    });
    // forum.gif（无新帖态）+ 无今日 em → hasNew false / todayCount null
    const western = forums[1];
    expect(western).toMatchObject({
      iconSrc: 'static/image/common/forum.gif',
      hasNew: false,
      todayCount: null,
      threadsCount: '77869',
      lastPostLabel: '最后发表: 从未',
    });
  });

  test('最后发表取第二个 dd 而非末位：.clp 子分类 dd 不得串台（缺陷锚点）', () => {
    domAt();
    const original = extractIndexCategories()[0]?.forums[0];
    expect(original?.lastPostLabel).toBe('最后发表: 2 小时前');
    expect(original?.lastPostLabel ?? '').not.toContain('子分类');
  });

  test('外链版块单 dd「链接到外部地址」透传；统计形态单 dd 不透传', () => {
    domAt();
    const forums = extractIndexCategories()[0]?.forums ?? [];
    // 单 dd 非主题/帖数开头 → 原文透传（避免误显示「从未」）
    expect(forums[2]?.lastPostLabel).toBe('链接到外部地址');
    // 单 dd 且以「主题」开头（DOM 漂移防御）→ null
    expect(forums[3]?.lastPostLabel).toBeNull();
    expect(forums[3]?.threadsCount).toBe('30万');
  });

  test('无 href 锚点 → href 兜底 #；无图标 → iconSrc null / hasNew false', () => {
    domAt();
    const pending = categoryById(extractIndexCategories(), 'category_5')?.forums.find(
      (f) => f.name === '待迁移版块',
    );
    expect(pending).toMatchObject({ href: '#', iconSrc: null, hasNew: false });
    expect(pending?.todayCount).toBeNull();
  });

  test('非首页（无任何 category_ 容器）→ 空数组，编排层据此 dismiss', () => {
    const document = domAt();
    document.querySelectorAll('[id^="category_"]').forEach((el) => el.remove());
    expect(extractIndexCategories()).toEqual([]);
  });
});

test.describe('extractIndexStats — 首页统计条', () => {
  test('正常：#chart .chart 前四个 em 依次映射 今日/昨日/帖子/会员', () => {
    domAt();
    expect(extractIndexStats()).toEqual({
      today: '128',
      yesterday: '246',
      posts: '3578万',
      members: '69万',
    });
  });

  test('em 不足四个 → null（整段放弃，不猜缺失位）', () => {
    const document = domAt();
    document.querySelectorAll('#chart .chart em').forEach((em, i) => {
      if (i >= 3) em.remove();
    });
    expect(extractIndexStats()).toBeNull();
  });

  test('任一 em 为空文本 → null（站点未渲染完时不显示半截统计）', () => {
    const document = domAt();
    const second = document.querySelectorAll('#chart .chart em')[1];
    if (second) second.textContent = '';
    expect(extractIndexStats()).toBeNull();
  });

  test('无 #chart → null', () => {
    const document = domAt();
    document.getElementById('chart')?.remove();
    expect(extractIndexStats()).toBeNull();
  });
});
