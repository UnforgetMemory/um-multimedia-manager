import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';
import { JSDOM } from 'jsdom';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSearchData } from '@/scenario/douban/pages/search/search-data';
import type { DoubanSearchData } from '@/scenario/douban/pages/search/types';

// Installs happen inside tests below; register this file's sandbox hooks at module scope.
initFileSandbox();

/**
 * search 页数据提取单元测试（X11-2 覆盖波）。
 *
 * 夹具 tests/fixtures/douban/search.html 同时复刻两条通路：
 *   A. 页面自带 window.__DATA__（内联 <script type="text/javascript">）——
 *      runScripts:'dangerously' 时脚本执行命中直读分支，
 *      runScripts:'outside-only' 时脚本不执行，改由脚本文本解析分支命中；
 *   B. 渲染后的 .item-root 卡片（移除脚本且无全局时的 DOM 兜底）。
 * 页面判型/宿主由 url-detector 负责，这里只锁定解析契约。
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(HERE, '../fixtures/douban/search.html');
const SEARCH_URL = 'https://search.douban.com/movie/subject_search?search_text=流浪地球&cat=1002';

type GlobalWindow = Window & { __DATA__?: unknown };

interface MountOptions {
  /** 'dangerously' lets the fixture's inline script set window.__DATA__. */
  executePageScripts?: boolean;
  /** Drop the inline payload script so the DOM fallback path is reached. */
  stripPayloadScript?: boolean;
  url?: string;
}

/** Mount the fixture as the ambient window/document/location (content-script contract). */
function mountFixture(opts: MountOptions = {}): { window: GlobalWindow; document: Document } {
  const dom = new JSDOM(fs.readFileSync(FIXTURE, 'utf-8'), {
    url: opts.url ?? SEARCH_URL,
    runScripts: opts.executePageScripts ? 'dangerously' : 'outside-only',
  });
  const win = dom.window as unknown as GlobalWindow;
  defineGlobal('window', win);
  defineGlobal('document', dom.window.document);
  defineGlobal('location', dom.window.location);
  defineGlobal('Node', dom.window.Node);
  defineGlobal('Element', dom.window.Element);
  defineGlobal('HTMLElement', dom.window.HTMLElement);
  if (opts.stripPayloadScript) {
    dom.window.document.querySelectorAll('script').forEach((s) => s.remove());
  }
  return { window: win, document: dom.window.document as unknown as Document };
}

/** Inject a window.__DATA__ payload directly (mirrors what the page script would set). */
function injectData(win: GlobalWindow, data: unknown): void {
  win.__DATA__ = data;
}

test.describe('search 数据提取 — __DATA__ 通路', () => {
  test('页面脚本已执行：直读 window.__DATA__ 并按 search_subject 过滤', async () => {
    mountFixture({ executePageScripts: true });
    const data = await parseSearchData();

    expect(data).toBeDefined();
    const d = data as DoubanSearchData;
    expect(d.total).toBe(24);
    expect(d.start).toBe(0);
    expect(d.text).toBe('流浪地球');
    expect(d.count).toBe(20);
    // 无 id/封面的条目与影人卡（search_person）都被剔除
    expect(d.items.map((i) => i.id)).toEqual([35466880, 26384780]);
    expect(d.items.every((i) => i.tpl_name === 'search_subject')).toBe(true);
  });

  test('脚本未执行（隔离世界/CSP）：从内联脚本文本解析出同一份数据', async () => {
    mountFixture();
    const data = await parseSearchData();

    expect(data).toBeDefined();
    const d = data as DoubanSearchData;
    expect(d.items.map((i) => i.title)).toEqual(['流浪地球2', '流浪地球']);
    expect(d.items[0]?.cover_url).toBe(
      'https://img1.doubanio.com/view/photo/s_ratio_poster/public/p2887380238.jpg',
    );
  });

  test('IMDb 归一化：顶层 imdb 链接优先，缺省时从 abstract/abstract_2 文本里找', async () => {
    mountFixture({ executePageScripts: true });
    const d = (await parseSearchData()) as DoubanSearchData;

    // 条目 1 只带 imdb 链接字段 → tt1517451
    expect(d.items[0]?.imdb).toBe('tt1517451');
    // 条目 2 的 abstract_2 写作 "IMDb: tt2753478"
    expect(d.items[1]?.imdb).toBe('tt2753478');
  });

  test('过滤后为空：原样返回未过滤 payload（调用方仍能拿到条目）', async () => {
    const { window } = mountFixture({ stripPayloadScript: true });
    injectData(window, {
      items: [
        {
          id: 1343103,
          title: '郭帆 Fan Hua',
          cover_url: '',
          abstract: '',
          abstract_2: '',
          url: 'https://movie.douban.com/celebrity/1343103/',
          labels: [],
          interest: { actions: [], status_text: '' },
          tpl_name: 'search_person',
          topics: [],
        },
      ],
      total: 5,
      start: 0,
      text: '郭帆',
      count: 0,
    });
    const d = (await parseSearchData()) as DoubanSearchData;

    expect(d.items).toHaveLength(1);
    expect(d.items[0]?.tpl_name).toBe('search_person');
    expect(d.total).toBe(5);
  });

  test('count 缺失时回落条目数；过滤命中才改写 count', async () => {
    const { window } = mountFixture({ stripPayloadScript: true });
    injectData(window, {
      items: [
        {
          id: 26384780,
          title: '流浪地球',
          cover_url: 'https://img9.doubanio.com/view/photo/s_ratio_poster/public/p2530900336.jpg',
          abstract: '',
          abstract_2: '',
          url: 'https://movie.douban.com/subject/26384780/',
          labels: [],
          interest: { actions: [], status_text: '' },
          tpl_name: 'search_subject',
          topics: [],
        },
      ],
      total: 1,
      start: 0,
      text: '流浪地球',
      count: 0,
    });
    const d = (await parseSearchData()) as DoubanSearchData;

    expect(d.count).toBe(1);
    expect(d.items[0]?.imdb).toBeUndefined();
  });
});

test.describe('search 数据提取 — DOM 兜底通路', () => {
  test('无 __DATA__ 时解析 .item-root：封面/评分/两行 meta/跳过非 subject 卡', async () => {
    const url = `${SEARCH_URL}&start=30`;
    mountFixture({ stripPayloadScript: true, url });
    const d = (await parseSearchData()) as DoubanSearchData;

    // celebrity 卡的链接不含 /subject/{id} → 整卡跳过
    expect(d.items.map((i) => i.id)).toEqual([35466880, 26384780, 36750002]);
    expect(d.start).toBe(30);
    expect(d.text).toBe('流浪地球');
    expect(d.count).toBe(3);
    // 有下一页 → total 按两页估算
    expect(d.total).toBe(6);

    const first = d.items[0]!;
    expect(first.title).toBe('流浪地球2');
    expect(first.cover_url).toBe(
      'https://img1.doubanio.com/view/photo/s_ratio_poster/public/p2887380238.jpg',
    );
    expect(first.rating).toEqual({ count: 0, star_count: 4.5, value: 8.3 });
    expect(first.abstract).toBe('中国大陆 / 科幻 / 冒险 / 郭帆');
    expect(first.abstract_2).toBe('吴京 / 刘德华 / 李雪健');
    expect(first.url).toBe('https://movie.douban.com/subject/35466880/');
    expect(first.tpl_name).toBe('search_subject');
    expect(first.imdb).toBeUndefined();

    // 懒加载封面只有 data-original；无评分数字；meta 行里带 IMDb 编号
    const second = d.items[1]!;
    expect(second.cover_url).toBe(
      'https://img9.doubanio.com/view/photo/s_ratio_poster/public/p2530900336.jpg',
    );
    expect(second.rating).toEqual({ count: 0, star_count: 0, value: 0 });
    expect(second.imdb).toBe('tt2753478');

    // 未上映条目的评分位是文案，parseFloat 失败 → 0；只有一行 meta
    const third = d.items[2]!;
    expect(third.cover_url).toBe(
      'https://img1.doubanio.com/view/photo/s_ratio_poster/public/p2936200101.jpg',
    );
    expect(third.rating.value).toBe(0);
    expect(third.abstract).toBe('中国大陆 / 悬疑 / 短片');
    expect(third.abstract_2).toBe('');
  });

  test('无分页「下一页」时 total 即本页条目数', async () => {
    const { document } = mountFixture({ stripPayloadScript: true });
    document.querySelector('.paginator a.next')?.remove();
    const d = (await parseSearchData()) as DoubanSearchData;

    expect(d.total).toBe(3);
    expect(d.start).toBe(0);
    expect(d.text).toBe('流浪地球');
  });

  test('脚本文本存在但 JSON 损坏：跳过解析并回落到 DOM 卡片', async () => {
    const { document } = mountFixture();
    const script = document.querySelector('script[type="text/javascript"]');
    if (script) script.textContent = 'window.__DATA__ = {"items": [oops}];\nwindow.__USER__ = {};';
    const d = (await parseSearchData()) as DoubanSearchData;

    expect(d.items.map((i) => i.id)).toEqual([35466880, 26384780, 36750002]);
  });

  test('既无 payload 也无结果卡 → undefined，且不残留 data-bridge 节点', async () => {
    const { document } = mountFixture({ stripPayloadScript: true });
    document.querySelectorAll('.item-root').forEach((el) => el.remove());

    expect(await parseSearchData()).toBeUndefined();
    // 注入式桥接用完即删，不能在宿主页面留下指纹
    expect(document.getElementById('umm-data-bridge')).toBeNull();
    expect(document.querySelectorAll('script').length).toBe(0);
  });
});
