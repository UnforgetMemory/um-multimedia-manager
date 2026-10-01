import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';

initFileSandbox();
import { JSDOM } from 'jsdom';
import biliDetailEntry from '@/entrypoints/bilibili.content/index';

/**
 * Bilibili detail shell: SPA navigation between two videos must leave nothing of
 * the previous one behind. Half the work is deferred (the coin check, the
 * recommendation watcher), so both halves need the same two protections — every
 * `setTimeout` handle stored so a navigation can cancel it, and a generation
 * counter so a DB answer that lands after the switch cannot arm watchers for a
 * video the user already left.
 */

const COIN_CHECK_MS = 1500;
const REC_WATCH_MS = 3000;
const LOAD_RECORD_FALLBACK_MS = 2000;
const COIN_OBSERVER_TIMEOUT_MS = 5000;

const FAB_ATTR = '[data-umm-bili-float]';
const REC_CONTAINER = '.recommend-list-v1';
const COIN_TARGET = '#arc_toolbar_report';
const VIDEO_A = 'BV1xx411c7mu';
const VIDEO_B = 'BV1yy411c7rd';
const VIDEO_OFF = 'BV1aa411c7Xd';

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

  idsOfDelay(ms: number): number[] {
    return this.timeouts.filter((t) => t.ms === ms).map((t) => t.id);
  }

  countOfDelay(ms: number): number {
    return this.timeouts.filter((t) => t.ms === ms).length;
  }
}

interface ObserverRecord {
  targets: string[];
  connected: boolean;
}

interface Sent {
  type: string;
  key?: string;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

function run(): void {
  // The entry's `main` is parameterless; WXT's union type declares a context param.
  const entry = biliDetailEntry as unknown as { main: () => void };
  entry.main();
}

/** The coin button the shell measures is the second toolbar row's inner node. */
function toolbarHtml(coinTitle: string | null): string {
  const coinInner = coinTitle === null ? '<div></div>' : `<div title="${coinTitle}"></div>`;
  return (
    `<div id="${COIN_TARGET.slice(1)}"><div class="video-toolbar-left"><div>` +
    `<div></div><div class="coin">${coinInner}</div>` +
    '</div></div></div>'
  );
}

async function mount(
  bvid: string,
  options: { coinTitle?: string | null; deferDbGet?: boolean } = {},
) {
  const dom = new JSDOM(
    `<!doctype html><html><body><div id="playerWrap"></div>${toolbarHtml(options.coinTitle ?? null)}` +
      `<div class="recommend-list-v1"><div class="video-page-card-small">` +
      `<a href="/video/${VIDEO_OFF}"></a><div class="pic-box"></div>` +
      '</div></div></body></html>',
    { url: `https://www.bilibili.com/video/${bvid}/`, pretendToBeVisual: true },
  );
  const doc = dom.window.document;
  const clock = new FakeClock();
  const records: ObserverRecord[] = [];
  const sent: Sent[] = [];
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
    if (el.id) return `#${el.id}`;
    const klass = el.classList[0];
    return klass ? `.${klass}` : String(node.nodeName).toLowerCase();
  }

  const native = dom.window.MutationObserver;
  class SpyMutationObserver extends native {
    private readonly rec: ObserverRecord = { targets: [], connected: false };

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
      sendMessage: (
        msg: { type: string; payload?: { key?: string } },
        cb?: (r: unknown) => void,
      ) => {
        sent.push({ type: msg.type, key: msg.payload?.key });
        let response: unknown = { success: true };
        if (msg.type === 'DB_GET') response = { success: true, record: null };
        else if (msg.type === 'DB_GET_BULK' || msg.type === 'DB_GET_ALL')
          response = { success: true, entries: [] };
        if (msg.type === 'DB_GET' && options.deferDbGet && cb) {
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
    return records.filter((r) => r.connected && r.targets.includes(target)).length;
  }

  function created(target: string): number {
    return records.filter((r) => r.targets.includes(target)).length;
  }

  function messages(type: string): Sent[] {
    return sent.filter((m) => m.type === type);
  }

  /** SPA navigation the way bilibili does it: the URL moves, then the shell wakes up. */
  async function goTo(bvid: string): Promise<void> {
    dom.reconfigure({ url: `https://www.bilibili.com/video/${bvid}/` });
    dom.window.dispatchEvent(new dom.window.Event('popstate'));
    await flush();
  }

  async function goToOffVideo(): Promise<void> {
    dom.reconfigure({ url: 'https://www.bilibili.com/' });
    dom.window.dispatchEvent(new dom.window.Event('popstate'));
    await flush();
  }

  return {
    doc,
    clock,
    respondDeferred,
    live,
    created,
    countOfMessage: (type: string) => messages(type).length,
    keysOfMessage: (type: string) => messages(type).map((m) => m.key),
    goTo,
    goToOffVideo,
  };
}

test.describe('bilibili detail entrypoint — deferred work on SPA navigation', () => {
  test('one video arms one coin check and one recommendation watch', async () => {
    const { doc, clock, live } = await mount(VIDEO_A);
    run();
    await flush();
    expect(doc.querySelectorAll(FAB_ATTR)).toHaveLength(1);
    expect(clock.countOfDelay(COIN_CHECK_MS)).toBe(1);
    expect(clock.countOfDelay(REC_WATCH_MS)).toBe(1);
    // Deferred work has not run yet: no container watcher attached.
    expect(live(REC_CONTAINER)).toBe(0);
  });

  test('switching videos cancels the old kicks and re-arms for the new one', async () => {
    const { clock, live, created, goTo } = await mount(VIDEO_A);
    run();
    await flush();
    const firstVideoKicks = [...clock.idsOfDelay(COIN_CHECK_MS), ...clock.idsOfDelay(REC_WATCH_MS)];
    expect(firstVideoKicks).toHaveLength(2);

    await goTo(VIDEO_B);
    for (const id of firstVideoKicks) expect(clock.cleared).toContain(id);
    expect(clock.idsOfDelay(COIN_CHECK_MS)).toHaveLength(1);
    expect(clock.idsOfDelay(REC_WATCH_MS)).toHaveLength(1);

    // Cancelling must not stop the new video from wiring itself up: the shell's
    // kick and the overlay's own deferred watcher both still have to run.
    expect(live(REC_CONTAINER)).toBe(0);
    clock.drain();
    await flush();
    expect(live(REC_CONTAINER)).toBe(1);
    expect(created(REC_CONTAINER)).toBe(1);
  });

  test('a DB answer that lands after the switch arms nothing', async () => {
    const { clock, created, live, goTo, respondDeferred } = await mount(VIDEO_A, {
      deferDbGet: true,
    });
    run();
    await goTo(VIDEO_B);
    expect(clock.countOfDelay(COIN_CHECK_MS)).toBe(0);

    // Both reads settle together; the stale one belongs to a left-behind video.
    respondDeferred();
    await flush();
    expect(clock.countOfDelay(COIN_CHECK_MS)).toBe(1);
    expect(clock.countOfDelay(REC_WATCH_MS)).toBe(1);

    clock.drain();
    await flush();
    expect(created(REC_CONTAINER)).toBe(1);
    expect(created(COIN_TARGET)).toBe(1);
    expect(live(REC_CONTAINER)).toBe(1);
  });

  test('a read that settles on its own timeout after the switch arms nothing', async () => {
    const { clock, created, goTo } = await mount(VIDEO_A, { deferDbGet: true });
    run();
    await goTo(VIDEO_B);
    // Both videos are still waiting on the SW when its answer is overdue.
    expect(clock.countOfDelay(LOAD_RECORD_FALLBACK_MS)).toBe(2);

    expect(clock.fireWithDelay(LOAD_RECORD_FALLBACK_MS)).toBe(2);
    await flush();
    expect(clock.countOfDelay(COIN_CHECK_MS)).toBe(1);
    expect(clock.countOfDelay(REC_WATCH_MS)).toBe(1);

    clock.drain();
    await flush();
    expect(created(REC_CONTAINER)).toBe(1);
    expect(created(COIN_TARGET)).toBe(1);
  });

  test('leaving the video route releases the FAB, the watchers and the queue', async () => {
    const { doc, clock, live, created, goToOffVideo } = await mount(VIDEO_A);
    run();
    await flush();
    clock.fireWithDelay(COIN_CHECK_MS);
    await flush();
    expect(live(COIN_TARGET)).toBe(1);
    expect(clock.countOfDelay(COIN_OBSERVER_TIMEOUT_MS)).toBe(1);

    await goToOffVideo();
    expect(doc.querySelectorAll(FAB_ATTR)).toHaveLength(0);
    expect(live(COIN_TARGET)).toBe(0);
    expect(live(REC_CONTAINER)).toBe(0);
    expect(clock.idsOfDelay(COIN_CHECK_MS)).toEqual([]);
    expect(clock.idsOfDelay(REC_WATCH_MS)).toEqual([]);
    expect(clock.idsOfDelay(COIN_OBSERVER_TIMEOUT_MS)).toEqual([]);

    clock.drain();
    await flush();
    expect(created(REC_CONTAINER)).toBe(0);
    expect(doc.querySelectorAll(FAB_ATTR)).toHaveLength(0);
  });

  test('the coin auto-mark writes under the bvid it was scheduled for', async () => {
    const { clock, countOfMessage, keysOfMessage } = await mount(VIDEO_A, {
      coinTitle: '投币已完成，已用完',
    });
    run();
    await flush();
    expect(countOfMessage('DB_PUT')).toBe(0);

    clock.fireWithDelay(COIN_CHECK_MS);
    await flush();
    expect(countOfMessage('DB_PUT')).toBe(1);
    expect(keysOfMessage('DB_PUT')).toEqual([`movie::${VIDEO_A}`]);
  });

  test('a coin check scheduled for the old video cannot mark the new one', async () => {
    const { clock, countOfMessage, keysOfMessage, goTo } = await mount(VIDEO_A, {
      coinTitle: '投币已完成，已用完',
    });
    run();
    await flush();

    await goTo(VIDEO_B);
    expect(clock.idsOfDelay(COIN_CHECK_MS)).toHaveLength(1);
    expect(countOfMessage('DB_PUT')).toBe(0);

    // The surviving kick is B's own: it may write, but only under B.
    clock.fireWithDelay(COIN_CHECK_MS);
    await flush();
    expect(keysOfMessage('DB_PUT')).toEqual([`movie::${VIDEO_B}`]);
  });
});
