import { test, expect } from '@playwright/test';
import { JSDOM } from 'jsdom';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import locales from '@/entrypoints/content/i18n/locales';
import {
  extractPersonageCreationsPageData,
  recordStatusBadge,
  type PersonageCreationsPageData,
} from '@/scenario/douban/pages/personage-creations/personage-creations-data';

/**
 * personage-creations 数据提取单元测试。
 *
 * 使用仓库内合成夹具 tests/fixtures/douban/personage-creations.html
 * （豆瓣 creations 页 DOM 形态的确定性复刻，无真实用户数据）作为基础夹具，
 * 覆盖 5 个 URL 变体：
 *   1. type=filmmaker&role=&sortby=time&format=pic   （默认时间排序）
 *   2. sortby=vote&type=filmmaker&role=&format=pic    （评价排序）
 *   3. role=A1&sortby=vote                             （演员）
 *   4. role=A3&sortby=vote                             （出镜）
 *   5. role=A2&sortby=vote                             （配音）
 * 另覆盖分组布局（sortby=collection 推测结构）与 title 兜底。
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REF_HTML = path.resolve(HERE, '../fixtures/douban/personage-creations.html');

const BASE_URL = 'https://www.douban.com/personage/27235071/creations';

function loadReferenceHtml(): string {
  return fs.readFileSync(REF_HTML, 'utf-8');
}

/** Build a JSDOM from the reference HTML with an override URL. */
function domAt(url: string): { window: Window; document: Document } {
  const dom = new JSDOM(loadReferenceHtml(), { url, runScripts: 'outside-only' });
  return { window: dom.window as unknown as Window, document: dom.window.document };
}

/**
 * 按评价排序的页面：.sort 中"按评价排序"标记 cur，并在 .sort 后插入
 * 评分统计表格（参考 creations.cc53b.css 中 .sort table 样式）。
 */
function mutateToVoteSort(doc: Document): void {
  const sortLis = doc.querySelectorAll('.sort li a');
  sortLis.forEach((a) => {
    const text = a.textContent?.trim() || '';
    a.classList.toggle('cur', text.includes('评价'));
  });
  // 豆瓣在 .sort 后渲染统计表格
  const sortUl = doc.querySelector('.sort');
  const table = doc.createElement('table');
  table.innerHTML = `
    <tr><td><span>10分</span></td><td><span>9分</span></td><td><span>8分</span></td></tr>
  `;
  sortUl?.after(table);
}

/** 模拟按标记排序的分组布局：将 li.creation 包进分组容器。 */
function mutateToGrouped(doc: Document): void {
  const creationsUl = doc.querySelector('ul.creations');
  if (!creationsUl) return;
  const items = Array.from(
    creationsUl.querySelectorAll('li.creation'),
  ) as unknown as HTMLLIElement[];
  creationsUl.innerHTML = '';
  const groups: Array<[string, HTMLLIElement[]]> = [
    ['看过', items.slice(0, 3)],
    ['想看', items.slice(3, 6)],
    ['未标记', items.slice(6)],
  ];
  for (const [title, groupItems] of groups) {
    const div = doc.createElement('div');
    div.className = 'group';
    const h = doc.createElement('h3');
    h.textContent = title;
    const ul = doc.createElement('ul');
    ul.className = 'creations';
    groupItems.forEach((li) => ul.appendChild(li));
    div.append(h, ul);
    creationsUl.appendChild(div);
  }
}

test.describe('recordStatusBadge — 记录状态徽标映射（Status: 1=Wishlist 2=Done 3=Doing）', () => {
  // X107：徽标标签改为 i18n 键（渲染层解析），纯函数只负责「状态 → 键 + 变体」。
  // 可见文案由下方「键 ↔ zh-CN 词典值」配对钉住，保证抽取不改变默认语言渲染。
  test('1 → 想看/wish', () => {
    expect(recordStatusBadge(1)).toEqual({ labelKey: 'douban.pc.badge_wish', variant: 'wish' });
  });

  test('2 → 看过/collect（Done，非"在看"）', () => {
    expect(recordStatusBadge(2)).toEqual({ labelKey: 'douban.pc.badge_done', variant: 'collect' });
  });

  test('3 → 在看/do（Doing，非"看过"）', () => {
    expect(recordStatusBadge(3)).toEqual({ labelKey: 'douban.pc.badge_doing', variant: 'do' });
  });

  test('0 与其他值 → null（不显示徽标）', () => {
    expect(recordStatusBadge(0)).toBeNull();
    expect(recordStatusBadge(4)).toBeNull();
    expect(recordStatusBadge(-1)).toBeNull();
  });

  test('键 ↔ 文案配对：三键在 zh-CN 词典里各自解析为原可见串（换键即红）', () => {
    expect(locales['zh-CN']['douban.pc.badge_wish']).toBe('想看');
    expect(locales['zh-CN']['douban.pc.badge_doing']).toBe('在看');
    expect(locales['zh-CN']['douban.pc.badge_done']).toBe('看过');
  });
});

test.describe('personage-creations 数据提取', () => {
  test('URL1: time 排序 + 全部角色 — 合成夹具基线', () => {
    const url = `${BASE_URL}?type=filmmaker&role=&sortby=time&format=pic`;
    const { document } = domAt(url);
    const data = extractPersonageCreationsPageData(document, url);

    expect(data).not.toBeNull();
    const d = data as PersonageCreationsPageData;
    expect(d.personageId).toBe('27235071');
    expect(d.personName).toBe('贾静雯 Alyssa Chia');
    expect(d.totalWorks).toBe(101);
    expect(d.currentType).toBe('filmmaker');
    expect(d.currentSort).toBe('time');
    expect(d.currentRole).toBe('');
    // 夹具第一页渲染 10 条（101 部作品 / data-total-page=10，与 h1 计数一致）
    expect(d.creations.length).toBe(10);
    expect(d.currentPage).toBe(1);
    expect(d.totalPages).toBe(10);
    expect(d.hasNext).toBe(true);
    expect(d.hasPrev).toBe(false);

    // 角色选项完整（X107：label → i18n 键；可见文案由词典配对钉住）
    const labels = d.roleOptions.map((r) => `${r.role}:${r.labelKey}`);
    expect(labels).toEqual([
      'A1:douban.pc.role_actor',
      'A3:douban.pc.role_guest',
      'A2:douban.pc.role_dub',
    ]);
    expect(d.roleOptions.every((r) => !r.active)).toBe(true);

    // 首条作品（魔法阿妈2）—— `!`：上方 length===10 断言已守卫（测试代码允许）。
    const first = d.creations[0]!;
    expect(first.title).toBe('魔法阿妈2');
    expect(first.year).toBe('2028');
    expect(first.status).toBe('未上映');
    expect(first.role).toContain('演员');
    expect(first.director).toContain('王小棣');
    expect(first.rating).toBe('');
  });

  test('URL2: vote 排序 + 统计表格 — 解析不受影响', () => {
    const url = `${BASE_URL}?sortby=vote&type=filmmaker&role=&format=pic`;
    const { document } = domAt(url);
    mutateToVoteSort(document);
    const data = extractPersonageCreationsPageData(document, url);

    expect(data).not.toBeNull();
    const d = data as PersonageCreationsPageData;
    expect(d.currentSort).toBe('vote');
    expect(d.currentRole).toBe('');
    expect(d.creations.length).toBe(10);
  });

  test('URL3: role=A1 演员 + vote 排序 — 角色状态正确', () => {
    const url = `${BASE_URL}?type=filmmaker&role=A1&sortby=vote&format=pic`;
    const { document } = domAt(url);
    mutateToVoteSort(document);
    const data = extractPersonageCreationsPageData(document, url);

    expect(data).not.toBeNull();
    const d = data as PersonageCreationsPageData;
    expect(d.currentSort).toBe('vote');
    expect(d.currentRole).toBe('douban.pc.role_actor');
    expect(d.roleOptions.find((r) => r.role === 'A1')?.active).toBe(true);
    expect(d.roleOptions.find((r) => r.role === 'A2')?.active).toBe(false);
    expect(d.roleOptions.find((r) => r.role === 'A3')?.active).toBe(false);
    expect(d.creations.length).toBe(10);
  });

  test('URL4: role=A3 出镜 + vote 排序 — 角色状态正确', () => {
    const url = `${BASE_URL}?type=filmmaker&role=A3&sortby=vote&format=pic`;
    const { document } = domAt(url);
    mutateToVoteSort(document);
    const data = extractPersonageCreationsPageData(document, url);

    expect(data).not.toBeNull();
    const d = data as PersonageCreationsPageData;
    expect(d.currentRole).toBe('douban.pc.role_guest');
    expect(d.roleOptions.find((r) => r.role === 'A3')?.active).toBe(true);
    expect(d.roleOptions.find((r) => r.role === 'A1')?.active).toBe(false);
    expect(d.roleOptions.find((r) => r.role === 'A2')?.active).toBe(false);
  });

  test('URL5: role=A2 配音 + vote 排序 — 角色状态正确', () => {
    const url = `${BASE_URL}?type=filmmaker&role=A2&sortby=vote&format=pic`;
    const { document } = domAt(url);
    mutateToVoteSort(document);
    const data = extractPersonageCreationsPageData(document, url);

    expect(data).not.toBeNull();
    const d = data as PersonageCreationsPageData;
    expect(d.currentRole).toBe('douban.pc.role_dub');
    expect(d.roleOptions.find((r) => r.role === 'A2')?.active).toBe(true);
    expect(d.roleOptions.find((r) => r.role === 'A1')?.active).toBe(false);
  });

  test('持久设计：原生 #role_filter 完全缺失时角色选项仍完整且 active 正确（回归锚点）', () => {
    // 角色选项是持久设计（固有常量），不依赖原生 #role_filter 下拉 —
    // 该下拉在不同排序/角色变体下渲染不一致（甚至缺失），UMM 按钮不能丢。
    const cases = [
      {
        role: 'A1',
        key: 'douban.pc.role_actor',
        url: `${BASE_URL}?type=filmmaker&role=A1&sortby=vote&format=pic`,
      },
      {
        role: 'A2',
        key: 'douban.pc.role_dub',
        url: `${BASE_URL}?type=filmmaker&role=A2&sortby=vote&format=pic`,
      },
      {
        role: 'A3',
        key: 'douban.pc.role_guest',
        url: `${BASE_URL}?type=filmmaker&role=A3&sortby=vote&format=pic`,
      },
    ];
    for (const c of cases) {
      const { document } = domAt(c.url);
      mutateToVoteSort(document);
      // 移除原生角色筛选下拉 — 模拟边界变体
      document.querySelector('#role_filter')?.remove();
      const data = extractPersonageCreationsPageData(document, c.url) as PersonageCreationsPageData;

      // 按钮必须完整（不丢失）
      expect(data.roleOptions.map((r) => `${r.role}:${r.labelKey}`)).toEqual([
        'A1:douban.pc.role_actor',
        'A3:douban.pc.role_guest',
        'A2:douban.pc.role_dub',
      ]);
      // URL 参数对应的选项必须 active，其余必须非 active
      for (const opt of data.roleOptions) {
        expect(opt.active).toBe(opt.role === c.role);
      }
      // 角色选项 URL 保留当前排序/类型参数
      for (const opt of data.roleOptions) {
        const u = new URL(opt.url);
        expect(u.searchParams.get('sortby')).toBe('vote');
        expect(u.searchParams.get('type')).toBe('filmmaker');
        expect(u.searchParams.get('role')).toBe(opt.role);
      }
      // 当前角色键正确
      expect(data.currentRole).toBe(c.key);
    }
  });

  test('无 role 参数时全部选项均非 active（"全部"按钮高亮）', () => {
    const url = `${BASE_URL}?type=filmmaker&role=&sortby=time&format=pic`;
    const { document } = domAt(url);
    const data = extractPersonageCreationsPageData(document, url) as PersonageCreationsPageData;

    expect(data.currentRole).toBe('');
    expect(data.roleOptions.every((r) => !r.active)).toBe(true);
  });

  test('角色键 ↔ 文案配对：zh-CN 词典解析为 演员/出镜/配音（换键或换值即红）', () => {
    expect(locales['zh-CN']['douban.pc.role_actor']).toBe('演员');
    expect(locales['zh-CN']['douban.pc.role_guest']).toBe('出镜');
    expect(locales['zh-CN']['douban.pc.role_dub']).toBe('配音');
  });

  test('分组布局（按标记排序推测结构）— 全局 .creation 选择器仍提取全部', () => {
    const url = `${BASE_URL}?sortby=collection&type=filmmaker&role=&format=pic`;
    const { document } = domAt(url);
    mutateToGrouped(document);
    // The mutator no-ops when the anchor ul is gone; without this the test would
    // silently measure the flat fixture and pin nothing about grouping.
    expect(document.querySelectorAll('div.group')).toHaveLength(3);
    const inContent = document.querySelectorAll('#content li.creation').length;
    const everywhere = document.querySelectorAll('li.creation').length;
    // Fixture precondition: one item lives outside #content (sidebar shape) and
    // must be skipped even though the selector itself is global.
    expect(inContent).toBeGreaterThan(0);
    expect(everywhere).toBeGreaterThan(inContent);

    const data = extractPersonageCreationsPageData(document, url);

    expect(data).not.toBeNull();
    const d = data as PersonageCreationsPageData;
    expect(d.creations.length).toBe(inContent);
    expect(d.currentSort).toBe('time'); // 分组布局下未显式标记排序链接
  });

  test('h1 缺失时从 document.title 兜底', () => {
    const url = `${BASE_URL}?type=filmmaker&role=&sortby=time&format=pic`;
    const { document } = domAt(url);
    document.querySelector('#content h1')?.remove();
    const data = extractPersonageCreationsPageData(document, url);

    expect(data).not.toBeNull();
    const d = data as PersonageCreationsPageData;
    expect(d.personName).toBe('贾静雯 Alyssa Chia');
    expect(d.totalWorks).toBe(101);
  });

  test('作品项字段提取 — 评分与角色解析', () => {
    const url = `${BASE_URL}?type=filmmaker&role=&sortby=time&format=pic`;
    const { document } = domAt(url);
    const data = extractPersonageCreationsPageData(document, url) as PersonageCreationsPageData;

    // 回魂计：allstar35 → 7.0；含饰演角色
    const huiHunJi = data.creations.find((c) => c.title === '回魂计');
    expect(huiHunJi).toBeDefined();
    expect(huiHunJi?.rating).toBe('7.0');
    expect(huiHunJi?.status).toBe('');
    expect(huiHunJi?.role).toContain('演员');
    expect(huiHunJi?.role).toContain('饰');

    // 蜡烛台：allstar20 → 4.0
    const laZhuTai = data.creations.find((c) => c.title === '蜡烛台');
    expect(laZhuTai?.rating).toBe('4.0');

    // 未评分作品（allstar00）→ rating 为空
    const moFa = data.creations.find((c) => c.title === '魔法阿妈2');
    expect(moFa?.rating).toBe('');
  });

  test('非 creations 页面 → null', () => {
    const { document } = domAt(`${BASE_URL}?type=filmmaker`);
    // 清空内容与标题
    document.querySelector('#content h1')?.remove();
    document.querySelectorAll('li.creation').forEach((li) => li.remove());
    document.title = '';
    const data = extractPersonageCreationsPageData(
      document,
      'https://www.douban.com/personage/27235071/',
    );
    expect(data).toBeNull();
  });
});
