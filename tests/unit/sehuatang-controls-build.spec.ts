import { test, expect } from '@playwright/test';
import { JSDOM } from 'jsdom';
import {
  extractPagination,
  buildBreadcrumbBar,
  buildTabsBar,
  buildPager,
  buildActions,
  buildSearchUrl,
  buildSearchBox,
  type PaginationData,
} from '@/entrypoints/content/handlers/sehuatang-controls';
import { BASE_URL, pgFromHtml, PAGE1_PG } from './sehuatang-controls-fixtures';

/**
 * 色花堂控件「构建器」层单测（自 sehuatang-controls.spec.ts 按测试组拆出）：
 * 数据 → 项目基准 UI 元素（JSDOM smoke）+ 搜索 URL 契约 + 搜索框重建。
 */

test.describe('构建器（JSDOM smoke）', () => {
  test('面包屑条：锚点 href/current 类名/分隔符', () => {
    const dom = new JSDOM('<body></body>', { url: BASE_URL });
    const bar = buildBreadcrumbBar(dom.window.document, [
      { text: '论坛', href: 'https://www.sehuatang.net/forum.php', current: false },
      { text: '高清中文字幕', href: 'https://www.sehuatang.net/forum-103-1.html', current: true },
    ])!;
    const links = bar.querySelectorAll('a');
    expect(links).toHaveLength(2);
    expect(links[1]!.getAttribute('href')).toBe('https://www.sehuatang.net/forum-103-1.html');
    expect(links[1]!.className).toContain('umm-sht-crumb--current');
    expect(bar.querySelectorAll('.umm-sht-crumb-sep')).toHaveLength(1);
  });

  test('选项卡条：激活态 aria-current + 计数 span', () => {
    const dom = new JSDOM('<body></body>', { url: BASE_URL });
    const bar = buildTabsBar(dom.window.document, [
      { text: '全部', href: 'https://www.sehuatang.net/forum-103-1.html', count: '', active: true },
      {
        text: '有码高清',
        href: 'https://www.sehuatang.net/forum.php?mod=forumdisplay&fid=103&filter=typeid&typeid=480',
        count: '37534',
        active: false,
      },
    ])!;
    const tabs = bar.querySelectorAll('a');
    expect(tabs[0]!.getAttribute('aria-current')).toBe('page');
    expect(tabs[1]!.querySelector('.umm-sht-tab-count')!.textContent).toBe('37534');
  });

  test('分页条：第 1 页 prev 禁用、窗口化 1 [2 3] … 1495、跳转输入与计数器', () => {
    const data = extractPagination(pgFromHtml(PAGE1_PG))!;
    const dom = new JSDOM('<body></body>', { url: BASE_URL });
    const bar = buildPager(dom.window.document, data)!;
    const first = bar.firstElementChild!;
    expect(first.className).toContain('umm-sht-pg-nav--disabled');
    expect(first.getAttribute('href')).toBeNull();
    // 上下页图标按钮（‹ ›）带 aria-label（图标化去文字后读屏/悬浮文案兜底）。
    expect(first.getAttribute('aria-label')).toBe('上一页');
    expect(bar.querySelector('a.umm-sht-pg-nav')!.getAttribute('aria-label')).toBe('下一页');
    expect(bar.querySelector('.umm-sht-pg-page--current')!.textContent).toBe('1');
    expect(bar.querySelector('.umm-sht-pg-page--current')!.getAttribute('aria-current')).toBe(
      'page',
    );
    expect(bar.querySelector('.umm-sht-pg-gap')!.textContent).toBe('…');
    expect(Array.from(bar.querySelectorAll('a.umm-sht-pg-page')).map((a) => a.textContent)).toEqual(
      ['2', '3', '1495'],
    );
    expect(bar.querySelector('.umm-sht-pg-jump')!.getAttribute('inputmode')).toBe('numeric');
    expect((bar.querySelector('.umm-sht-pg-jump') as HTMLInputElement).value).toBe('1');
    expect(bar.querySelector('.umm-sht-pg-total')!.textContent).toBe('1 / 1495');
  });

  test('分页条：当前页=末页时胶囊代替链接，窗口推导邻页 href（模板来自原版 .last）', () => {
    const dom = new JSDOM('<body></body>', { url: BASE_URL });
    const data: PaginationData = {
      current: 1495,
      total: 1495,
      prevHref: 'https://www.sehuatang.net/forum-103-1494.html',
      nextHref: '',
      pages: [
        {
          label: '... 1495',
          page: 1495,
          href: 'https://www.sehuatang.net/forum-103-1495.html',
          last: true,
        },
      ],
      jumpTemplate: '',
    };
    const bar = buildPager(dom.window.document, data)!;
    expect(Array.from(bar.querySelectorAll('a.umm-sht-pg-page')).map((a) => a.textContent)).toEqual(
      ['1', '1493', '1494'],
    );
    expect(bar.querySelector('a.umm-sht-pg-page')!.getAttribute('href')).toBe(
      'https://www.sehuatang.net/forum-103-1.html',
    );
    expect(bar.querySelector('.umm-sht-pg-page--current')!.textContent).toBe('1495');
    expect(
      Array.from(bar.querySelectorAll('a.umm-sht-pg-page')).some((a) => a.textContent === '1495'),
    ).toBe(false);
  });

  test('空数据 → null；动作按钮：返回链接 + 发新帖按钮', () => {
    const dom = new JSDOM('<body></body>', { url: BASE_URL });
    const empty: PaginationData = {
      current: 0,
      total: 0,
      prevHref: '',
      nextHref: '',
      pages: [],
      jumpTemplate: '',
    };
    expect(buildPager(dom.window.document, empty)).toBeNull();
    expect(buildBreadcrumbBar(dom.window.document, [])).toBeNull();
    expect(buildTabsBar(dom.window.document, [])).toBeNull();

    const back = dom.window.document.createElement('a');
    back.setAttribute('href', 'https://www.sehuatang.net/forum.php');
    back.textContent = '返\u00a0回';
    const post = dom.window.document.createElement('a');
    post.setAttribute('title', '发新帖');
    const buttons = buildActions(dom.window.document, back, post);
    expect(buttons).toHaveLength(2);
    expect(buttons[0]!.getAttribute('href')).toBe('https://www.sehuatang.net/forum.php');
    expect(buttons[0]!.textContent).toBe('返 回');
    expect(buttons[1]!.textContent).toBe('发新帖');
  });
});

test.describe('buildSearchUrl — 搜索 GET 契约（纯函数）', () => {
  test('原生 scbar action + 关键词 → srchtxt 追加 + searchsubmit 原地覆盖（无重复键）', () => {
    const url = buildSearchUrl(
      'https://www.sehuatang.net/search.php?searchsubmit=yes',
      BASE_URL,
      '自行打包',
    );
    expect(url).toBe(
      'https://www.sehuatang.net/search.php?searchsubmit=yes&mod=forum&srchtxt=%E8%87%AA%E8%A1%8C%E6%89%93%E5%8C%85',
    );
  });

  test('空 action 回退 Discuz 通用形态（相对 base 解析）', () => {
    const url = buildSearchUrl('', BASE_URL, 'ABC-123');
    // 参数顺序遵循 URLSearchParams 原地更新语义（fallback 串自带 mod/searchsubmit，
    // srchtxt 追加在末尾）；GET 查询参数顺序无语义影响。
    expect(url).toBe(
      'https://www.sehuatang.net/search.php?mod=forum&searchsubmit=yes&srchtxt=ABC-123',
    );
  });

  test('空白关键词 → null；非 http(s) 协议 → null', () => {
    expect(buildSearchUrl('', BASE_URL, '   ')).toBeNull();
    expect(buildSearchUrl('javascript:alert(1)', BASE_URL, 'x')).toBeNull();
    expect(buildSearchUrl('data:text/html,x', BASE_URL, 'x')).toBeNull();
  });
});

test.describe('buildSearchBox — 搜索框重建（原生 #scbar 的 overlay 替身）', () => {
  function docWith(): Document {
    const dom = new JSDOM(
      '<form id="scbar_form" action="https://www.sehuatang.net/search.php?searchsubmit=yes"></form>',
      { url: BASE_URL },
    );
    return dom.window.document;
  }

  test('结构：input + 🔍 按钮 + placeholder/aria-label', () => {
    const doc = docWith();
    const box = buildSearchBox(doc);
    expect(box.className).toBe('umm-sht-searchbox');
    const input = box.querySelector('.umm-sht-search-input') as HTMLInputElement;
    const btn = box.querySelector('.umm-sht-search-btn') as HTMLButtonElement;
    expect(input).not.toBeNull();
    expect(btn).not.toBeNull();
    expect(input.placeholder.length).toBeGreaterThan(0);
    expect(input.getAttribute('aria-label')).toBe(input.placeholder);
    expect(btn.textContent).toBe('🔍');
  });

  test('Enter 与按钮触发 navigate（注入 spy）；URL 含 srchtxt + mod=forum', () => {
    const doc = docWith();
    const seen: string[] = [];
    const box = buildSearchBox(doc, { navigate: (url) => seen.push(url) });
    const input = box.querySelector('.umm-sht-search-input') as HTMLInputElement;
    const btn = box.querySelector('.umm-sht-search-btn') as HTMLButtonElement;

    input.value = ' 自行打包 ';
    input.dispatchEvent(
      new doc.defaultView!.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain('search.php');
    expect(seen[0]).toContain('mod=forum');
    expect(seen[0]).toContain('srchtxt=%E8%87%AA%E8%A1%8C%E6%89%93%E5%8C%85');

    btn.click();
    expect(seen).toHaveLength(2);
  });

  test('空白关键词 → 不触发 navigate（静默 no-op）', () => {
    const doc = docWith();
    const seen: string[] = [];
    const box = buildSearchBox(doc, { navigate: (url) => seen.push(url) });
    const input = box.querySelector('.umm-sht-search-input') as HTMLInputElement;
    const btn = box.querySelector('.umm-sht-search-btn') as HTMLButtonElement;
    input.value = '   ';
    btn.click();
    input.dispatchEvent(
      new doc.defaultView!.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
    expect(seen).toEqual([]);
  });
});
