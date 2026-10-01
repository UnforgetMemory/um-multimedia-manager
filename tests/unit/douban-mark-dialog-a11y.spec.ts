import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';

initFileSandbox();
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initI18nSync, t } from '@/entrypoints/content/i18n';
import locales from '@/entrypoints/content/i18n/locales';

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

defineGlobal('window', dom.window);
defineGlobal('document', dom.window.document);
defineGlobal('navigator', dom.window.navigator);
defineGlobal('Node', dom.window.Node);
defineGlobal('Element', dom.window.Element);
defineGlobal('HTMLElement', dom.window.HTMLElement);
defineGlobal('SVGElement', dom.window.SVGElement);
// i18n 的 initI18nSync() 读裸 `localStorage`（node 侧不存在）；挂在 dom.window 上
// 的那份才是它能看到的那份，故显式提升为全局。
defineGlobal('localStorage', dom.window.localStorage);

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
    // 期望值与产品同源：本 worker 的 locale 由「谁第一个 initI18n()」决定（i18n
    // 模块级 currentLocale 跨文件共享），钉死中文会在文件分派变化时假红。
    expect(closeBtn.getAttribute('aria-label')).toBe(t('Close'));
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
    // X108：title 文案入词典（渲染时解析）——钉「绑定在、键正确」，不钉渲染产物。
    expect(dlBlock![0]).toContain(':title="t(\'douban.photos.download\')"');
    expect(dlBlock![0]).toContain('<svg');
  });

  test('不再存在 span 形态的下载控件', () => {
    expect(PHOTOS_SRC).not.toMatch(/<span[^>]*class="umm-dl-btn"/);
  });
});

/**
 * X105 — 条上/对话框文案在**渲染时**经 content i18n 解析。
 *
 * 状态文案表（`scenario/douban/shared/status-labels.ts`）曾是模块加载期就定死的中文字面量
 * 表，语言设置永远到不了它（audit §18 的「测试绿 ≠ 生产接上」）。现在它是 getter → t()，
 * 于是这一组断言同时证伪两种退化：
 *  - 又退回字面量表、或退回「模块加载期取一次快照」：两条用例共用同一个已加载的模块实例
 *    （loadVueAndBar 缓存，不重新 import），第二条换了语言仍必须拿到新文案；
 *  - 键接错（wish 徽章去取 done_* 键）：期望值按 key 直接从对应 locale 词典取——既不复制
 *    字面量，也不用 t() 自己当期望（那样恒真）。
 */
const LOCALE_KEY = 'umm:locale';
const HAN = /[一-鿿]/;

test.describe('UmmInterestBar 标记对话框 — 文案随语言在渲染时解析', () => {
  test.afterEach(() => {
    // currentLocale 是模块级单例：不还原就把语言泄漏给串行分片里后面的每个文件。
    // 先落回模块默认（zh-CN）再清 key，storage 与状态都不留残迹。
    dom.window.localStorage.setItem(LOCALE_KEY, 'zh-CN');
    initI18nSync();
    dom.window.localStorage.removeItem(LOCALE_KEY);
  });

  for (const locale of ['zh-CN', 'en-US'] as const) {
    test(`${locale}：标题/按钮/选项/星级标签落该语言，且键↔位置配对正确`, async () => {
      dom.window.localStorage.setItem(LOCALE_KEY, locale);
      initI18nSync();
      const expected = locales[locale];

      const { vue: v } = await loadVueAndBar();
      const { unmount } = await mountBar();
      q(doc, '.umm-mark-btn').click();
      await v.nextTick();

      const text = (selector: string): string | undefined => q(doc, selector).textContent?.trim();
      expect(text('.umm-dialog-title'), '对话框标题键').toBe(expected['douban.btn.mark']);
      expect(text('.umm-dialog-save')).toBe(expected['douban.dialog.save']);
      expect(text('.umm-dialog-cancel')).toBe(expected['douban.dialog.cancel']);
      expect(text('.umm-tag-add-btn')).toBe(expected['douban.dialog.add']);

      // 三个选项按 DOM 顺序即 wish/do/collect，各自落自己的状态键。
      const picks = Array.from(doc.querySelectorAll<HTMLElement>('.umm-dialog-pick'));
      expect(picks.map((p) => p.getAttribute('data-umm-pick'))).toEqual(['wish', 'do', 'collect']);
      expect(picks.map((p) => p.textContent?.trim())).toEqual([
        expected['douban.status.wish_movie'],
        expected['douban.status.doing_movie'],
        expected['douban.status.done_movie'],
      ]);

      // 星级行只在 collect/do 下存在；未选星落 none 键，点第 4 星落 rating.4 键。
      picks[2]!.click();
      await v.nextTick();
      expect(text('.umm-star-label'), '未选星时的标签').toBe(expected['douban.rating.none']);
      const stars = Array.from(doc.querySelectorAll<HTMLElement>('.umm-dialog-stars .umm-star'));
      expect(stars).toHaveLength(5);
      stars[3]!.click();
      await v.nextTick();
      expect(text('.umm-star-label')).toBe(expected['douban.rating.4']);

      // 语言确实换了，而不是两份词典恰好同值：汉字存在性与语言同向。
      expect(HAN.test(text('.umm-dialog-title') ?? '')).toBe(locale !== 'en-US');
      expect(HAN.test(text('.umm-star-label') ?? '')).toBe(locale !== 'en-US');

      unmount();
    });
  }
});
