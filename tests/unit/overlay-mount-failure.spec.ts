import { test, expect } from '@playwright/test';
import { defineGlobal } from './helpers/global-sandbox';
import { JSDOM } from 'jsdom';
import locales from '@/entrypoints/content/i18n/locales';

/**
 * Overlay mount-failure contract.
 *
 * A throwing mount must NOT leave the injected full-screen shell behind:
 * the page-level lock style (body overflow:hidden) and the opaque overlay
 * together form an unrecoverable wall. On failure the shell is torn down
 * (overlay element + page style + theme-sync listener) and a small
 * dismissible, retryable error widget is left in the LIGHT DOM.
 *
 * Vue captures `document` at module init → globals must exist before the
 * dynamic imports (repo precedent: douban-mark-dialog-a11y.spec).
 */

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://movie.douban.com/',
  pretendToBeVisual: true,
});

type StorageHandler = (changes: Record<string, unknown>, area: string) => void;
const themeListeners = new Set<StorageHandler>();

defineGlobal('window', dom.window);
// jsdom ships no matchMedia; theme-sync needs the OS-scheme probe.
Object.defineProperty(dom.window, 'matchMedia', {
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
  configurable: true,
});
defineGlobal('document', dom.window.document);
defineGlobal('navigator', dom.window.navigator);
defineGlobal('location', dom.window.location);
defineGlobal('localStorage', dom.window.localStorage);
defineGlobal('Node', dom.window.Node);
defineGlobal('Element', dom.window.Element);
defineGlobal('HTMLElement', dom.window.HTMLElement);
defineGlobal('SVGElement', dom.window.SVGElement);
defineGlobal('chrome', {
  storage: {
    local: {
      get: (_keys: string[], cb: (result: Record<string, unknown>) => void) => cb({}),
    },
    onChanged: {
      addListener: (fn: StorageHandler) => themeListeners.add(fn),
      removeListener: (fn: StorageHandler) => themeListeners.delete(fn),
    },
  },
  runtime: { lastError: undefined, id: 'umm-test' },
});

type OverlayMod = typeof import('@/scenario/douban/overlay/create-overlay');
type MountMod = typeof import('@/scenario/douban/overlay/mount-app');
type VueMod = typeof import('vue');

let overlayMod: OverlayMod | undefined;
let mountMod: MountMod | undefined;
let vue: VueMod | undefined;

async function loadModules(): Promise<{ overlayMod: OverlayMod; mountMod: MountMod; vue: VueMod }> {
  if (!overlayMod || !mountMod || !vue) {
    overlayMod = await import('@/scenario/douban/overlay/create-overlay');
    mountMod = await import('@/scenario/douban/overlay/mount-app');
    vue = await import('vue');
  }
  return { overlayMod, mountMod, vue };
}

/** Let finalize() promise chains (including .catch) drain. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 10));
}

const OVERLAY_ID = 'umm-failure-test-overlay';
const WIDGET_ID = 'umm-mount-failure';

function cleanupDom(): void {
  dom.window.document.body.innerHTML = '';
  dom.window.document.head.innerHTML = '';
  dom.window.localStorage.clear();
  themeListeners.clear();
}

function failingCreateApp(): () => never {
  return () => {
    throw new Error('synthetic mount failure');
  };
}

test.describe('overlay mount failure teardown', () => {
  test.afterEach(cleanupDom);

  test('failure removes the full-screen shell and its page-level lock style', async () => {
    const { createOverlay } = await loadModulesOverlay();
    const baseline = themeListeners.size;
    createOverlay({ overlayId: OVERLAY_ID, subtitle: 'test' });
    expect(themeListeners.size).toBe(baseline + 1);

    const { mountUmmOverlay } = await loadModulesMount();
    mountUmmOverlay({
      overlayId: OVERLAY_ID,
      css: '',
      createApp: failingCreateApp() as never,
    });
    await flush();

    // Shell gone: no opaque wall, no injected body-lock style.
    expect(dom.window.document.getElementById(OVERLAY_ID)).toBeNull();
    expect(dom.window.document.getElementById(`${OVERLAY_ID}-page-style`)).toBeNull();
    // Theme-sync disposer wired into teardown: no orphaned storage listener.
    expect(themeListeners.size).toBe(baseline);
    // Non-blocking error affordance lives in the light DOM, never inside the
    // (now removed) shadow overlay.
    const widget = dom.window.document.getElementById(WIDGET_ID);
    expect(widget).not.toBeNull();
    expect(widget!.querySelector('[data-umm-act="retry"]')).not.toBeNull();
    expect(widget!.querySelector('[data-umm-act="dismiss"]')).not.toBeNull();
  });

  test('retry recreates the shell and a recovered mount completes', async () => {
    const mods = await loadModulesOverlay();
    mods.createOverlay({ overlayId: OVERLAY_ID, subtitle: 'test' });
    const { mountMod, vue: v } = await loadAll();
    const { mountUmmOverlay } = mountMod;

    let attempt = 0;
    mountUmmOverlay({
      overlayId: OVERLAY_ID,
      css: '',
      createApp: (() => {
        attempt += 1;
        if (attempt === 1) throw new Error('first mount fails');
        return v.createApp({ render: () => v.h('div', { class: 'probe-recovered' }, 'ok') });
      }) as never,
    });
    await flush();
    expect(dom.window.document.getElementById(OVERLAY_ID)).toBeNull();

    const widget = dom.window.document.getElementById(WIDGET_ID);
    expect(widget).not.toBeNull();
    (widget!.querySelector('[data-umm-act="retry"]') as HTMLElement).click();
    await flush();

    // Shell rebuilt, mount succeeded, widget dismissed itself.
    const shell = dom.window.document.getElementById(OVERLAY_ID);
    expect(shell).not.toBeNull();
    expect(shell!.shadowRoot!.querySelector('.probe-recovered')).not.toBeNull();
    expect(dom.window.document.getElementById(WIDGET_ID)).toBeNull();
    // Retry rebuilt the shell → exactly one fresh theme-sync listener (no leak).
    expect(themeListeners.size).toBe(1);
  });

  test('dismiss removes the error widget without resurrecting the shell', async () => {
    const mods = await loadModulesOverlay();
    mods.createOverlay({ overlayId: OVERLAY_ID, subtitle: 'test' });
    const { mountUmmOverlay } = await loadModulesMount();
    mountUmmOverlay({ overlayId: OVERLAY_ID, css: '', createApp: failingCreateApp() as never });
    await flush();

    const widget = dom.window.document.getElementById(WIDGET_ID);
    expect(widget).not.toBeNull();
    (widget!.querySelector('[data-umm-act="dismiss"]') as HTMLElement).click();
    expect(dom.window.document.getElementById(WIDGET_ID)).toBeNull();
    expect(dom.window.document.getElementById(OVERLAY_ID)).toBeNull();
  });

  test('success path: spinner swaps to mounted app, shell stays intact', async () => {
    const mods = await loadModulesOverlay();
    const created = mods.createOverlay({ overlayId: OVERLAY_ID, subtitle: 'test' });
    const { mountMod, vue: v } = await loadAll();
    const { mountUmmOverlay } = mountMod;

    mountUmmOverlay({
      overlayId: OVERLAY_ID,
      css: '.probe-css{color:red}',
      createApp: () => v.createApp({ render: () => v.h('div', { class: 'probe-app' }, 'mounted') }),
    });
    await flush();

    expect(dom.window.document.getElementById(OVERLAY_ID)).not.toBeNull();
    expect(dom.window.document.getElementById(`${OVERLAY_ID}-page-style`)).not.toBeNull();
    expect(created.shadowRoot!.querySelector('.ov-loading')).toBeNull();
    expect(created.shadowRoot!.querySelector('.umm-mount .probe-app')).not.toBeNull();
    expect(dom.window.document.getElementById(WIDGET_ID)).toBeNull();
  });

  // The retry affordance calls `mountUmmOverlay` again, and a mount that throws
  // AFTER `app.mount()` (an afterMount hook blowing up) reaches that retry with
  // the first app still live. Two live apps in one shadow root means two effect
  // scopes and two record-cache subscriptions per page — every broadcast then
  // costs double reads.
  test('a re-mount into the same overlay releases the previously mounted app', async () => {
    const mods = await loadModulesOverlay();
    const created = mods.createOverlay({ overlayId: OVERLAY_ID, subtitle: 'test' });
    const { mountMod, vue: v } = await loadAll();
    const { mountUmmOverlay } = mountMod;

    let firstUnmounted = false;
    const probe = (cls: string, onUnmountedHook?: () => void) => (): never =>
      v.createApp({
        setup() {
          if (onUnmountedHook) v.onUnmounted(onUnmountedHook);
          return () => v.h('div', { class: cls }, 'x');
        },
      }) as never;

    mountUmmOverlay({
      overlayId: OVERLAY_ID,
      css: '',
      createApp: probe('probe-first', () => {
        firstUnmounted = true;
      }),
    });
    await flush();
    expect(created.shadowRoot!.querySelector('.probe-first')).not.toBeNull();

    mountUmmOverlay({ overlayId: OVERLAY_ID, css: '', createApp: probe('probe-second') });
    await flush();

    const mounts = created.shadowRoot!.querySelectorAll('.umm-mount');
    expect(mounts).toHaveLength(1);
    expect(created.shadowRoot!.querySelector('.probe-second')).not.toBeNull();
    expect(created.shadowRoot!.querySelector('.probe-first')).toBeNull();
    expect(firstUnmounted, 'the previous app must be unmounted, not just orphaned').toBe(true);
  });

  // A failed mount tears the shell out of the document. Whatever app that
  // overlay was showing goes with it, so it must be unmounted too — otherwise a
  // live app keeps subscribing to a tree nobody can see, and the retry stacks
  // another one on top of it.
  test('a failing re-mount releases the app the overlay was already showing', async () => {
    const mods = await loadModulesOverlay();
    mods.createOverlay({ overlayId: OVERLAY_ID, subtitle: 'test' });
    const { mountMod, vue: v } = await loadAll();
    const { mountUmmOverlay } = mountMod;

    let shownUnmounted = false;
    mountUmmOverlay({
      overlayId: OVERLAY_ID,
      css: '',
      createApp: (() => {
        const app = v.createApp({
          setup() {
            v.onUnmounted(() => {
              shownUnmounted = true;
            });
            return () => v.h('div', { class: 'probe-shown' }, 'x');
          },
        });
        return app;
      }) as never,
    });
    await flush();
    expect(shownUnmounted).toBe(false);

    // Fails before the re-entry guard runs, so only the failure path can
    // release the app that is still showing.
    mountUmmOverlay({
      overlayId: OVERLAY_ID,
      css: '',
      beforeMount: () => {
        throw new Error('beforeMount blows up on the re-mount');
      },
      createApp: (() => v.createApp({ render: () => v.h('div', null, 'never') })) as never,
    });
    await flush();

    expect(dom.window.document.getElementById(OVERLAY_ID)).toBeNull();
    expect(shownUnmounted).toBe(true);
  });

  // X107：失败面板的三处文案是 chrome，改由内容侧 i18n 在渲染时解析。
  // 语言经与早期壳同一条同步路径钉住（localStorage 镜像 → initI18nSync），
  // 每个节点与词典值配对——zh-CN 与 en-US 各挂一次：只钉一种语言的话，
  // 「退回硬编码中文」这种最现实的回退形态在 zh-CN 侧照样全绿。
  test('failure widget copy comes from the content i18n dictionary (both locales)', async () => {
    try {
      for (const lang of ['zh-CN', 'en-US'] as const) {
        dom.window.localStorage.setItem('umm:locale', lang);
        const { initI18nSync } = await import('@/entrypoints/content/i18n');
        initI18nSync();

        const mods = await loadModulesOverlay();
        mods.createOverlay({ overlayId: OVERLAY_ID, subtitle: 'test' });
        const { mountUmmOverlay } = await loadModulesMount();
        mountUmmOverlay({ overlayId: OVERLAY_ID, css: '', createApp: failingCreateApp() as never });
        await flush();

        const widget = dom.window.document.getElementById(WIDGET_ID);
        expect(widget, `${lang} 下未生成失败面板`).not.toBeNull();
        expect(widget!.querySelector('span')!.textContent).toBe(
          locales[lang]['douban.mount.failed'],
        );
        expect(widget!.querySelector('[data-umm-act="retry"]')!.textContent).toBe(
          locales[lang]['douban.mount.retry'],
        );
        expect(widget!.querySelector('[data-umm-act="dismiss"]')!.getAttribute('aria-label')).toBe(
          locales[lang]['douban.mount.close'],
        );
        dom.window.document.getElementById(WIDGET_ID)?.remove();
      }
    } finally {
      // 模块级 locale 是全文件共享的：用完复位到模块默认 zh-CN，避免污染同
      // worker 的后续 spec（第五类通道的既有教训）。
      dom.window.localStorage.setItem('umm:locale', 'zh-CN');
      const { initI18nSync } = await import('@/entrypoints/content/i18n');
      initI18nSync();
    }
  });

  test('beforeMount-registered rollback runs when a later step throws', async () => {
    const { document: doc } = dom.window;
    const victim = doc.createElement('div');
    victim.id = 'umm-rollback-victim';
    doc.body.appendChild(victim);

    const mods = await loadModulesOverlay();
    mods.createOverlay({ overlayId: OVERLAY_ID, subtitle: 'test' });
    const { mountUmmOverlay } = await loadModulesMount();

    mountUmmOverlay({
      overlayId: OVERLAY_ID,
      css: '',
      beforeMount: (_shadow: ShadowRoot, registerRollback?: unknown) => {
        victim.remove();
        if (typeof registerRollback === 'function') {
          (registerRollback as (fn: () => void) => void)(() => doc.body.appendChild(victim));
        }
      },
      createApp: failingCreateApp() as never,
    });
    await flush();

    expect(doc.body.contains(victim)).toBe(true);
  });
});

async function loadModulesOverlay(): Promise<OverlayMod> {
  const m = await loadAll();
  return m.overlayMod;
}

async function loadModulesMount(): Promise<MountMod> {
  const m = await loadAll();
  return m.mountMod;
}

async function loadAll(): Promise<{
  overlayMod: OverlayMod;
  mountMod: MountMod;
  vue: VueMod;
}> {
  return loadModules();
}
