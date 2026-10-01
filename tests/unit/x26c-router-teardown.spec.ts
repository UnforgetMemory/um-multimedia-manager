import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';

initFileSandbox();
import { JSDOM } from 'jsdom';
import { dispatchRoute } from '@/entrypoints/content/router';
import { PTDimmer } from '@/entrypoints/content/enhancers/pt';

/**
 * Router teardown contract.
 *
 * A route handler may return a disposer; the router runs it before the next
 * dispatch. Without it, observers created for one route keep scanning the page
 * after an SPA navigation moved to another route (IMDb / TMDB / JavDB all did).
 */

// One worker, declaration order: the router keeps module-level lifetime state
// across these dispatches, so a parallel split would interleave teardowns.
test.describe.configure({ mode: 'serial' });

interface Observation {
  isBody: boolean;
  options: MutationObserverInit;
}

interface ObserverRecord {
  observations: Observation[];
  connected: boolean;
}

const records: ObserverRecord[] = [];

function liveBodyObservers(): ObserverRecord[] {
  return records.filter((r) => r.connected && r.observations.some((o) => o.isBody));
}

interface SentMessage {
  type: string;
}

/** Builds a page for `url`, wires the globals the legacy handlers read, and resets the spy. */
function mountSite(url: string, bodyHtml = ''): JSDOM {
  const dom = new JSDOM(`<!DOCTYPE html><html><body>${bodyHtml}</body></html>`, {
    url,
    pretendToBeVisual: true,
  });
  records.length = 0;

  const native = dom.window.MutationObserver;
  class SpyMutationObserver extends native {
    private readonly rec: ObserverRecord = { observations: [], connected: false };

    constructor(cb: MutationCallback) {
      super(cb);
      records.push(this.rec);
    }

    override observe(target: Node, options?: MutationObserverInit): void {
      this.rec.observations.push({
        isBody: target === dom.window.document.body,
        options: options ?? {},
      });
      this.rec.connected = true;
      super.observe(target, options);
    }

    override disconnect(): void {
      this.rec.connected = false;
      super.disconnect();
    }
  }

  defineGlobal('document', dom.window.document);
  defineGlobal('window', dom.window);
  defineGlobal('location', dom.window.location);
  defineGlobal('history', dom.window.history);
  defineGlobal('navigator', dom.window.navigator);
  defineGlobal('localStorage', dom.window.localStorage);
  defineGlobal('Element', dom.window.Element);
  defineGlobal('HTMLElement', dom.window.HTMLElement);
  defineGlobal('Node', dom.window.Node);
  defineGlobal('MutationObserver', SpyMutationObserver);
  defineGlobal('requestAnimationFrame', dom.window.requestAnimationFrame.bind(dom.window));
  defineGlobal('cancelAnimationFrame', dom.window.cancelAnimationFrame.bind(dom.window));
  defineGlobal('getComputedStyle', dom.window.getComputedStyle.bind(dom.window));

  const sent: SentMessage[] = [];
  defineGlobal('chrome', {
    runtime: {
      id: 'test-extension',
      lastError: undefined,
      sendMessage: (msg: SentMessage, cb?: (res: unknown) => void) => {
        sent.push(msg);
        let response: unknown = { success: true };
        if (msg.type === 'DB_GET') response = { success: true, record: null };
        else if (msg.type === 'DB_GET_ALL') response = { success: true, entries: [] };
        else if (msg.type === 'DB_GET_BULK') response = { success: true, entries: [] };
        else if (msg.type === 'GET_SETTINGS') response = { success: true, settings: {} };
        cb?.(response);
      },
      onMessage: { addListener: () => {} },
    },
    storage: { local: { get: async () => ({}) }, onChanged: { addListener: () => {} } },
  });
  Object.defineProperty(dom.window.HTMLElement.prototype, 'innerText', {
    get() {
      return this.textContent ?? '';
    },
    configurable: true,
  });
  return dom;
}

const NEUTRAL_URL = 'https://example.com/somewhere-else';

function bodyObservationOptions(): MutationObserverInit[] {
  return records.flatMap((r) => r.observations.filter((o) => o.isBody).map((o) => o.options));
}

/** TMDB homepage grid: one `div.relative` card per poster link, plus real wrappers. */
function tmdbGridHtml(cards: number): string {
  const items = Array.from(
    { length: cards },
    (_, i) =>
      `<div class="relative"><a href="/movie/${100 + i}-title" data-media-type="movie"></a></div>`,
  ).join('');
  return `<div class="relative" id="wrapper"><div class="relative carousel">${items}</div></div>`;
}

/** Promise hops only — the badge pass awaits a DB read, never a timer. */
async function drainMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise<void>((resolve) => setImmediate(resolve));
}

const TMDB_CARDS = 60;

test.afterEach(() => {
  defineGlobal('chrome', undefined);
});

test.describe('dispatchRoute — route teardown contract', () => {
  test('IMDb: leaving the title route disconnects its state observer', async () => {
    mountSite('https://www.imdb.com/title/tt26687035/', '<h1 data-testid="hero__pageTitle">X</h1>');

    await dispatchRoute('https://www.imdb.com/title/tt26687035/');
    expect(liveBodyObservers().length).toBeGreaterThan(0);

    await dispatchRoute(NEUTRAL_URL);
    expect(liveBodyObservers()).toEqual([]);
  });

  test('IMDb: body-level observation stays structural (no attribute/characterData churn)', async () => {
    mountSite('https://www.imdb.com/title/tt26687035/', '<h1 data-testid="hero__pageTitle">X</h1>');
    await dispatchRoute('https://www.imdb.com/title/tt26687035/');

    const bodyOptions = bodyObservationOptions();
    expect(bodyOptions.length).toBeGreaterThan(0);
    // State carriers are observed narrowly on their own nodes; the body subscription
    // must not re-scan on every attribute write anywhere in the document.
    for (const options of bodyOptions) {
      expect(options.attributes ?? false).toBe(false);
      expect(options.characterData ?? false).toBe(false);
      expect(options.childList ?? false).toBe(true);
    }
    await dispatchRoute(NEUTRAL_URL);
  });

  test('TMDB: leaving the homepage route stops the grid observer and its poll', async () => {
    mountSite('https://www.themoviedb.org/');
    await dispatchRoute('https://www.themoviedb.org/');
    expect(liveBodyObservers().length).toBeGreaterThan(0);

    await dispatchRoute(NEUTRAL_URL);
    expect(liveBodyObservers()).toEqual([]);
  });

  test('TMDB: leaving the homepage route also strands the in-flight badge chunks', async () => {
    const dom = mountSite('https://www.themoviedb.org/', tmdbGridHtml(TMDB_CARDS));
    const badgeCount = () => dom.window.document.querySelectorAll('.umm-homepage-badge').length;

    await dispatchRoute('https://www.themoviedb.org/');
    await drainMicrotasks();

    const paintedSoFar = badgeCount();
    expect(
      paintedSoFar,
      `徽章写入必须已开始（${paintedSoFar}/${TMDB_CARDS}）——否则下面的断言是空的`,
    ).toBeGreaterThan(0);
    expect(
      paintedSoFar,
      `徽章写入必须仍在分帧进行中（${paintedSoFar}/${TMDB_CARDS}）`,
    ).toBeLessThan(TMDB_CARDS);

    await dispatchRoute(NEUTRAL_URL);
    // Frames keep firing after the route is gone. A chunked pass the disposer
    // did not cancel would keep painting badges into a page nobody owns.
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(badgeCount(), `disposer 未取消在途批次：${paintedSoFar} → ${badgeCount()}`).toBe(
      paintedSoFar,
    );
    expect(liveBodyObservers()).toEqual([]);
  });

  test('JavDB: re-dispatch replaces the observer instead of stacking, and unmatch disconnects it', async () => {
    mountSite('https://www.javdb.com/torrents/', '<div class="movie-list"></div>');
    await dispatchRoute('https://www.javdb.com/torrents/');
    await dispatchRoute('https://www.javdb.com/torrents/');

    expect(records.filter((r) => r.connected)).toHaveLength(1);
    await dispatchRoute(NEUTRAL_URL);
    expect(records.filter((r) => r.connected)).toHaveLength(0);
  });

  test('PT dimmer: unmatch still releases the singleton (behaviour preserved by the contract)', async () => {
    mountSite('https://m-team.cc/browse', '<table class="torrents"></table>');
    await dispatchRoute('https://m-team.cc/browse');

    await dispatchRoute(NEUTRAL_URL);
    expect(PTDimmer.currentInstance).toBeNull();
  });
});
