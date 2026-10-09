import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';

initFileSandbox();
import { JSDOM } from 'jsdom';
import biliListingEntry from '@/entrypoints/bilibili-homepage.content/index';
import { LISTING_BADGE_CLASS, LISTING_STYLE_ID } from '@/entrypoints/content/ui/bilibili-listing';

/**
 * Bilibili listing shell lifecycle. The shell arms two kinds of watcher — one
 * waiting for the grid to mount, one scanning it once it exists — and a route
 * transition owns the document only until the next one, so every transition has
 * to release both before re-arming for the route it moved to. Otherwise a
 * body-level watcher keeps dimging a grid the user already left, and stacked
 * watchers each run their own bulk read.
 */

const EMPTY_SHELL_HTML = '<div id="bili-app-header"></div>';
const GRID_HTML =
  '<div id="app">' +
  '<div class="bili-video-card"><a href="https://www.bilibili.com/video/BV1xx411c7mu/"></a></div>' +
  '<div class="bili-video-card"><a href="https://www.bilibili.com/video/BV1yy411c7rd/"></a></div>' +
  '</div>';

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

function run(): void {
  // The entry's `main` is parameterless; WXT's union type declares a context param.
  const entry = biliListingEntry as unknown as { main: () => void };
  entry.main();
}

async function mount(url: string, bodyHtml: string) {
  const dom = new JSDOM(`<!doctype html><html><body>${bodyHtml}</body></html>`, {
    url,
    pretendToBeVisual: true,
  });
  const doc = dom.window.document;
  const records: Array<{ targets: string[]; connected: boolean }> = [];
  const sent: Array<{ type: string }> = [];

  // jsdom ships no matchMedia; shared UI code probes the theme on load.
  Object.defineProperty(dom.window, 'matchMedia', {
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
    configurable: true,
  });

  function targetName(node: Node): string {
    if (node === doc.body) return 'body';
    if (node === doc.documentElement) return 'html';
    const el = node as Element;
    return el.id ? `#${el.id}` : String(node.nodeName).toLowerCase();
  }

  const native = dom.window.MutationObserver;
  class SpyMutationObserver extends native {
    private readonly rec: { targets: string[]; connected: boolean } = {
      targets: [],
      connected: false,
    };

    constructor(cb: MutationCallback) {
      super(cb);
      records.push(this.rec);
    }

    override observe(target: Node, options?: MutationObserverInit): void {
      this.rec.targets.push(targetName(target));
      this.rec.connected = true;
      super.observe(target, options);
    }

    override disconnect(): void {
      this.rec.connected = false;
      super.disconnect();
    }
  }

  defineGlobal('window', dom.window);
  defineGlobal('document', doc);
  defineGlobal('location', dom.window.location);
  defineGlobal('history', dom.window.history);
  defineGlobal('navigator', dom.window.navigator);
  defineGlobal('Element', dom.window.Element);
  defineGlobal('HTMLElement', dom.window.HTMLElement);
  defineGlobal('Node', dom.window.Node);
  defineGlobal('MutationObserver', SpyMutationObserver);
  defineGlobal('requestAnimationFrame', dom.window.requestAnimationFrame.bind(dom.window));
  defineGlobal('cancelAnimationFrame', dom.window.cancelAnimationFrame.bind(dom.window));
  defineGlobal('chrome', {
    runtime: {
      id: 'test-extension',
      lastError: undefined,
      sendMessage: (msg: { type: string }, cb?: (r: unknown) => void) => {
        sent.push({ type: msg.type });
        let response: unknown = { success: true };
        if (msg.type === 'DB_GET') response = { success: true, record: null };
        else if (msg.type === 'DB_GET_BULK' || msg.type === 'DB_GET_ALL')
          response = { success: true, entries: [] };
        cb?.(response);
      },
      onMessage: { addListener: () => {} },
    },
  });

  // The entry runs at document_idle, so the fixture must be loaded before main().
  await new Promise<void>((resolve) => setImmediate(resolve));
  if (doc.readyState !== 'complete') throw new Error(`fixture document at ${doc.readyState}`);

  function live(target: string): number {
    return records.filter((r) => r.connected && r.targets.includes(target)).length;
  }

  function created(target: string): number {
    return records.filter((r) => r.targets.includes(target)).length;
  }

  function messages(type: string): number {
    return sent.filter((m) => m.type === type).length;
  }

  /** SPA navigation the way the page does it: the URL moves, then the route wakes up. */
  async function goTo(url: string): Promise<void> {
    dom.reconfigure({ url });
    dom.window.dispatchEvent(new dom.window.Event('popstate'));
    await flush();
  }

  /** The grid arriving late is what the waiting watcher exists for. */
  async function mountGrid(): Promise<void> {
    doc.body.insertAdjacentHTML('beforeend', GRID_HTML);
    await flush();
  }

  return { doc, live, created, messages, goTo, mountGrid };
}

test.describe('bilibili listing entrypoint — route transitions', () => {
  test('an unmounted grid arms exactly one body watcher', async () => {
    const { doc, live, created } = await mount('https://www.bilibili.com/', EMPTY_SHELL_HTML);
    run();
    expect(created('body')).toBe(1);
    expect(live('body')).toBe(1);
    expect(doc.getElementById(LISTING_STYLE_ID)).not.toBeNull();
  });

  test('listing to listing replaces the watcher instead of stacking a second one', async () => {
    const { live, created, goTo } = await mount('https://www.bilibili.com/', EMPTY_SHELL_HTML);
    run();

    await goTo('https://www.bilibili.com/?tab=video');
    expect(created('body')).toBe(2);
    // One released, one live: a second body-level watcher would dim every card
    // twice over and pay for its own bulk read.
    expect(live('body')).toBe(1);
    expect(created('#app')).toBe(0);
  });

  test('leaving the listing route releases every watcher; a late grid dims nothing', async () => {
    const { live, created, messages, goTo, mountGrid } = await mount(
      'https://www.bilibili.com/',
      EMPTY_SHELL_HTML,
    );
    run();
    expect(live('body')).toBe(1);

    await goTo('https://example.com/nowhere');
    expect(live('body')).toBe(0);
    expect(created('body')).toBe(1);

    await mountGrid();
    expect(created('#app')).toBe(0);
    expect(live('body')).toBe(0);
    expect(messages('DB_GET_BULK')).toBe(0);
  });

  test('a grid that mounts later hands over to the listing watcher', async () => {
    const { doc, live, created, messages, mountGrid } = await mount(
      'https://www.bilibili.com/',
      EMPTY_SHELL_HTML,
    );
    run();

    await mountGrid();
    expect(live('body')).toBe(0);
    expect(live('#app')).toBe(1);
    expect(created('body')).toBe(1);
    expect(messages('DB_GET_BULK')).toBe(1);
    expect(doc.querySelectorAll(`.${LISTING_BADGE_CLASS}`)).toHaveLength(2);
  });

  test('re-entering a route that already has a live grid re-observes it once', async () => {
    const { live, created, goTo } = await mount(
      'https://www.bilibili.com/',
      '<div id="outer">' + GRID_HTML + '</div>',
    );
    run();
    expect(live('#app')).toBe(1);

    await goTo('https://space.bilibili.com/42');
    expect(created('#app')).toBe(2);
    expect(live('#app')).toBe(1);
  });
});
