import { test, expect } from '@playwright/test';
import { JSDOM } from 'jsdom';
import { buildCard, renderSkeleton, cardTrackKeys } from '@/scenario/sehuatang/card-render';
import type { SehuatangThread } from '@/entrypoints/content/handlers/sehuatang-extract';

/**
 * 卡片渲染原语契约（2026-09-25 自 app.ts 拆出）。
 *
 * 抽出的动机：`buildCard` / `renderSkeleton` / `cardTrackKeys` 原先嵌在 678 行
 * 编排模块内且不导出，无法单独覆盖；抽出后为无状态函数，可直接以 JSDOM 测试。
 *
 * 卡片 DOM 契约（dimmer / 隐藏 / 已看标记全依赖这些属性，勿改）：
 *   data-avid = trackId（番号优先，提不出则 TID 兜底）· data-tid · data-title · data-url
 */

/** 被测函数使用全局 document，故为其装配 jsdom 文档。 */
function useDom(html = ''): Document {
  const dom = new JSDOM(`<body>${html}</body>`, { url: 'https://www.sehuatang.net/' });
  (globalThis as unknown as { document: Document }).document = dom.window.document;
  return dom.window.document;
}

function thread(overrides: Partial<SehuatangThread> = {}): SehuatangThread {
  return {
    tid: '3664524',
    trackId: 'SSIS-001',
    title: 'SSIS-001 标题',
    url: 'https://www.sehuatang.net/thread-3664524-1-1.html',
    releaseDate: '2026-09-01',
    ...overrides,
  } as SehuatangThread;
}

test.describe('buildCard — 卡片 DOM 契约', () => {
  test('双键与元数据全部落到 data-* 属性（dimmer/隐藏/复制依赖）', () => {
    useDom();
    const card = buildCard(thread());

    expect(card.className).toBe('umm-card');
    expect(card.getAttribute('data-avid')).toBe('SSIS-001');
    expect(card.getAttribute('data-tid')).toBe('3664524');
    expect(card.getAttribute('data-title')).toBe('SSIS-001 标题');
    expect(card.getAttribute('data-url')).toBe('https://www.sehuatang.net/thread-3664524-1-1.html');
  });

  test('trackId 为 null（无番号帖）→ 不设 data-avid，但 data-tid 仍在', () => {
    useDom();
    const card = buildCard(thread({ trackId: null }));

    expect(card.getAttribute('data-avid')).toBeNull();
    expect(card.getAttribute('data-tid')).toBe('3664524');
  });

  test('标题进入 h3 锚点且经 HTML 转义（防注入）', () => {
    useDom();
    const card = buildCard(thread({ title: '<img src=x onerror=alert(1)>' }));

    const anchor = card.querySelector('.umm-card-title a');
    expect(anchor?.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(card.querySelector('.umm-card-title img')).toBeNull();
  });

  test('非 http(s) 的 url → href 置空（协议白名单，锚点不可导航）', () => {
    useDom();
    const card = buildCard(thread({ url: 'javascript:alert(1)' }));

    const anchor = card.querySelector('.umm-card-title a');
    expect(anchor?.getAttribute('href')).toBe('');
    // data-url 保留原始值（落库/复制路径另有校验）
    expect(card.getAttribute('data-url')).toBe('javascript:alert(1)');
  });

  test('日期渲染到 meta 行', () => {
    useDom();
    const card = buildCard(thread({ releaseDate: '2026-09-01' }));
    expect(card.querySelector('.umm-card-meta')?.textContent).toBe('2026-09-01');
  });
});

test.describe('renderSkeleton — 骨架占位', () => {
  test('按 count 生成骨架卡并替换网格既有子节点', () => {
    const doc = useDom('<div id="grid"><div>旧卡</div></div>');
    const grid = doc.getElementById('grid') as HTMLElement;

    renderSkeleton(grid, 3);

    const cards = grid.querySelectorAll('.umm-sht-skel');
    expect(cards).toHaveLength(3);
    expect(grid.textContent).not.toContain('旧卡');
    expect(cards[0]!.getAttribute('aria-hidden')).toBe('true');
  });

  test('count = 0 → 清空网格（不残留旧子节点）', () => {
    const doc = useDom('<div id="grid"><div>旧卡</div></div>');
    const grid = doc.getElementById('grid') as HTMLElement;

    renderSkeleton(grid, 0);

    expect(grid.children).toHaveLength(0);
  });
});

test.describe('cardTrackKeys — 双键读取', () => {
  test('同时返回 avid 与 tid 两把键', () => {
    const doc = useDom('<div id="c" data-avid="SSIS-001" data-tid="123"></div>');
    expect(cardTrackKeys(doc.getElementById('c') as HTMLElement)).toEqual(['SSIS-001', '123']);
  });

  test('属性缺失或空串被过滤（不产生空键）', () => {
    const doc = useDom('<div id="a" data-avid="" data-tid="456"></div><div id="b"></div>');
    expect(cardTrackKeys(doc.getElementById('a') as HTMLElement)).toEqual(['456']);
    expect(cardTrackKeys(doc.getElementById('b') as HTMLElement)).toEqual([]);
  });
});
