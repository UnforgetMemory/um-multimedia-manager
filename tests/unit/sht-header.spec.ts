import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';

initFileSandbox();
import { JSDOM } from 'jsdom';
import { buildHeader } from '@/scenario/sehuatang/header';
import type { DetailLoader } from '@/scenario/sehuatang/detail-loader';

/**
 * The Sehuatang overlay header (X53). `buildHeader` is pure DOM construction with
 * two injected callbacks plus an injected detail loader, and its output is a
 * load-order contract: `app.ts` resolves the actions cluster as the header's
 * LAST element child and the home/menu pair belongs in the centre column — a
 * reordering there breaks mounting silently instead of failing loudly.
 *
 * Also pinned: the copy-all flow (lazy magnet fetch for cards missing a magnet,
 * the progress label, CRLF-joined clipboard payload, and the finally branch that
 * must refresh the page stats even when saving is still in flight).
 */

const dom = new JSDOM(
  '<!doctype html><html><body><div id="shell"></div><div id="grid"></div></body></html>',
  { url: 'https://www.sehuatang.net/?mod=torrents', pretendToBeVisual: true },
);

const written: string[] = [];

defineGlobal('window', dom.window);
defineGlobal('document', dom.window.document);
defineGlobal('navigator', {
  clipboard: { writeText: (text: string) => Promise.resolve(written.push(text)) },
} as unknown as Navigator);
defineGlobal('Node', dom.window.Node);
defineGlobal('Element', dom.window.Element);
defineGlobal('HTMLElement', dom.window.HTMLElement);
defineGlobal('SVGElement', dom.window.SVGElement);
defineGlobal('requestAnimationFrame', dom.window.requestAnimationFrame.bind(dom.window));
defineGlobal('cancelAnimationFrame', dom.window.cancelAnimationFrame.bind(dom.window));
defineGlobal('chrome', {
  storage: {
    local: {
      get: (_keys: string[], cb: (r: Record<string, unknown>) => void) => cb({}),
      set: (_obj: unknown, cb?: () => void) => cb?.(),
    },
    onChanged: { addListener: () => {}, removeListener: () => {} },
  },
  runtime: {
    id: 'umm-test',
    lastError: undefined,
    sendMessage: (_msg: unknown, cb?: (r: unknown) => void) => cb?.({ success: true }),
    onMessage: { addListener: () => {} },
  },
});

function cardHtml(withMagnet: boolean): string {
  const d = dom.window.document;
  const card = d.createElement('div');
  card.className = 'umm-card';
  if (withMagnet) {
    const a = d.createElement('a');
    a.className = 'umm-magnet-link';
    a.href = 'magnet:?xt=urn:btih:seed';
    card.appendChild(a);
  }
  return card.outerHTML;
}

interface Harness {
  header: HTMLElement;
  shell: HTMLElement;
  grid: HTMLElement;
  loaded: HTMLElement[];
  refreshes: () => number;
}

function setup(cards: string, loadNow?: (card: HTMLElement) => Promise<void>): Harness {
  const d = dom.window.document;
  const shell = d.getElementById('shell')!;
  const grid = d.getElementById('grid')!;
  shell.innerHTML = '';
  grid.innerHTML = cards;

  const loaded: HTMLElement[] = [];
  let refreshes = 0;

  const loader = {
    loadNow: async (cardEl: HTMLElement): Promise<void> => {
      loaded.push(cardEl);
      if (loadNow) {
        await loadNow(cardEl);
        return;
      }
      const a = d.createElement('a');
      a.className = 'umm-magnet-link';
      a.href = `magnet:?xt=urn:btih:${loaded.length}`;
      cardEl.appendChild(a);
    },
  } as unknown as DetailLoader;

  const header = buildHeader(shell, grid, loader, {
    updateHeaderInfo: () => {
      refreshes += 1;
    },
    bumpStats: () => {
      refreshes += 1;
    },
  });

  return { header, shell, grid, loaded, refreshes: () => refreshes };
}

function copyBtnOf(header: HTMLElement): HTMLButtonElement {
  const btn = header.querySelector<HTMLButtonElement>('.umm-copy-btn')!;
  btn.disabled = false;
  return btn;
}

function click(btn: HTMLButtonElement): void {
  btn.click();
}

const tick = (ms = 0): Promise<void> => new Promise((r) => setTimeout(r, ms));

test('结构与时序契约：header 占 shell 首位，actions 是最后一个子节点', () => {
  const h = setup(cardHtml(true));
  expect(h.shell.firstElementChild).toBe(h.header);

  const actions = h.header.lastElementChild;
  expect(actions?.querySelector('.umm-copy-btn'), 'actions 必须是最后一个子节点').not.toBeNull();

  const centreKids = Array.from(h.header.querySelectorAll('.umm-sht-center > *'));
  expect(centreKids).toHaveLength(2);
  expect(centreKids[1]?.classList.contains('umm-sht-action')).toBe(true);
  expect(centreKids[1]?.textContent).toBe('☰');

  expect(h.header.querySelector('.umm-sht-stat-area .umm-header-info')).not.toBeNull();
  expect(h.header.querySelector('.umm-sht-stat-area .umm-sht-stats')).not.toBeNull();
  expect(h.header.querySelector('.umm-copy-btn')?.hasAttribute('disabled')).toBe(true);
});

test('没有可复制卡片时直接返回：不懒加载、不写剪贴板、不刷新统计', async () => {
  const h = setup('');
  click(copyBtnOf(h.header));
  await tick();

  expect(h.loaded).toEqual([]);
  expect(h.refreshes()).toBe(0);
  expect(written).toEqual([]);
});

test('缺磁力的卡片并发补抓，进度写进按钮文案，复制体按 CRLF 连接', async () => {
  written.length = 0;
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  const h = setup(cardHtml(false) + cardHtml(false), async (cardEl) => {
    await gate;
    const a = dom.window.document.createElement('a');
    a.className = 'umm-magnet-link';
    a.href = `magnet:?xt=urn:btih:${cardEl === h.loaded[0] ? 'x1' : 'x2'}`;
    cardEl.appendChild(a);
  });

  const btn = copyBtnOf(h.header);
  click(btn);
  await tick();

  expect(h.loaded).toHaveLength(2);
  expect(btn.textContent, 'progress label must show while the fetch is pending').toMatch(
    /\(0\/2\)/,
  );
  expect(btn.getAttribute('data-umm-copying'), 'copying marker must be set').toBe('1');

  release();
  await tick(20);

  expect(written).toHaveLength(1);
  expect((written[0] ?? '').split('\r\n')).toHaveLength(2);
  expect(written[0]).toContain('magnet:?xt=urn:btih:x1');
  expect(h.refreshes(), 'finally 分支必须刷新本页统计').toBeGreaterThanOrEqual(1);
  expect(btn.hasAttribute('data-umm-copying')).toBe(false);

  // Success feedback that this module owns: the copied pulse on each magnet link.
  // (The legacy toast DOM is NOT asserted here — FloatingToast caches its
  // container against whichever `document` was global when it first ran, so a
  // cross-module DOM query passes standalone and fails in a merged worker; the
  // toast itself is covered by the toast specs.)
  expect(
    h.grid.querySelectorAll('.umm-magnet-link.umm-sht-copied').length,
    'copied pulse missing',
  ).toBe(2);
});

test('已看卡片不进入复制范围（只处理 .umm-card:not(.umm-viewed)）', async () => {
  written.length = 0;
  const d = dom.window.document;
  const viewed = d.createElement('div');
  viewed.className = 'umm-card umm-viewed';
  const viewedLink = d.createElement('a');
  viewedLink.className = 'umm-magnet-link';
  viewedLink.href = 'magnet:?xt=urn:btih:viewed';
  viewed.appendChild(viewedLink);

  const h = setup(cardHtml(false));
  h.grid.appendChild(viewed);

  const btn = copyBtnOf(h.header);
  click(btn);
  await tick(20);

  expect(h.loaded).toHaveLength(1);
  expect(written).toHaveLength(1);
  expect(written[0]).not.toContain('urn:btih:viewed');
});
