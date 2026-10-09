import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';

initFileSandbox();
import { JSDOM } from 'jsdom';
import ytEntry from '@/entrypoints/youtube-homepage.content/index';
import { LISTING_STYLE_ID } from '@/entrypoints/content/ui/youtube-listing';

/**
 * YouTube entrypoint lifecycle: everything the shell arms must also be able to
 * stop. Two shapes of leak matter — a mount watcher that keeps scanning the body
 * after the route moved on (or after it gave up waiting), and deferred FAB /
 * recommendation kicks that fire on a page already switched to another mode.
 */

const FEED_WAIT_TIMEOUT_MS = 20_000;
const URL_POLL_MS = 3_000;
const FAB_ATTR = '[data-umm-yt-float]';
const EMPTY_FEED_HTML = '<div id="app-content-container"></div>';
const REC_CONTAINER_HTML =
  '<div id="secondary"><ytd-compact-video-renderer>' +
  '<a href="/watch?v=AAAAAAAAAAA"></a><div id="thumbnail"></div>' +
  '</ytd-compact-video-renderer></div>';
const VIDEO_A = 'dQw4w9WgXcQ';
const VIDEO_B = 'BBBBBBBBBBB';

interface Task {
  id: number;
  fn: () => void;
  ms: number;
}

class FakeClock {
  private timeouts: Task[] = [];
  private intervals: Task[] = [];
  private seq = 1;
  readonly cleared: number[] = [];
  createdCount = 0;

  setTimeout(fn: () => void, ms = 0): number {
    const task: Task = { id: this.seq++, fn, ms };
    this.createdCount++;
    this.timeouts.push(task);
    return task.id;
  }

  clearTimeout(id?: number): void {
    if (id === undefined) return;
    this.cleared.push(id);
    this.timeouts = this.timeouts.filter((t) => t.id !== id);
  }

  setInterval(fn: () => void, ms = 0): number {
    const task: Task = { id: this.seq++, fn, ms };
    this.intervals.push(task);
    return task.id;
  }

  clearInterval(id?: number): void {
    if (id === undefined) return;
    this.intervals = this.intervals.filter((t) => t.id !== id);
  }

  /** Runs every pending timeout with this exact delay; timers they add stay pending. */
  fireWithDelay(ms: number): number {
    const due = this.timeouts.filter((t) => t.ms === ms);
    for (const task of due) {
      this.timeouts = this.timeouts.filter((t) => t.id !== task.id);
      task.fn();
    }
    return due.length;
  }

  /** Drains pending timeouts (chasing re-schedules), capped so a bug cannot hang. */
  drain(maxRuns = 25): number {
    let fired = 0;
    while (this.timeouts.length > 0 && fired < maxRuns) {
      const task = this.timeouts.shift()!;
      fired++;
      task.fn();
    }
    return fired;
  }

  /** One tick of the interval registered at `ms` (the SPA URL poll). */
  tickInterval(ms: number): void {
    for (const task of this.intervals.filter((t) => t.ms === ms)) task.fn();
  }

  idsOfDelay(ms: number): number[] {
    return this.timeouts.filter((t) => t.ms === ms).map((t) => t.id);
  }

  countOfDelay(ms: number): number {
    return this.timeouts.filter((t) => t.ms === ms).length;
  }
}

interface Observation {
  target: string;
}

interface ObserverRecord {
  observations: Observation[];
  connected: boolean;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

function run(): void {
  // The entry's `main` is parameterless; WXT's union type declares a context param.
  const entry = ytEntry as unknown as { main: () => void };
  entry.main();
}

async function mount(url: string, bodyHtml: string, deferDbGet = false) {
  const dom = new JSDOM(`<!doctype html><html><body>${bodyHtml}</body></html>`, {
    url,
    pretendToBeVisual: true,
  });
  const doc = dom.window.document;
  const clock = new FakeClock();
  const records: ObserverRecord[] = [];
  const sent: Array<{ type: string }> = [];
  const deferredResponses: Array<() => void> = [];

  // jsdom ships no matchMedia; the overlay's theme probe calls it on construction.
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
    private readonly rec: ObserverRecord = { observations: [], connected: false };

    constructor(cb: MutationCallback) {
      super(cb);
      records.push(this.rec);
    }

    override observe(target: Node, options?: MutationObserverInit): void {
      this.rec.observations.push({ target: targetName(target) });
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
  defineGlobal('HTMLVideoElement', dom.window.HTMLVideoElement);
  defineGlobal('Node', dom.window.Node);
  defineGlobal('MutationObserver', SpyMutationObserver);
  defineGlobal('requestAnimationFrame', dom.window.requestAnimationFrame.bind(dom.window));
  defineGlobal('cancelAnimationFrame', dom.window.cancelAnimationFrame.bind(dom.window));
  defineGlobal('setTimeout', clock.setTimeout.bind(clock));
  defineGlobal('clearTimeout', clock.clearTimeout.bind(clock));
  defineGlobal('setInterval', clock.setInterval.bind(clock));
  defineGlobal('clearInterval', clock.clearInterval.bind(clock));
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
        if (msg.type === 'DB_GET' && deferDbGet && cb) {
          deferredResponses.push(() => cb(response));
          return;
        }
        cb?.(response);
      },
      onMessage: { addListener: () => {} },
    },
  });

  // The entry runs at document_idle, so the fixture must be loaded before main().
  await new Promise<void>((resolve) => setImmediate(resolve));
  if (doc.readyState !== 'complete') throw new Error(`fixture document at ${doc.readyState}`);

  function respondDeferred(): void {
    for (const cb of deferredResponses.splice(0)) cb();
  }

  function live(target: string): number {
    return records.filter((r) => r.connected && r.observations.some((o) => o.target === target))
      .length;
  }

  function created(target: string): number {
    return records.filter((r) => r.observations.some((o) => o.target === target)).length;
  }

  function messages(type: string): number {
    return sent.filter((m) => m.type === type).length;
  }

  /** SPA navigation the way the page does it: the URL moves, then the route wakes up. */
  async function goTo(path: string): Promise<void> {
    dom.reconfigure({ url: `https://www.youtube.com${path}` });
    dom.window.dispatchEvent(new dom.window.Event('popstate'));
    await flush();
  }

  return { doc, clock, respondDeferred, live, created, messages, goTo };
}

test.describe('youtube entrypoint — waiting-for-feed watcher', () => {
  test('an unmounted feed arms one body watcher', async () => {
    const { live } = await mount('https://www.youtube.com/', EMPTY_FEED_HTML);
    run();
    expect(live('body')).toBe(1);
  });

  test('leaving the listing route releases the watcher; a late feed mounts nothing', async () => {
    const { doc, clock, live, created, messages, goTo } = await mount(
      'https://www.youtube.com/',
      EMPTY_FEED_HTML,
    );
    run();
    expect(live('body')).toBe(1);

    await goTo(`/watch?v=${VIDEO_A}`);
    expect(live('body')).toBe(0);
    expect(created('body')).toBe(1);

    const feed = doc.createElement('ytd-rich-grid-renderer');
    doc.body.append(feed);
    clock.tickInterval(URL_POLL_MS);
    await flush();
    expect(created('ytd-rich-grid-renderer')).toBe(0);
    expect(live('body')).toBe(0);
    expect(messages('DB_GET_BULK')).toBe(0);
  });

  test('the wait is bounded, and the poll re-arms it while the route holds', async () => {
    const { clock, live, created } = await mount('https://www.youtube.com/', EMPTY_FEED_HTML);
    run();
    expect(clock.countOfDelay(FEED_WAIT_TIMEOUT_MS)).toBe(1);

    clock.fireWithDelay(FEED_WAIT_TIMEOUT_MS);
    expect(live('body')).toBe(0);

    clock.tickInterval(URL_POLL_MS);
    await flush();
    expect(created('body')).toBe(2);
    expect(live('body')).toBe(1);
    expect(clock.countOfDelay(FEED_WAIT_TIMEOUT_MS)).toBe(1);

    // A live attempt must not be re-armed underneath itself.
    clock.tickInterval(URL_POLL_MS);
    await flush();
    expect(created('body')).toBe(2);
  });

  test('a feed that mounts later hands over to the listing watcher', async () => {
    const { doc, live, created, messages } = await mount(
      'https://www.youtube.com/',
      EMPTY_FEED_HTML,
    );
    run();
    const feed = doc.createElement('ytd-rich-grid-renderer');
    const contents = doc.createElement('div');
    contents.id = 'contents';
    contents.innerHTML =
      '<ytd-rich-item-renderer><a href="/watch?v=CCCCCCCCCCC"></a></ytd-rich-item-renderer>';
    feed.append(contents);
    doc.body.append(feed);
    await flush();

    expect(live('body')).toBe(0);
    // querySelector takes the first match in document order: the renderer, not #contents.
    expect(live('ytd-rich-grid-renderer')).toBe(1);
    expect(created('body')).toBe(1);
    expect(messages('DB_GET_BULK')).toBe(1);
  });

  test('re-entering the listing route replaces the watcher instead of stacking it', async () => {
    const { clock, live, created, goTo } = await mount('https://www.youtube.com/', EMPTY_FEED_HTML);
    run();
    await goTo(`/watch?v=${VIDEO_A}`);
    await goTo('/');
    expect(created('body')).toBe(2);
    expect(live('body')).toBe(1);
    expect(clock.countOfDelay(FEED_WAIT_TIMEOUT_MS)).toBe(1);
  });
});

test.describe('youtube entrypoint — deferred detail work', () => {
  test('a mode switch cancels every deferred FAB / recommendation kick', async () => {
    const { doc, clock, created, goTo } = await mount(
      `https://www.youtube.com/watch?v=${VIDEO_A}`,
      REC_CONTAINER_HTML,
    );
    run();
    await flush();
    expect(doc.querySelectorAll(FAB_ATTR)).toHaveLength(1);

    const armed = [...clock.idsOfDelay(1000), ...clock.idsOfDelay(3000)];
    expect(armed).toHaveLength(3);

    await goTo('/');
    expect(clock.idsOfDelay(1000)).toEqual([]);
    expect(clock.idsOfDelay(3000)).toEqual([]);
    for (const id of armed) expect(clock.cleared).toContain(id);
    expect(doc.querySelectorAll(FAB_ATTR)).toHaveLength(0);

    // Whatever still wants to run must not bring the detail UI back.
    clock.drain();
    await flush();
    expect(doc.querySelectorAll(FAB_ATTR)).toHaveLength(0);
    expect(created('#secondary')).toBe(0);
  });

  test('a DB answer that lands after the switch arms nothing', async () => {
    const { clock, created, goTo, respondDeferred } = await mount(
      `https://www.youtube.com/watch?v=${VIDEO_A}`,
      REC_CONTAINER_HTML,
      true,
    );
    run();
    await goTo('/');
    const createdAtSwitch = clock.createdCount;

    respondDeferred();
    await flush();
    expect(clock.createdCount).toBe(createdAtSwitch);

    clock.drain();
    await flush();
    expect(created('#secondary')).toBe(0);
  });

  test('switching videos cancels the old kicks and keeps the new video armed', async () => {
    const { doc, clock, goTo } = await mount(
      `https://www.youtube.com/watch?v=${VIDEO_A}`,
      REC_CONTAINER_HTML,
    );
    run();
    await flush();
    const firstVideoKicks = [...clock.idsOfDelay(1000), ...clock.idsOfDelay(3000)];
    expect(firstVideoKicks).toHaveLength(3);

    await goTo(`/watch?v=${VIDEO_B}`);
    for (const id of firstVideoKicks) expect(clock.cleared).toContain(id);
    expect(clock.idsOfDelay(1000)).toHaveLength(1);
    expect(clock.countOfDelay(3000)).toBe(2);
    expect(doc.querySelectorAll(FAB_ATTR)).toHaveLength(1);
  });
});

test.describe('youtube entrypoint — listing styles', () => {
  test('leaving the listing route removes the listing stylesheet', async () => {
    const { doc, goTo } = await mount('https://www.youtube.com/', EMPTY_FEED_HTML);
    run();
    expect(doc.getElementById(LISTING_STYLE_ID)).not.toBeNull();
    await goTo(`/watch?v=${VIDEO_A}`);
    expect(doc.getElementById(LISTING_STYLE_ID)).toBeNull();
  });
});
