import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';

initFileSandbox();
import { JSDOM } from 'jsdom';
import { startThemeAttrSync, THEME_KEY } from '@/scenario/douban/overlay/theme-sync';
import { STORE_NAMES } from '@/engine/database';

/**
 * legacy 内容脚本的主题属性同步。
 *
 * `content/styles/global.ts` 的暗色表（THEME_VARS_DARK + GLOW_VARS）整片锚在
 * `html[data-umm-theme="dark"]`，而写这个属性的是 theme-sync 的 startThemeAttrSync
 * —— 此前只有 Douban 主入口调它。legacy 管线同样注入 global.ts，却没人落属性，
 * 于是暗色用户在 IMDb / NeoDB / Bangumi / TMDB / PT / JavDB / Mukaku 上拿到的
 * 徽章、按钮、辉光全是亮色调色板（global.ts 文件头那句「kept live by
 * startThemeAttrSync()」一直是空头支票）。
 *
 * 钉四件事：
 *  1. 属性真的落在**legacy 路径**上（跑真实入口 main()，不是查字符串）；
 *  2. 暗色表确实锚在该属性上（规则探针：锚点丢了这条守卫就该红）；
 *  3. subscribeTheme 的 disposer 释放**全部**监听器（storage + 媒体查询）——
 *     页面级同步一旦被路由级复用，靠它收敛，不留无主监听器；
 *  4. `background` 缺省分支（Douban 那侧的调用形态）不变，本波只加消费者。
 *
 * legacy 用 `background: false`：宿主没有 overlay 壳，强刷 `html{background}`
 * 会重画整个第三方站点，而暗色徽章只依赖属性本身。
 */

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const DARK_ANCHOR = /html\[data-umm-theme="dark"\]\s*\{/;

interface Harness {
  doc: Document;
  fireStorage: (theme: string | undefined) => void;
  setOsDark: (dark: boolean) => void;
  fireOsChange: () => void;
  storageListeners: () => number;
  mqListeners: () => number;
}

/** Full DOM + chrome fixture; timers are inert so nothing outlives the test. */
function mountHarness(url: string, opts: { theme?: string; dark?: boolean } = {}): Harness {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url,
    pretendToBeVisual: true,
  });
  const doc = dom.window.document;
  const storageListeners: Array<
    (changes: Record<string, { newValue?: unknown }>, area: string) => void
  > = [];
  const mqHandlers: Array<() => void> = [];
  const mqState = { dark: !!opts.dark };

  Object.defineProperty(dom.window, 'matchMedia', {
    value: (query: string) => ({
      get matches() {
        return mqState.dark && query.includes('dark');
      },
      media: query,
      addEventListener: (_type: string, cb: () => void) => mqHandlers.push(cb),
      removeEventListener: (_type: string, cb: () => void) => {
        const i = mqHandlers.indexOf(cb);
        if (i >= 0) mqHandlers.splice(i, 1);
      },
    }),
    configurable: true,
  });

  defineGlobal('window', dom.window);
  defineGlobal('document', doc);
  defineGlobal('location', dom.window.location);
  defineGlobal('history', dom.window.history);
  defineGlobal('navigator', dom.window.navigator);
  defineGlobal('localStorage', dom.window.localStorage);
  defineGlobal('Element', dom.window.Element);
  defineGlobal('HTMLElement', dom.window.HTMLElement);
  defineGlobal('HTMLVideoElement', dom.window.HTMLVideoElement);
  defineGlobal('Node', dom.window.Node);
  defineGlobal('MutationObserver', dom.window.MutationObserver);
  defineGlobal('requestAnimationFrame', () => 0);
  defineGlobal('cancelAnimationFrame', () => {});
  defineGlobal('setTimeout', () => 0);
  defineGlobal('clearTimeout', () => {});
  defineGlobal('setInterval', () => 0);
  defineGlobal('clearInterval', () => {});
  defineGlobal('chrome', {
    runtime: {
      id: 'test-extension',
      lastError: undefined,
      onMessage: { addListener: () => {} },
      sendMessage: (_msg: unknown, cb?: (r: unknown) => void): void => {
        cb?.({ success: true, record: null, entries: [], stores: [STORE_NAMES.IMDB] });
      },
    },
    storage: {
      local: {
        get: (
          _keys: unknown,
          cb?: (result: Record<string, unknown>) => void,
        ): Promise<Record<string, unknown>> => {
          const result: Record<string, unknown> = {};
          if (opts.theme !== undefined) result[THEME_KEY] = { theme: opts.theme };
          cb?.(result);
          return Promise.resolve(result);
        },
        set: async (): Promise<void> => {},
        remove: async (): Promise<void> => {},
      },
      onChanged: {
        addListener: (
          cb: (changes: Record<string, { newValue?: unknown }>, area: string) => void,
        ) => {
          storageListeners.push(cb);
        },
        removeListener: (
          cb: (changes: Record<string, { newValue?: unknown }>, area: string) => void,
        ) => {
          const i = storageListeners.indexOf(cb);
          if (i >= 0) storageListeners.splice(i, 1);
        },
      },
    },
  });

  return {
    doc,
    storageListeners: () => storageListeners.length,
    mqListeners: () => mqHandlers.length,
    setOsDark: (dark) => {
      mqState.dark = dark;
    },
    fireOsChange: () => {
      for (const h of [...mqHandlers]) h();
    },
    fireStorage: (theme) => {
      const changes = { [THEME_KEY]: { newValue: theme === undefined ? undefined : { theme } } };
      for (const l of [...storageListeners]) l(changes, 'local');
    },
  };
}

function themeAttr(doc: Document): string | null {
  return doc.documentElement.getAttribute('data-umm-theme');
}

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

test.afterEach(() => {
  defineGlobal('chrome', undefined);
});

test.describe('startThemeAttrSync — 页面属性同步契约', () => {
  test('存储主题落到 html[data-umm-theme]，且不动宿主背景', async () => {
    const h = mountHarness('https://www.imdb.com/title/tt26687035/', { theme: 'dark' });
    const release = startThemeAttrSync({ background: false });
    await settle();
    expect(themeAttr(h.doc)).toBe('dark');
    expect(h.doc.getElementById('umm-html-theme')).toBeNull();
    release();
  });

  test('auto 跟随系统配色，系统翻转即时生效', async () => {
    const h = mountHarness('https://pterclub.net/torrents.php', { theme: 'auto', dark: true });
    const release = startThemeAttrSync({ background: false });
    await settle();
    expect(themeAttr(h.doc)).toBe('dark');

    h.setOsDark(false);
    h.fireOsChange();
    expect(themeAttr(h.doc), 'OS 翻亮色后属性必须跟着翻').toBe('light');
    release();
  });

  test('Options 页改主题 → 已开页面跟随', async () => {
    const h = mountHarness('https://neodb.social/movie/x/', { theme: 'dark' });
    const release = startThemeAttrSync({ background: false });
    await settle();
    expect(themeAttr(h.doc)).toBe('dark');

    h.fireStorage('light');
    expect(themeAttr(h.doc)).toBe('light');
    release();
  });

  test('disposer 释放全部监听器（页面级同步被路由级复用时不留无主监听）', async () => {
    const h = mountHarness('https://bgm.tv/subject/1', { theme: 'dark' });
    const release = startThemeAttrSync({ background: false });
    await settle();
    expect(h.storageListeners()).toBe(1);
    expect(h.mqListeners()).toBeGreaterThan(0);

    release();
    expect(h.storageListeners(), 'storage 监听器未释放').toBe(0);
    expect(h.mqListeners(), 'matchMedia 监听器未释放').toBe(0);

    const before = themeAttr(h.doc);
    h.fireStorage('light');
    h.setOsDark(false);
    h.fireOsChange();
    expect(themeAttr(h.doc), '释放后不得再改写页面').toBe(before);
  });

  test('缺省参数仍是「属性 + html 背景镜像」（Douban 调用形态零改动）', async () => {
    const h = mountHarness('https://movie.douban.com/subject/1/', { theme: 'dark' });
    const release = startThemeAttrSync();
    await settle();
    expect(themeAttr(h.doc)).toBe('dark');
    const mirror = h.doc.getElementById('umm-html-theme');
    expect(mirror, 'Douban 侧的 html 背景镜像不能被本波改动').not.toBeNull();
    expect(mirror?.textContent).toContain('background');
    release();
  });
});

// ---------------------------------------------------------------------------
// legacy 路径接线：真实入口 main()
// ---------------------------------------------------------------------------

const IMDb_URL = 'https://www.imdb.com/title/tt26687035/';
const IMDb_HTML = '<h1 data-testid="hero__pageTitle">Some Title</h1>';

test.describe('legacy content.ts 的主题接线', () => {
  test('IMDb 路由：注入 global.ts 的同时必须落 html[data-umm-theme]', async () => {
    const h = mountHarness(IMDb_URL, { theme: 'dark' });
    h.doc.body.innerHTML = IMDb_HTML;
    const mod = await import('@/entrypoints/content.ts');
    const main = (mod.default as unknown as { main: () => Promise<void> }).main;
    await main();
    await settle();

    expect(
      h.doc.getElementById('umm-global-styles'),
      'legacy 样式未注入（夹具失效）',
    ).not.toBeNull();
    expect(
      themeAttr(h.doc),
      'legacy 路径没落属性：global.ts 的暗色表整片失效（本用例即该缺陷的回归锁）',
    ).toBe('dark');
    expect(h.doc.getElementById('umm-html-theme'), 'legacy 不该重画宿主背景').toBeNull();
  });

  test('规则探针：global.ts 的暗色表确实锚在该属性上（锚点丢了守卫就该红）', () => {
    const src = fs.readFileSync(
      path.join(REPO, 'src/entrypoints/content/styles/global.ts'),
      'utf8',
    );
    expect(DARK_ANCHOR.test(src), 'global.ts 里已经没有 html[data-umm-theme="dark"] 规则了').toBe(
      true,
    );
  });
});
