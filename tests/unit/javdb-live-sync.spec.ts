import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';

initFileSandbox();
import { JSDOM } from 'jsdom';
import { handleJavDBPage } from '@/entrypoints/content/handlers/javdb';

/**
 * JavDB live dim sync (X67 / X70).
 *
 * The enhancer used to be one-way: it added `.umm-viewed` when an AV id turned
 * out to be watched (and on click) and never took it away, so a record written
 * or deleted elsewhere left the page stale until reload. These cases pin the
 * two-way behaviour — including the rule that a *failed* read must not clear
 * anything, because "no answer" is not "not watched".
 *
 * X70 adds the other half of that rule: a failed read is not an answer, so the
 * page must go and ask again (bounded backoff) instead of staying undimmed
 * forever — a static list page gets no second DOM mutation and no record event.
 */

const A = 'SSIS-001';
const B = 'ABC-123';

interface Stub {
  watched: string[];
  ok: boolean;
  batchCalls: string[][];
}

interface Timer {
  id: number;
  fn: () => void;
  ms: number;
}

/**
 * Delay-agnostic fake clock: the cases fire "the earliest pending timer", so
 * they pin the *contract* (bounded, increasing backoff) instead of the exact
 * millisecond numbers the handler happens to use today.
 *
 * Only the retry machinery is scheduled here — `sendMessageWithTimeout` clears
 * its own 8s watchdog as soon as the stub answers synchronously, so the pending
 * set contains nothing but retry timers.
 */
class FakeClock {
  private pending: Timer[] = [];
  private seq = 1;
  readonly cleared: number[] = [];

  setTimeout(fn: () => void, ms = 0): number {
    const task: Timer = { id: this.seq++, fn, ms };
    this.pending.push(task);
    return task.id;
  }

  clearTimeout(id?: number): void {
    if (id === undefined) return;
    this.cleared.push(id);
    this.pending = this.pending.filter((t) => t.id !== id);
  }

  /** Runs the soonest pending timer and returns what it was waiting for. */
  fireEarliest(): number | undefined {
    let target: Timer | undefined;
    for (const t of this.pending) {
      if (target === undefined || t.ms < target.ms) target = t;
    }
    if (target === undefined) return undefined;
    this.pending = this.pending.filter((t) => t !== target);
    target.fn();
    return target.ms;
  }

  get pendingDelays(): number[] {
    return this.pending.map((t) => t.ms);
  }
}

function setup(stub: Stub, clock?: FakeClock) {
  const dom = new JSDOM(
    `<!doctype html><html><body><div class="movie-list">
       <div class="item"><div class="video-title"><strong>${A}</strong></div></div>
       <div class="item"><div class="video-title"><strong>${B}</strong></div></div>
     </div></body></html>`,
    { url: 'https://www.javdb.com/videos', pretendToBeVisual: true },
  );
  defineGlobal('window', dom.window);
  defineGlobal('document', dom.window.document);
  defineGlobal('location', dom.window.location);
  defineGlobal('navigator', dom.window.navigator);
  defineGlobal('Node', dom.window.Node);
  defineGlobal('Element', dom.window.Element);
  defineGlobal('HTMLElement', dom.window.HTMLElement);
  defineGlobal('SVGElement', dom.window.SVGElement);
  defineGlobal('MutationObserver', dom.window.MutationObserver);
  defineGlobal('localStorage', dom.window.localStorage);
  defineGlobal('chrome', {
    i18n: {
      getUILanguage: () => 'zh-CN',
      detectLanguage: () => 'zh-CN',
      getMessage: (key: string) => key,
    },
    storage: {
      local: {
        get: (_keys: unknown, cb: (items: Record<string, unknown>) => void) => cb({}),
        set: (_items: unknown, cb?: () => void) => cb?.(),
      },
      onChanged: { addListener: () => {}, removeListener: () => {} },
    },
    runtime: {
      id: 'umm-test',
      lastError: undefined,
      sendMessage: (
        msg: { type: string; payload?: { ids?: string[] } },
        cb?: (response: unknown) => void,
      ) => {
        const respond = (response: unknown): void => {
          cb?.(response);
        };
        if (msg.type === 'ADULT_AV_CHECK_BATCH') {
          const ids = msg.payload?.ids ?? [];
          stub.batchCalls.push(ids);
          if (!stub.ok) {
            // A broken answer: success without a usable array.
            respond({ success: true });
            return;
          }
          respond({
            success: true,
            watched: ids.filter((id) => stub.watched.includes(id.toUpperCase())),
          });
          return;
        }
        respond({ success: true });
      },
      onMessage: { addListener: () => {} },
    },
  });
  if (clock) {
    // 必须在 handleJavDBPage 之前装好：重试排程读的是调用期的全局 setTimeout。
    defineGlobal('setTimeout', clock.setTimeout.bind(clock));
    defineGlobal('clearTimeout', clock.clearTimeout.bind(clock));
  }
  return dom;
}

const settle = (ms = 320): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Drain the promise chain under the fake clock (batchCheckExists → sendMsg →
 * safeSendMessage → the `.then` that toggles marks). Nothing here may use
 * `settle`: with the clock installed its own timer would never fire.
 */
const flush = async (): Promise<void> => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};

function items(doc: Document): NodeListOf<HTMLElement> {
  return doc.querySelectorAll<HTMLElement>('.item');
}

test.describe('JavDB 淡化活态同步', () => {
  test('首次扫描标记已看条目并记下 avid 便于后续重算', async () => {
    const stub: Stub = { watched: [A], ok: true, batchCalls: [] };
    const dom = setup(stub);
    const teardown = await handleJavDBPage({ subscribeRecord: () => () => undefined });

    await settle();
    const els = items(dom.window.document);
    expect(els[0]?.classList.contains('umm-viewed')).toBe(true);
    expect(els[1]?.classList.contains('umm-viewed')).toBe(false);
    expect(els[0]?.getAttribute('data-umm-avid')).toBe(A);
    teardown();
  });

  test('外部删除记录后，事件驱动的同步会撤掉淡化（不必重载）', async () => {
    const stub: Stub = { watched: [A], ok: true, batchCalls: [] };
    const dom = setup(stub);
    const handlers: Array<() => void> = [];
    const teardown = await handleJavDBPage({
      subscribeRecord: (_store, _key, onChange) => {
        handlers.push(onChange);
        return () => undefined;
      },
    });
    await settle();
    const els = items(dom.window.document);
    expect(els[0]?.classList.contains('umm-viewed')).toBe(true);

    // 记录在别处被删掉 —— 页面 DOM 没有任何变化，只能靠事件重算。
    stub.watched = [];
    handlers.forEach((onChange) => onChange());
    await settle();
    expect(els[0]?.classList.contains('umm-viewed'), 'dim must clear').toBe(false);
    // 日系 / 美欧两张表都订，否则按 avid 归类不同而漏刷新。
    expect(handlers.length).toBe(2);
    teardown();
  });

  test('读失败不是答案：不得据此清除已有淡化', async () => {
    const stub: Stub = { watched: [A], ok: true, batchCalls: [] };
    const dom = setup(stub);
    const handlers: Array<() => void> = [];
    const teardown = await handleJavDBPage({
      subscribeRecord: (_store, _key, onChange) => {
        handlers.push(onChange);
        return () => undefined;
      },
    });
    await settle();
    const els = items(dom.window.document);
    expect(els[0]?.classList.contains('umm-viewed')).toBe(true);

    stub.ok = false; // success:true 但没有可用数组 —— 属于坏答案
    handlers.forEach((onChange) => onChange());
    await settle();
    expect(els[0]?.classList.contains('umm-viewed'), 'a broken read must not clear').toBe(true);
    teardown();
  });

  test('teardown 释放两条记录订阅', async () => {
    const stub: Stub = { watched: [], ok: true, batchCalls: [] };
    setup(stub);
    let released = 0;
    const teardown = await handleJavDBPage({
      subscribeRecord: () => () => {
        released += 1;
      },
    });
    teardown();
    expect(released, 'both adult-av stores must be unsubscribed').toBe(2);
  });
});

/**
 * X70 有界重读。
 *
 * 走假时钟：真实退避要等 1.5s+3s+6s，且「上界」用例必须证明第四段不存在 ——
 * 用真时钟就只能等满全部退避再把 timeout 之后的静默期也等掉。
 */
test.describe('JavDB 读失败后的有界重读', () => {
  test('初次读失败会在重试后补上淡化：静态列表页不等事件、不等 DOM 变更', async () => {
    const stub: Stub = { watched: [A], ok: false, batchCalls: [] };
    const clock = new FakeClock();
    const dom = setup(stub, clock);
    const teardown = await handleJavDBPage({ subscribeRecord: () => () => undefined });
    await flush();

    const els = items(dom.window.document);
    expect(stub.batchCalls.length, 'one batch read on mount').toBe(1);
    expect(els[0]?.classList.contains('umm-viewed'), 'a failed read must not dim').toBe(false);
    const first = clock.pendingDelays[0] ?? -1;
    expect(first, 'a failed read must schedule exactly one retry').toBeGreaterThan(0);

    // 后台恢复，页面没有任何输入：只有重读能让淡化出现。
    stub.ok = true;
    expect(clock.fireEarliest()).toBeDefined();
    await flush();
    expect(els[0]?.classList.contains('umm-viewed'), 'the re-read must dim').toBe(true);
    expect(stub.batchCalls.length).toBe(2);
    expect(clock.pendingDelays, 'a real answer ends the retry loop').toEqual([]);
    teardown();
  });

  test('退避有上界：一直失败只补读三次，之后不再追着后台打', async () => {
    const stub: Stub = { watched: [A], ok: false, batchCalls: [] };
    const clock = new FakeClock();
    const dom = setup(stub, clock);
    const teardown = await handleJavDBPage({ subscribeRecord: () => () => undefined });
    await flush();

    const delays: number[] = [];
    for (let i = 0; i < 6; i++) {
      const fired = clock.fireEarliest();
      if (fired === undefined) break;
      delays.push(fired);
      await flush();
    }

    expect(stub.batchCalls.length, 'initial read + 3 bounded retries').toBe(4);
    expect(delays.length, 'the fourth retry must never be scheduled').toBe(3);
    // 递增退避：不能三段同宽（那是把 8s 预算的失败改成高频轮询）。
    const ascending = [...delays].sort((x, y) => x - y);
    expect(delays).toEqual(ascending);
    expect(new Set(delays).size, 'backoff steps must be distinct').toBe(delays.length);
    expect(
      items(dom.window.document)[0]?.classList.contains('umm-viewed'),
      'giving up must still not invent a verdict',
    ).toBe(false);
    teardown();
  });

  test('teardown 丢掉待决重试：页面注销后不得再读后台', async () => {
    const stub: Stub = { watched: [A], ok: false, batchCalls: [] };
    const clock = new FakeClock();
    setup(stub, clock);
    const teardown = await handleJavDBPage({ subscribeRecord: () => () => undefined });
    await flush();
    expect(clock.pendingDelays.length).toBe(1);

    teardown();
    expect(clock.pendingDelays, 'teardown must drop the pending retry').toEqual([]);
    const before = stub.batchCalls.length;
    expect(clock.fireEarliest()).toBeUndefined();
    await flush();
    expect(stub.batchCalls.length, 'no read may follow teardown').toBe(before);
  });

  test('拿到一次真实答案就把退避预算归零（后续失败重新从最短档开始）', async () => {
    const stub: Stub = { watched: [A], ok: false, batchCalls: [] };
    const clock = new FakeClock();
    const handlers: Array<() => void> = [];
    setup(stub, clock);
    const teardown = await handleJavDBPage({
      subscribeRecord: (_store, _key, onChange) => {
        handlers.push(onChange);
        return () => undefined;
      },
    });
    await flush();
    const initial = clock.pendingDelays[0] ?? -1;
    expect(initial).toBeGreaterThan(0);

    // 连续两段失败把预算推到第三档，然后第三次补读成功。
    expect(clock.fireEarliest()).toBeDefined();
    await flush();
    expect(clock.fireEarliest()).toBeDefined();
    await flush();
    stub.ok = true;
    expect(clock.fireEarliest()).toBeDefined();
    await flush();
    expect(clock.pendingDelays).toEqual([]);

    // 之后的新失败必须重新从最短档开始，而不是停在最后一档。
    stub.ok = false;
    handlers[0]?.();
    await flush();
    expect(clock.pendingDelays, 'the budget must reset after a real answer').toEqual([initial]);
    teardown();
  });
});
