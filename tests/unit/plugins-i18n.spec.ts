import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';
import { JSDOM } from 'jsdom';
import type { Composer } from 'vue-i18n';

// Installs happen inside tests below; register this file's sandbox hooks at module scope.
initFileSandbox();

/**
 * plugins/i18n.ts + locales runtime resolution.
 * Contracts pinned:
 * 1. detectLocale fallback CHAIN — stored chrome.storage value (only if it is
 *    one of the three real locale ids), else navigator.language, else 'zh-CN';
 *    `zh-*` regional hints route TW/HK → zh-TW, everything else zh; a bare
 *    'en'/'en-GB' is NOT en-US and lands on the zh-CN primary default
 *    (documented quirk of the exact-match test);
 * 2. chrome.storage unavailable / rejecting → swallowed, navigator path runs;
 * 3. createAppI18n wires the real flat-dot message maps: t() resolves them,
 *    interpolates {n}/{count}, picks ICU plurals for en, returns the key for
 *    missing entries, and reacts to a mid-session locale switch;
 * 4. fallbackLocale is 'zh-CN' and legacy mode is off;
 * 5. persistLocale writes under STORAGE_KEYS.LANGUAGE and swallows a
 *    synchronous storage blow-up; LOCALE_OPTIONS lists the three locales.
 * vue-i18n pulls in Vue → jsdom globals first, lazy imports (debounced-query
 * precedent). navigator is re-faked per test at CALL time of detectLocale.
 */

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://example.com/' });
defineGlobal('window', dom.window);
defineGlobal('document', dom.window.document);
defineGlobal('Node', dom.window.Node);
defineGlobal('Element', dom.window.Element);
defineGlobal('HTMLElement', dom.window.HTMLElement);
defineGlobal('SVGElement', dom.window.SVGElement);

type Mod = typeof import('@/libraries/plugins/i18n');
type I18nInstance = Awaited<ReturnType<Mod['createAppI18n']>>;
let mod: Mod | undefined;
async function load(): Promise<Mod> {
  if (!mod) mod = await import('@/libraries/plugins/i18n');
  return mod;
}

/**
 * createAppI18n passes `legacy: false`, so the RUNTIME global is a Composer
 * (mode assertion below), while vue-i18n's overload types surface it as
 * VueI18n — one documented narrowing per access.
 */
function composer(i18n: I18nInstance): Composer {
  expect(i18n.mode).toBe('composition');
  return i18n.global as unknown as Composer;
}

interface StorageCalls {
  get: Array<unknown>;
  set: Array<Record<string, unknown>>;
}

function fakeChrome(opts: {
  stored?: Record<string, unknown>;
  getThrows?: boolean;
  setRejects?: boolean;
}): StorageCalls {
  const calls: StorageCalls = { get: [], set: [] };
  const storage = {
    local: {
      get: (keys: unknown) => {
        calls.get.push(keys);
        if (opts.getThrows) return Promise.reject(new Error('storage unavailable'));
        return Promise.resolve(opts.stored ?? {});
      },
      set: (items: Record<string, unknown>) => {
        calls.set.push(items);
        return opts.setRejects ? Promise.reject(new Error('quota exceeded')) : Promise.resolve();
      },
    },
  };
  defineGlobal('chrome', { storage });
  return calls;
}

function fakeNavigator(language: string): void {
  defineGlobal('navigator', { language });
}

let prevChrome: unknown;
let prevNavigator: unknown;

test.beforeEach(() => {
  prevChrome = (globalThis as { chrome?: unknown }).chrome;
  prevNavigator = (globalThis as { navigator?: unknown }).navigator;
});
test.afterEach(() => {
  defineGlobal('chrome', prevChrome);
  defineGlobal('navigator', prevNavigator);
});

test.describe('createAppI18n — locale detection chain', () => {
  test('a stored valid locale beats navigator', async () => {
    const m = await load();
    fakeChrome({ stored: { language: 'en-US' } });
    fakeNavigator('zh-CN');
    const i18n = await m.createAppI18n();
    const g = composer(i18n);
    expect(g.locale.value).toBe('en-US');
    expect(g.fallbackLocale.value).toBe('zh-CN');
  });

  test('a stored garbage value falls through to navigator', async () => {
    const m = await load();
    fakeChrome({ stored: { language: 'fr-FR' } });
    fakeNavigator('zh-TW');
    const i18n = await m.createAppI18n();
    expect(composer(i18n).locale.value).toBe('zh-TW');
  });

  test('a REJECTING chrome.storage.get is swallowed — navigator path still runs', async () => {
    const m = await load();
    fakeChrome({ getThrows: true });
    fakeNavigator('en-US');
    const i18n = await m.createAppI18n();
    expect(composer(i18n).locale.value).toBe('en-US');
  });

  test('no chrome at all: zh regional routing + bare-en quirk', async () => {
    const m = await load();
    defineGlobal('chrome', undefined);
    const cases: Array<[string, string]> = [
      ['en-US', 'en-US'],
      ['en-GB', 'zh-CN'], // exact-match only → primary default
      ['zh-CN', 'zh-CN'],
      ['zh-HK', 'zh-TW'],
      ['zh-Hant-TW', 'zh-TW'],
      ['zh-Hans', 'zh-CN'],
      ['ja-JP', 'zh-CN'],
    ];
    for (const [nav, want] of cases) {
      fakeNavigator(nav);
      const i18n = await m.createAppI18n();
      expect(composer(i18n).locale.value, nav).toBe(want);
    }
  });
});

test.describe('createAppI18n — runtime message resolution', () => {
  test('flat dotted keys resolve, interpolate, pluralize and switch mid-session', async () => {
    const m = await load();
    fakeChrome({ stored: { language: 'en-US' } });
    fakeNavigator('en-US');
    const i18n = await m.createAppI18n();
    const { t, locale } = composer(i18n);

    expect(t('nav.overview')).toBe('Overview');
    expect(t('common.daysCount', { n: 5 })).toBe('5d');
    expect(t('common.countActivity', { count: 1 }, 1)).toBe('1 activity');
    expect(t('common.countActivity', { count: 3 }, 3)).toBe('3 activities');

    // Mid-session switch (what persistLocale + use-locale-sync drive).
    locale.value = 'zh-CN';
    expect(t('common.save')).toBe('保存');
    expect(t('common.daysCount', { n: 5 })).toBe('5天');
    locale.value = 'zh-TW';
    expect(t('common.save')).toBe('儲存');
    locale.value = 'en-US';
    expect(t('common.save')).toBe('Save');
  });

  test('missing key renders the key itself (vue-i18n documented miss shape)', async () => {
    const m = await load();
    fakeChrome({ stored: { language: 'en-US' } });
    fakeNavigator('en-US');
    const i18n = await m.createAppI18n();
    expect(composer(i18n).t('definitely.not.a.key')).toBe('definitely.not.a.key');
  });
});

test.describe('persistLocale / LOCALE_OPTIONS', () => {
  test('persist writes the LANGUAGE physical key', async () => {
    const m = await load();
    const calls = fakeChrome({});
    m.persistLocale('en-US');
    expect(calls.set).toEqual([{ language: 'en-US' }]);
  });

  test('synchronous storage blow-up is swallowed (unconfigured chrome)', async () => {
    const m = await load();
    defineGlobal('chrome', { storage: {} }); // no local.set → TypeError inside
    expect(() => m.persistLocale('zh-TW')).not.toThrow();
  });

  test('a REJECTING set does not escape persistLocale as an unhandled rejection', async () => {
    // chrome.storage.local.set is async: the surrounding try/catch only eats
    // synchronous throws, so the rejection (quota / invalidated context) needs
    // an explicit .catch to stay inside the documented "ignore" fallback.
    const m = await load();
    const calls = fakeChrome({ setRejects: true });
    const rejections: unknown[] = [];
    const onUnhandled = (reason: unknown): void => void rejections.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
      expect(() => m.persistLocale('en-US')).not.toThrow();
      expect(calls.set).toEqual([{ language: 'en-US' }]); // write attempted
      await new Promise((resolve) => setTimeout(resolve, 0)); // rejection lands at the macrotask boundary
      expect(rejections).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  test('LOCALE_OPTIONS offers exactly the three supported locales', async () => {
    const m = await load();
    expect(m.LOCALE_OPTIONS).toEqual([
      { value: 'zh-CN', label: '简体中文' },
      { value: 'zh-TW', label: '繁體中文' },
      { value: 'en-US', label: 'English' },
    ]);
  });
});
