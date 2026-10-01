import { test, expect } from '@playwright/test';
import { JSDOM } from 'jsdom';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';

/**
 * store/theme.ts — pinia theme store (dual-key persistence per its doc-comment).
 * Contracts pinned:
 * 1. init: useStorage default {theme:'auto'} → theme 'auto', applyTheme runs
 *    immediately (auto + system-light → .light only), theme-ready after TWO
 *    rAF frames, and the STORAGE_KEYS.THEME ('theme') mirror write happens via
 *    the typed settings item — while 'null' in storage takes the falsy branch
 *    (no mirror write at init);
 * 2. applyTheme class EXCLUSIVITY: exactly one of .dark/.light;
 * 3. theme change persists BOTH physical keys: 'umm:appearance' (own store,
 *    chrome.storage.local.set + vueuse localStorage) and 'theme' (settings
 *    mirror); DOM re-applied on every change;
 * 4. chrome.storage.onChanged: only area 'local' + key 'umm:appearance' with a
 *    truthy newValue mutates theme; other areas/keys/deletions are ignored;
 * 5. system-preference edges: NO matchMedia support → auto behaves light
 *    without crashing; a live system flip re-applies the DOM while mode is
 *    'auto' (watch on isDark) but never clobbers an explicit light/dark
 *    choice (locked corrected contract, umreview wave 2);
 * 6. rejecting settings area is swallowed everywhere a mirror write fires — init (settings item .catch)
 *    AND the theme-change watch, where an uncaught chrome.storage.local.set
 *    rejection would escape as an UNHANDLED rejection (both mirrors are
 *    best-effort).
 * Vue binds `document` at module-init → jsdom globals first, lazy imports
 * (debounced-query precedent). chrome + rAF + matchMedia all faked per test.
 */

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://example.com/' });
initFileSandbox();
defineGlobal('window', dom.window);
defineGlobal('document', dom.window.document);
defineGlobal('navigator', dom.window.navigator);
defineGlobal('Node', dom.window.Node);
defineGlobal('Element', dom.window.Element);
defineGlobal('HTMLElement', dom.window.HTMLElement);
defineGlobal('SVGElement', dom.window.SVGElement);
// @vueuse useStorage type-checks `storage instanceof Storage` against the GLOBAL class.
defineGlobal('Storage', dom.window.Storage);
// useStorage dispatches a cross-tab StorageEvent on every write (global lookup).
defineGlobal('StorageEvent', dom.window.StorageEvent);

// ── fakes ────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'umm:appearance'; // mirrors the store's own literal

interface MqlStub {
  matches: boolean;
  media: string;
  addEventListener: (type: string, fn: (e: { matches: boolean }) => void) => void;
  removeEventListener: (type: string, fn: unknown) => void;
  emitChange: (matches: boolean) => void;
}

interface Env {
  chromeSet: Array<Record<string, unknown>>;
  onChangedHandlers: Array<
    (changes: Record<string, chrome.storage.StorageChange>, area: string) => void
  >;
  mql: MqlStub;
  rafQueue: Array<() => void>;
}

let env: Env;
const originalMatchMedia = dom.window.matchMedia;

function installEnv(
  opts: { matchMediaMissing?: boolean; setRejects?: boolean; seedAppearance?: string } = {},
): Env {
  const chromeSet: Env['chromeSet'] = [];
  const onChangedHandlers: Env['onChangedHandlers'] = [];
  const listeners: Array<(e: { matches: boolean }) => void> = [];
  const mql: MqlStub = {
    matches: false,
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_t, fn) => void listeners.push(fn),
    removeEventListener: (_t, fn) => {
      const i = listeners.indexOf(fn as (e: { matches: boolean }) => void);
      if (i >= 0) listeners.splice(i, 1);
    },
    emitChange: (matches) => {
      mql.matches = matches;
      for (const fn of [...listeners]) fn({ matches });
    },
  };
  if (opts.matchMediaMissing) {
    // useSupported() checks `'matchMedia' in window && typeof === 'function'`.
    Object.defineProperty(dom.window, 'matchMedia', {
      value: undefined,
      configurable: true,
      writable: true,
    });
  } else {
    Object.defineProperty(dom.window, 'matchMedia', {
      value: (query: string) => ({ ...mql, media: query }),
      configurable: true,
      writable: true,
    });
  }
  const rafQueue: Env['rafQueue'] = [];
  defineGlobal('requestAnimationFrame', (cb: () => void) => {
    rafQueue.push(cb);
    return rafQueue.length;
  });
  defineGlobal('chrome', {
    storage: {
      local: {
        get: () => Promise.resolve({}),
        set: (items: Record<string, unknown>) => {
          chromeSet.push(items);
          return opts.setRejects ? Promise.reject(new Error('quota')) : Promise.resolve();
        },
      },
      onChanged: {
        addListener: (fn: Env['onChangedHandlers'][number]) => void onChangedHandlers.push(fn),
      },
    },
  });
  dom.window.localStorage.clear();
  if (opts.seedAppearance !== undefined) {
    dom.window.localStorage.setItem(STORAGE_KEY, opts.seedAppearance);
  }
  dom.window.document.documentElement.className = '';
  return { chromeSet, onChangedHandlers, mql, rafQueue };
}

function flushRaf(times = 2): void {
  for (let i = 0; i < times; i++) {
    const pending = env.rafQueue.splice(0, env.rafQueue.length);
    for (const cb of pending) cb();
  }
}

type ThemeMod = typeof import('@/store/theme');
type PiniaMod = typeof import('pinia');
let themeMod: ThemeMod | undefined;
let pinia: PiniaMod | undefined;

async function freshThemeStore(opts: Parameters<typeof installEnv>[0] = {}): Promise<{
  store: ReturnType<ThemeMod['useThemeStore']>;
  vue: typeof import('vue');
}> {
  env = installEnv(opts);
  if (!themeMod) {
    themeMod = await import('@/store/theme');
    pinia = await import('pinia');
  }
  pinia!.setActivePinia(pinia!.createPinia());
  const vue = await import('vue');
  return { store: themeMod!.useThemeStore(), vue };
}

test.afterEach(() => {
  Object.defineProperty(dom.window, 'matchMedia', {
    value: originalMatchMedia,
    configurable: true,
    writable: true,
  });
});

test.describe('useThemeStore', () => {
  test('init: auto default, .light applied immediately, theme-ready after 2 frames, settings mirror written', async () => {
    const { store } = await freshThemeStore();
    const root = dom.window.document.documentElement;
    expect(store.theme).toBe('auto');
    expect(root.classList.contains('light')).toBe(true);
    expect(root.classList.contains('dark')).toBe(false);
    expect(root.classList.contains('theme-ready')).toBe(false);
    flushRaf(2);
    expect(root.classList.contains('theme-ready')).toBe(true);
    // init mirrors through the typed THEME item (physical key 'theme')…
    expect(env.chromeSet).toEqual([{ theme: 'auto' }]);
    // …and registers exactly one cross-context listener.
    expect(env.onChangedHandlers).toHaveLength(1);
  });

  test("storage holding literal 'null' takes the falsy init branch (no mirror write)", async () => {
    const { store } = await freshThemeStore({ seedAppearance: 'null' });
    expect(store.theme).toBe('auto');
    expect(env.chromeSet).toEqual([]);
  });

  test('applyTheme keeps .dark/.light mutually exclusive; auto follows isDark', async () => {
    const { store } = await freshThemeStore();
    const root = dom.window.document.documentElement;
    store.applyTheme('dark');
    expect(root.classList.contains('dark')).toBe(true);
    expect(root.classList.contains('light')).toBe(false);
    store.applyTheme('light');
    expect(root.classList.contains('light')).toBe(true);
    expect(root.classList.contains('dark')).toBe(false);
    // system flip updates isDark → applyTheme('auto') now resolves dark.
    env.mql.emitChange(true);
    store.applyTheme('auto');
    expect(root.classList.contains('dark')).toBe(true);
  });

  test('live system-preference change re-applies the DOM while mode is auto', async () => {
    // Previously pinned as "stale by design"; corrected contract (umreview wave 2):
    // choosing auto must track the OS until reload, so isDark drives a re-apply.
    const { store, vue } = await freshThemeStore();
    const root = dom.window.document.documentElement;
    flushRaf();
    env.mql.emitChange(true); // OS goes dark while mode stays 'auto'
    await vue.nextTick();
    expect(store.theme).toBe('auto');
    expect(root.classList.contains('dark')).toBe(true);
    expect(root.classList.contains('light')).toBe(false);

    env.mql.emitChange(false); // and back to light
    await vue.nextTick();
    expect(root.classList.contains('light')).toBe(true);
    expect(root.classList.contains('dark')).toBe(false);
  });

  test('live system-preference change never clobbers an explicit light/dark choice', async () => {
    const { store, vue } = await freshThemeStore();
    flushRaf();
    store.theme = 'light';
    await vue.nextTick();
    env.mql.emitChange(true); // OS goes dark; explicit light stays put
    await vue.nextTick();
    const root = dom.window.document.documentElement;
    expect(root.classList.contains('light')).toBe(true);
    expect(root.classList.contains('dark')).toBe(false);
  });

  test('theme change persists both physical keys and re-applies classes', async () => {
    const { store, vue } = await freshThemeStore();
    flushRaf();
    store.theme = 'dark';
    await vue.nextTick();
    const root = dom.window.document.documentElement;
    expect(root.classList.contains('dark')).toBe(true);
    expect(dom.window.localStorage.getItem(STORAGE_KEY)).toBe('{"theme":"dark"}');
    expect(env.chromeSet).toContainEqual({ [STORAGE_KEY]: { theme: 'dark' } });
    expect(env.chromeSet).toContainEqual({ theme: 'dark' }); // THEME item mirror
  });

  test('onChanged: local-area umm:appearance writes sync in; noise is ignored', async () => {
    const { store, vue } = await freshThemeStore();
    const [listener] = env.onChangedHandlers;
    expect(listener).toBeDefined();

    listener!({ 'umm:appearance': { newValue: { theme: 'dark' } } }, 'local');
    await vue.nextTick();
    expect(store.theme).toBe('dark');

    listener!({ 'umm:appearance': { newValue: { theme: 'light' } } }, 'sync'); // wrong area
    await vue.nextTick();
    expect(store.theme).toBe('dark');

    listener!({ somethingElse: { newValue: { theme: 'auto' } } }, 'local'); // wrong key
    await vue.nextTick();
    expect(store.theme).toBe('dark');

    listener!({ 'umm:appearance': { oldValue: { theme: 'dark' } } }, 'local'); // deletion
    await vue.nextTick();
    expect(store.theme).toBe('dark');
  });

  test('no matchMedia support: store still boots, auto behaves light, nothing throws', async () => {
    const { store } = await freshThemeStore({ matchMediaMissing: true });
    const root = dom.window.document.documentElement;
    expect(store.theme).toBe('auto');
    expect(root.classList.contains('light')).toBe(true);
    expect(root.classList.contains('dark')).toBe(false);
  });

  test('rejecting storage area is swallowed at init (.catch on settings mirror)', async () => {
    const { store } = await freshThemeStore({ setRejects: true });
    flushRaf();
    expect(store.theme).toBe('auto');
    expect(dom.window.document.documentElement.classList.contains('theme-ready')).toBe(true);
    expect(env.chromeSet).toEqual([{ theme: 'auto' }]); // attempt made, rejection eaten
  });

  test('theme-change mirrors with rejecting chrome.storage leak NO unhandled rejection', async () => {
    // The watch fired a bare chrome.storage.local.set(...) (no await/.catch), so a
    // rejecting mirror write escaped the store as a process-level unhandled rejection.
    const rejections: unknown[] = [];
    const onUnhandled = (reason: unknown): void => void rejections.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
      const { store, vue } = await freshThemeStore({ setRejects: true });
      flushRaf();
      store.theme = 'dark';
      await vue.nextTick();
      // unhandledRejection is emitted at the macrotask boundary, after microtasks drain.
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(rejections).toEqual([]);
      // the write was still attempted on both keys (best-effort semantics unchanged)
      expect(env.chromeSet).toContainEqual({ [STORAGE_KEY]: { theme: 'dark' } });
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });
});
