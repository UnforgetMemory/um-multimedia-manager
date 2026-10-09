import { test, expect } from '@playwright/test';
import { JSDOM } from 'jsdom';
import {
  extractBreadcrumb,
  extractTypeTabs,
  extractPagination,
  resolveJumpUrl,
  clampPage,
} from '@/entrypoints/content/handlers/sehuatang-controls';
import { BASE_URL, pgHtml, pgFromHtml, PAGE1_PG } from './sehuatang-controls-fixtures';

/**
 * 色花堂控件「提取」层单测（自 sehuatang-controls.spec.ts 按测试组拆出）：
 * 面包屑 / 主题分类选项卡 / 分页（Element → 数据，纯函数）。
 */

test.describe('extractBreadcrumb', () => {
  const BREADCRUMB_HTML = `
    <div class="z">
      <a href="https://www.sehuatang.net/" class="nvhm" title="首页">98堂[原色花堂]</a><em>»</em>
      <a href="https://www.sehuatang.net/forum.php">论坛</a> <em>›</em>
      <a href="https://www.sehuatang.net/forum.php?gid=1">原创BT电影</a><em>›</em>
      <a href="https://www.sehuatang.net/forum-103-1.html">高清中文字幕</a>
    </div>`;

  test('四段面包屑：末位 current、href 原样保留', () => {
    const dom = new JSDOM(BREADCRUMB_HTML);
    const items = extractBreadcrumb(dom.window.document.querySelector('.z'));
    expect(items.map((i) => i.text)).toEqual([
      '98堂[原色花堂]',
      '论坛',
      '原创BT电影',
      '高清中文字幕',
    ]);
    expect(items.map((i) => i.current)).toEqual([false, false, false, true]);
    expect(items[0]!.href).toBe('https://www.sehuatang.net/');
    expect(items[3]!.href).toBe('https://www.sehuatang.net/forum-103-1.html');
  });

  test('null / 空容器 → 空数组', () => {
    expect(extractBreadcrumb(null)).toEqual([]);
    const dom = new JSDOM('<div class="z"></div>');
    expect(extractBreadcrumb(dom.window.document.querySelector('.z'))).toEqual([]);
  });
});

test.describe('extractTypeTabs', () => {
  const TABS_HTML = `
    <ul id="thread_types" class="ttp bm cl">
      <li id="ttp_all" class="xw1 a"><a href="https://www.sehuatang.net/forum-103-1.html">全部</a></li>
      <li><a href="https://www.sehuatang.net/forum.php?mod=forumdisplay&amp;fid=103&amp;filter=typeid&amp;typeid=480">有码高清<span class="xg1 num">37534</span></a></li>
      <li><a href="https://www.sehuatang.net/forum.php?mod=forumdisplay&amp;fid=103&amp;filter=typeid&amp;typeid=481">无码高清<span class="xg1 num">7301</span></a></li>
    </ul>`;

  function tabsFromHtml(html: string, currentUrl: string) {
    const dom = new JSDOM(html, { url: currentUrl });
    return extractTypeTabs(dom.window.document.getElementById('thread_types'), currentUrl);
  }

  test('无 typeid URL → 全部激活，标签文本与计数分离', () => {
    const tabs = tabsFromHtml(TABS_HTML, BASE_URL);
    expect(tabs.map((t) => t.text)).toEqual(['全部', '有码高清', '无码高清']);
    expect(tabs.map((t) => t.count)).toEqual(['', '37534', '7301']);
    expect(tabs.map((t) => t.active)).toEqual([true, false, false]);
  });

  test('typeid=481 URL → 无码高清激活，全部失活', () => {
    const url =
      'https://www.sehuatang.net/forum.php?mod=forumdisplay&fid=103&filter=typeid&typeid=481';
    const tabs = tabsFromHtml(TABS_HTML, url);
    expect(tabs.map((t) => t.active)).toEqual([false, false, true]);
  });

  test('未知 typeid → URL 语义无命中，回退 li.xw1 a 类名标记', () => {
    const url =
      'https://www.sehuatang.net/forum.php?mod=forumdisplay&fid=103&filter=typeid&typeid=999';
    const tabs = tabsFromHtml(TABS_HTML, url);
    expect(tabs.map((t) => t.active)).toEqual([true, false, false]);
  });

  test('null → 空数组；li 缺 a 跳过', () => {
    expect(extractTypeTabs(null, BASE_URL)).toEqual([]);
    const dom = new JSDOM('<ul id="tt"><li></li><li><a>有码高清</a></li></ul>');
    expect(extractTypeTabs(dom.window.document.getElementById('tt'), BASE_URL)).toHaveLength(1);
  });
});

test.describe('extractPagination', () => {
  test('第 1 页：current=1、total=1495、无 prev、next/跳转模板齐备', () => {
    const data = extractPagination(pgFromHtml(PAGE1_PG));
    expect(data.current).toBe(1);
    expect(data.total).toBe(1495);
    expect(data.prevHref).toBe('');
    expect(data.nextHref).toBe('https://www.sehuatang.net/forum-103-2.html');
    expect(data.jumpTemplate).toBe('forum.php?mod=forumdisplay&fid=103&page=');
    expect(data.pages).toHaveLength(10); // 2..10 + last
    expect(data.pages[0]!.page).toBe(2);
    expect(data.pages[9]!.page).toBe(1495);
    expect(data.pages[9]!.last).toBe(true);
    expect(data.pages[9]!.label).toBe('... 1495');
  });

  test('第 2 页：prev 出现且指向第 1 页', () => {
    const data = extractPagination(
      pgFromHtml(pgHtml({ current: 2, withPrev: true, withNext: true })),
    );
    expect(data.current).toBe(2);
    expect(data.prevHref).toBe('https://www.sehuatang.net/forum-103-1.html');
    expect(data.nextHref).toBe('https://www.sehuatang.net/forum-103-2.html');
  });

  test('末页：next 缺省为空串', () => {
    const data = extractPagination(pgFromHtml(pgHtml({ current: 1495, withPrev: true })));
    expect(data.nextHref).toBe('');
  });

  test('无「共 X 页」span → total 回退 .last 页码', () => {
    const data = extractPagination(
      pgFromHtml(pgHtml({ current: 1, withNext: true, withTotalTitle: false })),
    );
    expect(data.total).toBe(1495);
  });

  test('null → 全零默认值', () => {
    expect(extractPagination(null)).toEqual({
      current: 0,
      total: 0,
      prevHref: '',
      nextHref: '',
      pages: [],
      jumpTemplate: '',
    });
  });
});

test.describe('resolveJumpUrl / clampPage', () => {
  test('相对模板 + 页码 → 相对当前页解析为绝对 URL', () => {
    expect(resolveJumpUrl('forum.php?mod=forumdisplay&fid=103&page=', 7, BASE_URL)).toBe(
      'https://www.sehuatang.net/forum.php?mod=forumdisplay&fid=103&page=7',
    );
  });

  test('空模板 / 非法模板 → null', () => {
    expect(resolveJumpUrl('', 7, BASE_URL)).toBeNull();
    expect(resolveJumpUrl('http://[invalid', 7, BASE_URL)).toBeNull();
  });

  test('非 http(s) 协议模板 → null（javascript:/file: 防御）', () => {
    expect(resolveJumpUrl('javascript:alert(1)', 1, BASE_URL)).toBeNull();
    expect(resolveJumpUrl('file:///etc/passwd?', 1, BASE_URL)).toBeNull();
  });

  test('clampPage：边界与 NaN', () => {
    expect(clampPage(0, 1495)).toBe(1);
    expect(clampPage(9999, 1495)).toBe(1495);
    expect(clampPage(-5, 1495)).toBe(1);
    expect(clampPage(2.9, 1495)).toBe(2);
    expect(clampPage(Number.NaN, 1495)).toBe(1);
    expect(clampPage(3, 0)).toBe(1);
  });
});
