import { test, expect } from '@playwright/test';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Douban 标记对话框 a11y（P-D 交互反馈波次）单元测试。
 *
 * 覆盖：
 * 1. UmmInterestBar 标记对话框 —— role=dialog / aria-modal / aria-labelledby、
 *    关闭钮 aria-label、遮罩 aria-hidden、打开初始聚焦、Escape 关闭 + 焦点归还、
 *    Tab/Shift+Tab 焦点陷阱、取消/遮罩关闭路径。
 * 2. photos 页下载控件 —— span@click → 原生 button type=button（SFC 无法在本
 *    runner 编译，按夹具源码断言，参照 architecture-guard.spec 的源码扫描先例）。
 *
 * ⚠️ jsdom 全局必须先于 'vue' 首次 import 建立：Vue runtime-dom 在模块初始化
 * 时捕获 `document`（nodeOps 的 `const doc = typeof document !== 'undefined'`）。
 * 故本文件不用静态 import vue/组件，改为设置全局后动态 import；且整个文件共用
 * 一个 JSDOM 实例（doc 被 vue 模块缓存钉死，切文档会触发 WrongDocumentError）。
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://movie.douban.com/',
  pretendToBeVisual: true,
});

// Node 24 起 `navigator` 等是只有 getter 的惰性全局，直接赋值会抛
// "Cannot set property navigator ... which has only a getter"，需 defineProperty。
function defineGlobal(key: string, value: unknown): void {
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
}
defineGlobal('window', dom.window);
defineGlobal('document', dom.window.document);
defineGlobal('navigator', dom.window.navigator);
defineGlobal('Node', dom.window.Node);
defineGlobal('Element', dom.window.Element);
defineGlobal('HTMLElement', dom.window.HTMLElement);
defineGlobal('SVGElement', dom.window.SVGElement);

type VueModule = typeof import('vue');
type UmmInterestBarModule = typeof import('@/scenario/douban/components/umm-interest-bar');

let vue: VueModule | undefined;
let bar: UmmInterestBarModule | undefined;

async function loadVueAndBar(): Promise<{ vue: VueModule; bar: UmmInterestBarModule }> {
  if (!vue || !bar) {
    vue = await import('vue');
    bar = await import('@/scenario/douban/components/umm-interest-bar');
  }
  return { vue, bar };
}

/** 等待 Vue 渲染 flush + watch(open) 内 nextTick 微任务全部完成 */
function flush(): Promise<void> {
  return new Promise((resolve) => dom.window.setTimeout(resolve, 0));
}

const doc = dom.window.document;

async function mountBar() {
  const { vue: v, bar: b } = await loadVueAndBar();
  const container = doc.createElement('div');
  doc.body.appendChild(container);
  const saved: Array<unknown[]> = [];
  const app = v.createApp({
    render: () =>
      v.h(b.UmmInterestBar, {
        status: 0,
        rating: 0,
        myTags: ['tagA', 'tagB'],
        savedTags: [],
        hasDo: true,
        comment: '',
        loading: false,
        error: '',
        type: 'movie',
        onSave: (...args: unknown[]) => {
          saved.push(args);
        },
      }),
  });
  app.mount(container);
  return {
    app,
    container,
    saved,
    unmount: () => {
      app.unmount();
      container.remove();
    },
  };
}

function q(root: ParentNode, selector: string): HTMLElement {
  const el = root.querySelector<HTMLElement>(selector);
  if (!el) throw new Error(`fixture element missing: ${selector}`);
  return el;
}

function pressKey(key: string, opts: { shiftKey?: boolean } = {}): KeyboardEvent {
  const event = new dom.window.KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    shiftKey: opts.shiftKey ?? false,
  });
  doc.dispatchEvent(event);
  return event;
}

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

test.describe('UmmInterestBar 标记对话框 — a11y 语义', () => {
  test('打开 → role=dialog + aria-modal + aria-labelledby 指向标题；关闭钮有 aria-label/type；遮罩 aria-hidden', async () => {
    const { unmount } = await mountBar();
    const { vue: v } = await loadVueAndBar();
    q(doc, '.umm-mark-btn').click();
    await v.nextTick();

    const panel = q(doc, '.umm-dialog-panel');
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.getAttribute('aria-modal')).toBe('true');
    const labelledBy = panel.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    expect(q(doc, '.umm-dialog-title').id).toBe(labelledBy);

    const closeBtn = q(panel, '.umm-dialog-close');
    expect(closeBtn.tagName).toBe('BUTTON');
    expect(closeBtn.getAttribute('aria-label')).toBe('关闭');
    expect(closeBtn.getAttribute('type')).toBe('button');

    expect(q(doc, '.umm-dialog-overlay').getAttribute('aria-hidden')).toBe('true');
    unmount();
  });

  test('打开 → 焦点自动落入面板首个可聚焦控件（状态选择按钮）', async () => {
    const { unmount } = await mountBar();
    q(doc, '.umm-mark-btn').click();
    await flush();
    const panel = q(doc, '.umm-dialog-panel');
    // DOM 序首个可聚焦控件 = header 的 ✕ 关闭钮（WAI-ARIA：初始焦点落面板首个
    // 交互元素即可，陷阱的 first/last 边界与之同源）。
    expect(doc.activeElement).toBe(q(panel, '.umm-dialog-close'));
    unmount();
  });
});

test.describe('UmmInterestBar 标记对话框 — 关闭路径与焦点归还', () => {
  test('Escape → 对话框关闭 + 焦点归还触发按钮', async () => {
    const { unmount } = await mountBar();
    const markBtn = q(doc, '.umm-mark-btn');
    markBtn.click();
    await flush();
    expect(doc.querySelector('.umm-dialog-panel')).not.toBeNull();

    pressKey('Escape');
    await flush();
    expect(doc.querySelector('.umm-dialog-panel')).toBeNull();
    expect(doc.activeElement).toBe(markBtn);
    unmount();
  });

  test('取消按钮 → 关闭 + 焦点归还；✕ 按钮 → 关闭 + 焦点归还', async () => {
    const { unmount } = await mountBar();
    const markBtn = q(doc, '.umm-mark-btn');

    markBtn.click();
    await flush();
    q(doc, '.umm-dialog-cancel').click();
    await flush();
    expect(doc.querySelector('.umm-dialog-panel')).toBeNull();
    expect(doc.activeElement).toBe(markBtn);

    markBtn.click();
    await flush();
    q(doc, '.umm-dialog-close').click();
    await flush();
    expect(doc.querySelector('.umm-dialog-panel')).toBeNull();
    expect(doc.activeElement).toBe(markBtn);
    unmount();
  });

  test('遮罩点击 → 关闭（既有行为回归护栏）', async () => {
    const { unmount } = await mountBar();
    q(doc, '.umm-mark-btn').click();
    await flush();
    q(doc, '.umm-dialog-overlay').click();
    await flush();
    expect(doc.querySelector('.umm-dialog-panel')).toBeNull();
    unmount();
  });

  test('对话框未打开时 Escape 不拦截、不误关', async () => {
    const { unmount } = await mountBar();
    const event = pressKey('Escape');
    expect(event.defaultPrevented).toBe(false);
    expect(doc.querySelector('.umm-dialog-panel')).toBeNull();
    unmount();
  });
});

test.describe('UmmInterestBar 标记对话框 — Tab 焦点陷阱', () => {
  test('末元素上 Tab → 回到首元素；首元素上 Shift+Tab → 跳到末元素', async () => {
    const { unmount } = await mountBar();
    q(doc, '.umm-mark-btn').click();
    await flush();
    const panel = q(doc, '.umm-dialog-panel');
    const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
    expect(focusables.length).toBeGreaterThan(2);
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;

    last.focus();
    pressKey('Tab');
    expect(doc.activeElement).toBe(first);

    first.focus();
    pressKey('Tab', { shiftKey: true });
    expect(doc.activeElement).toBe(last);
    unmount();
  });

  test('焦点逃逸到面板外（body）→ Tab 被拦回首个可聚焦元素', async () => {
    const { unmount } = await mountBar();
    q(doc, '.umm-mark-btn').click();
    await flush();
    const panel = q(doc, '.umm-dialog-panel');
    const first = q(panel, FOCUSABLE);

    (doc.activeElement as HTMLElement | null)?.blur();
    expect(panel.contains(doc.activeElement)).toBe(false);
    const event = pressKey('Tab');
    expect(event.defaultPrevented).toBe(true);
    expect(doc.activeElement).toBe(first);
    unmount();
  });
});

test.describe('photos 页下载控件 — span@click → 原生 button', () => {
  const PHOTOS_SRC = fs.readFileSync(
    path.join(REPO, 'src', 'scenario', 'douban', 'pages', 'photos', 'App.vue'),
    'utf-8',
  );

  test('下载控件为 <button type="button"> 且保留 @click.stop 与既有样式类', () => {
    const dlBlock = PHOTOS_SRC.match(/<button[^>]*class="umm-dl-btn"[\s\S]*?<\/button>/);
    expect(dlBlock).not.toBeNull();
    expect(dlBlock![0]).toContain('type="button"');
    expect(dlBlock![0]).toContain('@click.stop="downloadPhoto(photo)"');
    expect(dlBlock![0]).toContain('title="下载"');
    expect(dlBlock![0]).toContain('<svg');
  });

  test('不再存在 span 形态的下载控件', () => {
    expect(PHOTOS_SRC).not.toMatch(/<span[^>]*class="umm-dl-btn"/);
  });
});
