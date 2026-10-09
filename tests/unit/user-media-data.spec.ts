import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';
import { JSDOM } from 'jsdom';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractUserMediaData } from '@/scenario/douban/pages/user-media/user-media-data';
import type { UserMediaPageData } from '@/scenario/douban/pages/user-media/types';

// Installs happen inside tests below; register this file's sandbox hooks at module scope.
initFileSandbox();

/**
 * user-media (movie.douban.com/people/{uid}/collect|wish|do + /mine 变体)
 * extraction spec — X11-4 coverage wave. Global-DOM module built on
 * extractCollectPageShell → each test installs a fresh JSDOM over
 * tests/fixtures/douban/user-media.html (synthetic Douban-shaped DOM).
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(HERE, '../fixtures/douban/user-media.html');
const PAGE_URL = 'https://movie.douban.com/people/xingxing/collect/all';

function mount(url: string = PAGE_URL): Document {
  const dom = new JSDOM(fs.readFileSync(FIXTURE, 'utf-8'), { url, runScripts: 'outside-only' });
  defineGlobal('window', dom.window);
  defineGlobal('document', dom.window.document);
  defineGlobal('location', dom.window.location);
  defineGlobal('Node', dom.window.Node);
  defineGlobal('HTMLElement', dom.window.HTMLElement);
  return dom.window.document;
}

function extract(): UserMediaPageData {
  const data = extractUserMediaData();
  expect(data).not.toBeNull();
  return data as UserMediaPageData;
}

test.describe('user-media-data 提取', () => {
  test('happy path — collect 页 shell（subType/userId/总数/页码/模式）', () => {
    mount();
    const d = extract();
    expect(d.subType).toBe('collect');
    expect(d.userId).toBe('xingxing');
    expect(d.displayName).toBe('星星');
    expect(d.avatarUrl).toBe('https://img3.doubanio.com/icon/u9876543-2.jpg');
    expect(d.total).toBe(2513);
    expect(d.currentPage).toBe('1-25');
    expect(d.mode).toBe('grid');
    // .sort 文本节点 → 当前排序（active, url 空）；锚点 → 可切换项
    expect(d.sortOptions).toEqual([
      { label: '标记日期', url: '', active: true },
      { label: '评价', url: '?sort=rating', active: false },
      { label: '标题', url: '?sort=title', active: false },
    ]);
    expect(d.navLinks.map((n) => n.label)).toEqual(['主页', '我看', '我读']);
  });

  test('items — 评分 ratingN-t / 无评分回退 0 / .info 链接兜底 / 非 subject 跳过', () => {
    mount();
    const d = extract();
    // 第 4 个 .item 链接无 /subject/ → subjectId 失败，整条跳过
    expect(d.items).toHaveLength(3);

    const good = d.items[0]!;
    expect(good.subjectId).toBe('36185501');
    expect(good.title).toBe('好东西');
    expect(good.rating).toBe('5');
    expect(good.date).toBe('2024-11-23 看过');
    expect(good.comment).toBe('举重若轻，年度最佳。');
    expect(good.posterUrl).toBe(
      'https://img1.doubanio.com/view/photo/s_ratio_poster/p2923492298.jpg',
    );
    expect(good.url).toBe('https://movie.douban.com/subject/36185501/');

    const unRated = d.items.find((i) => i.subjectId === '2589592');
    expect(unRated?.rating).toBe('0');
    expect(unRated?.comment).toBe('');

    // 无 .title：链接走 .info a[href*="/subject/"]，title 取链接全文；无图 → posterUrl ''
    const fallback = d.items[2]!;
    expect(fallback.subjectId).toBe('1291544');
    expect(fallback.title).toBe('违规建筑暂名');
    expect(fallback.rating).toBe('3');
    expect(fallback.posterUrl).toBe('');
  });

  test('filterGroups — .tabs-more 标签去冒号 / lnk-tab-more current / 无列表为空组 / 无标签组丢弃', () => {
    mount();
    const d = extract();
    expect(d.filterGroups).toHaveLength(2);
    expect(d.filterGroups[0]).toEqual({
      label: '类型',
      current: '全部',
      items: [
        { label: '剧情', url: '?tag=剧情' },
        { label: '喜剧', url: '?tag=喜剧' },
        { label: '科幻', url: '?tag=科幻' },
      ],
    });
    // 全角冒号 + 无 ul.tabs-more-list → items 空数组但组保留
    expect(d.filterGroups[1]).toEqual({ label: '标签', current: '未选', items: [] });
  });

  test('paginator — thispage/数字页/next；无 prev span → prevPageUrl 空', () => {
    mount();
    const d = extract();
    expect(d.pageLinks.map((p) => p.label)).toEqual(['1', '2', '3']);
    expect(d.pageLinks[0]!.current).toBe(true);
    expect(d.pageLinks[1]!.url).toBe(`${PAGE_URL}?start=25`);
    expect(d.nextPageUrl).toBe(`${PAGE_URL}?start=25`);
    expect(d.prevPageUrl).toBe('');
  });

  test('URL 变体 — wish 页 subType 传导', () => {
    mount('https://movie.douban.com/people/xingxing/wish/all');
    expect(extract().subType).toBe('wish');
  });

  test('userId 兜底链 — /mine 无 /people/ 时经侧栏 profile 链接解析', () => {
    mount('https://movie.douban.com/mine/collect/all');
    const d = extract();
    expect(d.userId).toBe('xingxing');
    expect(d.subType).toBe('collect');
  });

  test('edge — "|" 分隔符锚点被过滤（shell 全量 → user-media 剔除）', () => {
    const doc = mount();
    const li = doc.createElement('li');
    li.innerHTML = '<a href="https://movie.douban.com/people/xingxing/">|</a>';
    doc.querySelector('#db-usr-profile .info ul')?.appendChild(li);
    expect(extract().navLinks.map((n) => n.label)).toEqual(['主页', '我看', '我读']);
  });

  test('列表空但 subject-num 总数 > 0 → null（documented fallback，交 mount 层兜底）', () => {
    const doc = mount();
    doc.querySelectorAll('.grid-view .item').forEach((el) => el.remove());
    expect(extractUserMediaData()).toBeNull();
  });

  test('subject-num 缺失 → h1 "(N)" 计数兜底', () => {
    const doc = mount();
    doc.querySelector('.subject-num')?.remove();
    const h1 = doc.querySelector('#db-usr-profile .info h1');
    if (h1) h1.textContent = '我的收藏(2513)';
    const d = extract();
    expect(d.total).toBe(2513);
    expect(d.currentPage).toBe('');
  });

  test('subject-num 与 h1 计数均缺失 → 经末页 start=N + 当页条数推算 total', () => {
    const doc = mount();
    doc.querySelector('.subject-num')?.remove();
    const h1 = doc.querySelector('#db-usr-profile .info h1');
    if (h1) h1.textContent = '星星的影视合集';
    const d = extract();
    // 末页 ?start=50 + 本页 3 条有效 → 53
    expect(d.total).toBe(53);
  });

  test('mode — 无 .grid-on 开关 → list 视图', () => {
    const doc = mount();
    doc.querySelector('.grid-on')?.remove();
    expect(extract().mode).toBe('list');
  });
});
