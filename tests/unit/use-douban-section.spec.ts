import { test, expect } from '@playwright/test';
import { defineGlobal } from './helpers/global-sandbox';
import { JSDOM } from 'jsdom';
import type { Ref } from 'vue';
import type { StoreRecord } from '@/types';

/**
 * useDoubanSection behavior lock (X11-G) — the ref/parse/watch boilerplate
 * factory behind every homepage section (App.vue: screening/billboard/hot).
 *
 * Contract: parse runs immediately (watch immediate:true), re-runs whenever
 * the records ref is replaced, manual refresh() re-parses without a records
 * change, and the watcher is torn down on component unmount.
 *
 * Vue captures `document` at module-init → jsdom globals first, dynamic
 * imports inside tests (precedent: debounced-query.spec.ts).
 */

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://movie.douban.com/',
});

defineGlobal('window', dom.window);
defineGlobal('document', dom.window.document);
defineGlobal('navigator', dom.window.navigator);
defineGlobal('Node', dom.window.Node);
defineGlobal('Element', dom.window.Element);
defineGlobal('HTMLElement', dom.window.HTMLElement);
defineGlobal('SVGElement', dom.window.SVGElement);

type VueModule = typeof import('vue');
type SectionModule =
  typeof import('@/scenario/douban/pages/homepage/composables/use-douban-section');

let vue: VueModule | undefined;
let mod: SectionModule | undefined;

async function load(): Promise<{ vue: VueModule; mod: SectionModule }> {
  if (!vue || !mod) {
    vue = await import('vue');
    mod = await import('@/scenario/douban/pages/homepage/composables/use-douban-section');
  }
  return { vue, mod };
}

function mountSetup(v: VueModule, body: () => void): () => void {
  const container = dom.window.document.createElement('div');
  dom.window.document.body.appendChild(container);
  const app = v.createApp({
    setup() {
      body();
      return () => v.h('div');
    },
  });
  app.mount(container);
  return () => {
    app.unmount();
    container.remove();
  };
}

test.describe('useDoubanSection', () => {
  test('immediate parse on setup + manual refresh re-parses without a records change', async () => {
    const { vue: v, mod: m } = await load();
    let parseCalls = 0;
    const records: Ref<Map<string, StoreRecord>> = v.ref(new Map<string, StoreRecord>());
    let items!: Ref<number[]>;
    let refresh!: () => void;

    const teardown = mountSetup(v, () => {
      const section = m.useDoubanSection<number>(() => {
        parseCalls++;
        return [parseCalls];
      }, records);
      items = section.items;
      refresh = section.refresh;
    });
    try {
      // watch(..., { immediate: true }) — parsed once during setup itself
      expect(parseCalls).toBe(1);
      expect(items.value).toEqual([1]);

      refresh();
      expect(parseCalls).toBe(2);
      expect(items.value).toEqual([2]);
    } finally {
      teardown();
    }
  });

  test('replacing the records ref triggers a re-parse on the next tick', async () => {
    const { vue: v, mod: m } = await load();
    let parseCalls = 0;
    const records: Ref<Map<string, StoreRecord>> = v.ref(new Map<string, StoreRecord>());
    let items!: Ref<string[]>;

    const teardown = mountSetup(v, () => {
      const section = m.useDoubanSection<string>(() => {
        parseCalls++;
        return [`pass-${parseCalls}`];
      }, records);
      items = section.items;
    });
    try {
      expect(items.value).toEqual(['pass-1']);

      records.value = new Map<string, StoreRecord>(); // fresh identity, same emptiness
      await v.nextTick();
      expect(items.value).toEqual(['pass-2']);
      expect(parseCalls).toBe(2);
    } finally {
      teardown();
    }
  });

  test('unmount disposes the watcher — later ref updates never re-parse', async () => {
    const { vue: v, mod: m } = await load();
    let parseCalls = 0;
    const records: Ref<Map<string, StoreRecord>> = v.ref(new Map<string, StoreRecord>());

    const teardown = mountSetup(v, () => {
      m.useDoubanSection<number>(() => {
        parseCalls++;
        return [parseCalls];
      }, records);
    });
    expect(parseCalls).toBe(1);

    teardown();
    records.value = new Map<string, StoreRecord>();
    await v.nextTick();
    await v.nextTick();
    expect(parseCalls).toBe(1); // scope-stopped watch no longer fires
  });

  test('outside any component instance the composable still works eagerly (no mount required)', async () => {
    const { vue: v, mod: m } = await load();
    const records: Ref<Map<string, StoreRecord>> = v.ref(new Map<string, StoreRecord>());
    const { items } = m.useDoubanSection(() => ['x'], records);
    // immediate callback runs without a scope; onUnmounted merely warns
    expect(items.value).toEqual(['x']);
  });
});
