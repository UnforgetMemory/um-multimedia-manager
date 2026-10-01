import { test, expect } from '@playwright/test';
import { defineGlobal } from './helpers/global-sandbox';
import { JSDOM } from 'jsdom';

/**
 * use-locale-sync — cross-tab language sync for vue-i18n SPAs.
 * Contracts pinned:
 * 1. listener lifecycle: attached on mount, detached on unmount (the exact
 *    callback identity is removed — no leak across popup opens);
 * 2. only the `local` storage area is honored;
 * 3. only a LANGUAGE-key change with a truthy newValue ≠ oldValue is applied
 *    to the live i18n locale; deletions, same-value noise and other keys pass;
 * 4. the applied value reaches the GLOBAL vue-i18n locale (what t() reads).
 * Vue runtime-dom captures `document` at module-init, so all Vue-facing
 * imports are lazy (precedent: debounced-query.spec).
 */

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://example.com/' });
defineGlobal('window', dom.window);
defineGlobal('document', dom.window.document);
defineGlobal('navigator', dom.window.navigator);
defineGlobal('Node', dom.window.Node);
defineGlobal('Element', dom.window.Element);
defineGlobal('HTMLElement', dom.window.HTMLElement);
defineGlobal('SVGElement', dom.window.SVGElement);
defineGlobal('MathMLElement', dom.window.MathMLElement);

type StorageChangeHandler = (
  changes: Record<string, chrome.storage.StorageChange>,
  area: string,
) => void;

const added: StorageChangeHandler[] = [];
const removed: StorageChangeHandler[] = [];

defineGlobal('chrome', {
  storage: {
    onChanged: {
      addListener: (fn: StorageChangeHandler) => void added.push(fn),
      removeListener: (fn: StorageChangeHandler) => void removed.push(fn),
    },
  },
});

function fire(changes: Record<string, chrome.storage.StorageChange>, area: string): void {
  for (const fn of added) {
    if (!removed.includes(fn)) fn(changes, area);
  }
}

type LocaleSyncModule = typeof import('@/feature/composables/use-locale-sync');

let mod: LocaleSyncModule | undefined;

async function load(): Promise<{
  vue: typeof import('vue');
  i18n: typeof import('vue-i18n');
  mod: LocaleSyncModule;
}> {
  if (!mod) mod = await import('@/feature/composables/use-locale-sync');
  const vue = await import('vue');
  const i18n = await import('vue-i18n');
  return { vue, i18n, mod };
}

interface Harness {
  /** Live vue-i18n locale value, read through the composer the app itself uses. */
  localeValue: () => string;
  unmount: () => void;
}

async function mountLocaleSync(): Promise<Harness> {
  const { vue: v, i18n: i, mod: m } = await load();
  const instance = i.createI18n({
    legacy: false,
    locale: 'zh-CN',
    fallbackLocale: 'en',
    messages: {
      'zh-CN': { hello: '你好' },
      en: { hello: 'hello' },
    },
  });
  let seenLocale: { value: string } | undefined;
  const app = v.createApp({
    setup() {
      m.useLocaleSync();
      // Same global composer the composable mutates — capture it for assertions.
      const { locale } = i.useI18n();
      seenLocale = locale;
      return () => v.h('div');
    },
  });
  app.use(instance);
  const container = dom.window.document.createElement('div');
  dom.window.document.body.appendChild(container);
  app.mount(container);
  return {
    localeValue: () => seenLocale?.value ?? '<unbound>',
    unmount: () => {
      app.unmount();
      container.remove();
    },
  };
}

test.afterEach(() => {
  added.length = 0;
  removed.length = 0;
});

test.describe('useLocaleSync', () => {
  test('attaches exactly one listener on mount and detaches it on unmount', async () => {
    const h = await mountLocaleSync();
    try {
      expect(added).toHaveLength(1);
      expect(removed).toEqual([]);
    } finally {
      h.unmount();
    }
    expect(removed).toHaveLength(1);
    expect(removed[0]).toBe(added[0]); // exact identity — no orphaned closure
  });

  test('a local LANGUAGE change flows into the global i18n locale', async () => {
    const h = await mountLocaleSync();
    try {
      fire({ language: { oldValue: 'zh-CN', newValue: 'en' } }, 'local');
      expect(h.localeValue()).toBe('en');
      fire({ language: { oldValue: 'en', newValue: 'zh-CN' } }, 'local');
      expect(h.localeValue()).toBe('zh-CN');
    } finally {
      h.unmount();
    }
  });

  test('non-local areas are ignored', async () => {
    const h = await mountLocaleSync();
    try {
      fire({ language: { oldValue: 'zh-CN', newValue: 'en' } }, 'session');
      fire({ language: { oldValue: 'zh-CN', newValue: 'en' } }, 'sync');
      expect(h.localeValue()).toBe('zh-CN');
    } finally {
      h.unmount();
    }
  });

  test('noise never mutates the locale: other keys, deletions, same-value writes', async () => {
    const h = await mountLocaleSync();
    try {
      fire({ theme: { oldValue: 'light', newValue: 'dark' } }, 'local');
      expect(h.localeValue()).toBe('zh-CN');

      fire({ language: { oldValue: 'zh-CN' } }, 'local'); // deletion
      expect(h.localeValue()).toBe('zh-CN');

      fire({ language: { oldValue: 'zh-CN', newValue: 'zh-CN' } }, 'local'); // no-op write
      expect(h.localeValue()).toBe('zh-CN');

      fire({}, 'local');
      expect(h.localeValue()).toBe('zh-CN');
    } finally {
      h.unmount();
    }
  });

  test('every mounted component gets the broadcast; each unmount removes only its own listener', async () => {
    const a = await mountLocaleSync();
    const b = await mountLocaleSync();
    try {
      expect(added).toHaveLength(2);
      fire({ language: { oldValue: 'zh-CN', newValue: 'en' } }, 'local');
      expect(a.localeValue()).toBe('en');
      expect(b.localeValue()).toBe('en');
    } finally {
      a.unmount();
      b.unmount();
    }
    expect(removed).toHaveLength(2);
  });
});
