import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';

initFileSandbox();
import { broadcast, initEventBus, onEvent, type EventType } from '@/libraries/utils/event-bus';
import { configureLogging } from '@/libraries/utils/logger';

/**
 * event-bus — the background → content-script broadcast spine.
 * Contracts pinned:
 * 1. broadcast() sends the exact EVENT_BUS envelope fire-and-forget on BOTH
 *    delivery channels: `runtime.sendMessage` (extension pages) and one
 *    `tabs.sendMessage` per tab (content scripts). The runtime channel alone
 *    NEVER reaches injected scripts, so the tabs leg is what makes ADR-015
 *    live refresh work at all — the e2e suite (book-home-live-refresh) caught
 *    its absence as a silent no-refresh regression.
 *    The expected "Could not establish connection" lastError is swallowed
 *    while other messaging failures surface via console.debug; a throwing
 *    sendMessage (invalidated context) never escapes, and a context with no
 *    `chrome` binding at all (Node-side handler import) stays silent.
 * 2. initEventBus registers the onMessage listener exactly once (the X7 fix:
 *    `initialized` flips only after successful registration, so a throwing
 *    registration is retryable, not silently "already initialized").
 * 3. Delivery: per-event isolation, verbatim data pass-through (a '*' key
 *    inside the payload is opaque to the bus — consumers interpret it),
 *    sender-id and envelope-type filtering, throwing subscriber cannot
 *    starve later subscribers, unsubscribed listeners never receive.
 */

type BusListener = (message: unknown, sender: chrome.runtime.MessageSender) => void;

const listeners: BusListener[] = [];
const sent: { message: unknown }[] = [];
const tabSends: { tabId: number; message: unknown }[] = [];
let tabList: Array<{ id?: number; url?: string }> = [];
let pendingError: { message: string } | undefined;
let sendMessageThrows = false;
let addListenerThrows = false;

const runtimeFake = {
  id: 'test-ext-id',
  get lastError() {
    return pendingError;
  },
  onMessage: {
    addListener: (fn: BusListener) => {
      if (addListenerThrows) throw new Error('extension context invalidated');
      listeners.push(fn);
    },
  },
  sendMessage: (message: unknown, callback: () => void) => {
    if (sendMessageThrows) throw new Error('context invalidated');
    sent.push({ message });
    callback();
  },
};

const tabsFake = {
  query: async (): Promise<Array<{ id?: number }>> => tabList,
  sendMessage: (tabId: number, message: unknown, callback: () => void): void => {
    tabSends.push({ tabId, message });
    callback();
  },
};

defineGlobal('chrome', { runtime: runtimeFake, tabs: tabsFake });

/** Deliver an envelope to the bus as background would. */
function deliver(message: unknown, senderId = 'test-ext-id'): void {
  const sender = { id: senderId } as chrome.runtime.MessageSender;
  for (const listener of listeners) listener(message, sender);
}

test.describe('broadcast (background side)', () => {
  // Shared module-level accumulators: tests below assert exact lengths, so any
  // residue from a predecessor decides pass/fail. Without this hook the file
  // only passes when Playwright happens to split it across workers — CI runs
  // `workers: 1`, and `retries: 2` then hides the order dependency in a brand
  // new worker (revisit rule 4: reproduce under retries:0).
  test.beforeEach(() => {
    sent.length = 0;
    tabSends.length = 0;
    tabList = [];
    pendingError = undefined;
    sendMessageThrows = false;
  });

  test('sends the EVENT_BUS envelope verbatim, data included', () => {
    sent.length = 0;
    const data = { storeName: 'douban_records', key: '*' };
    broadcast('record:updated', data);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.message).toEqual({ type: 'EVENT_BUS', event: 'record:updated', data });
  });

  test('"no receiver" lastError is swallowed without console noise', () => {
    const debugs: unknown[][] = [];
    const prevDebug = console.debug;
    console.debug = (...args: unknown[]) => debugs.push(args);
    sent.length = 0;
    pendingError = { message: 'Could not establish connection. Receiving end does not exist.' };
    try {
      broadcast('settings:changed', { foo: 1 });
      expect(sent).toHaveLength(1);
      expect(debugs).toEqual([]);
    } finally {
      pendingError = undefined;
      console.debug = prevDebug;
    }
  });

  test('a non-connection lastError surfaces through the logger outlet', () => {
    // Contract changed from a bare `console.debug` to `debugLog` (the single
    // diagnostic outlet enforced by console:check). The signal must still reach
    // the console when debugging is on, and must NOT be downgraded to silence.
    const logs: unknown[][] = [];
    const prevLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args);
    configureLogging({ enabled: true, level: 'debug' });
    try {
      pendingError = { message: 'Something else broke' };
      broadcast('sync:completed');
      expect(logs.length, 'debug failure signal must surface').toBeGreaterThanOrEqual(1);
      expect(logs.map((a) => a.join(' ')).join(' ')).toContain('Something else broke');
    } finally {
      pendingError = undefined;
      console.log = prevLog;
      // Restore the module-level logger config: leaving it enabled would leak
      // into later files in the same worker.
      configureLogging({ enabled: false, level: 'info' });
    }
  });

  test('a synchronous sendMessage throw is swallowed (fire-and-forget)', () => {
    sendMessageThrows = true;
    try {
      expect(() => broadcast('record:deleted')).not.toThrow();
    } finally {
      sendMessageThrows = false;
    }
  });

  test('the tabs leg sends the same envelope once per injectable tab', async () => {
    sent.length = 0;
    tabSends.length = 0;
    tabList = [{ id: 7 }, { id: 9 }, { url: 'no id here' }];
    const data = { storeName: 'douban_records', key: 'book::1' };
    try {
      broadcast('record:updated', data);
      await new Promise((resolve) => setTimeout(resolve, 0));
      const envelope = { type: 'EVENT_BUS', event: 'record:updated', data };
      // Extension pages get the runtime message...
      expect(sent).toEqual([{ message: envelope }]);
      // ...and every tab with an id gets its own copy (content scripts are
      // unreachable through the runtime channel).
      expect(tabSends).toEqual([
        { tabId: 7, message: envelope },
        { tabId: 9, message: envelope },
      ]);
    } finally {
      tabList = [];
    }
  });

  test('a "no receiver" lastError on the tabs leg stays silent', async () => {
    const debugs: unknown[][] = [];
    const prevDebug = console.debug;
    console.debug = (...args: unknown[]) => debugs.push(args);
    tabList = [{ id: 3 }];
    pendingError = { message: 'Could not establish connection. Receiving end does not exist.' };
    try {
      broadcast('record:updated', { storeName: 'douban_records', key: 'x' });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(tabSends).toHaveLength(1);
      expect(debugs).toEqual([]);
    } finally {
      tabList = [];
      tabSends.length = 0;
      pendingError = undefined;
      console.debug = prevDebug;
    }
  });

  test('a context without chrome.tabs stays runtime-only instead of throwing', () => {
    defineGlobal('chrome', { runtime: runtimeFake });
    sent.length = 0;
    try {
      expect(() => broadcast('settings:changed', { a: 1 })).not.toThrow();
      expect(sent).toHaveLength(1);
    } finally {
      defineGlobal('chrome', { runtime: runtimeFake, tabs: tabsFake });
    }
  });

  // Node-side unit tests import background handlers with no `chrome` binding at
  // all; a bare reference in the tabs leg threw inside the async function and
  // leaked as an unhandled rejection that poisoned unrelated specs.
  test('a context with no `chrome` global leaks neither a throw nor a rejection', async () => {
    const rejections: unknown[] = [];
    const onRejection = (reason: unknown): void => {
      rejections.push(reason);
    };
    process.on('unhandledRejection', onRejection);
    delete (globalThis as { chrome?: unknown }).chrome;
    try {
      expect(() => broadcast('record:updated', { storeName: 'douban_records' })).not.toThrow();
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
      expect(rejections).toEqual([]);
    } finally {
      process.off('unhandledRejection', onRejection);
      defineGlobal('chrome', { runtime: runtimeFake, tabs: tabsFake });
    }
  });
});

test.describe('content-side subscription', () => {
  // Serial + first: these observe the module-global `initialized` flag, so the
  // retry-after-failure (X7 fix) must run before any successful registration.
  test.describe.configure({ mode: 'serial' });

  test('failed registration does not latch `initialized`; later retry attaches once (X7)', () => {
    addListenerThrows = true;
    expect(() => initEventBus()).toThrow('extension context invalidated');
    expect(listeners).toHaveLength(0); // nothing attached, flag NOT flipped
    addListenerThrows = false;
    initEventBus();
    expect(listeners).toHaveLength(1); // retry succeeded
    initEventBus();
    expect(listeners).toHaveLength(1); // idempotent from here on
  });

  test('subscriber receives its event with verbatim data', () => {
    const got: unknown[] = [];
    const off = onEvent('record:updated', (d) => got.push(d));
    try {
      const payload = { storeName: 'douban_records', key: 'movie::123' };
      deliver({ type: 'EVENT_BUS', event: 'record:updated', data: payload });
      // The bus is key-agnostic: even a '*' payload passes through untouched.
      deliver({ type: 'EVENT_BUS', event: 'record:updated', data: { key: '*' } });
      expect(got).toEqual([payload, { key: '*' }]);
    } finally {
      off();
    }
  });

  test('delivery is isolated per event type', () => {
    const updated: unknown[] = [];
    const settings: unknown[] = [];
    const offA = onEvent('record:updated', (d) => updated.push(d));
    const offB = onEvent('settings:changed', (d) => settings.push(d));
    try {
      deliver({ type: 'EVENT_BUS', event: 'record:updated', data: 1 });
      expect(updated).toEqual([1]);
      expect(settings).toEqual([]);
      deliver({ type: 'EVENT_BUS', event: 'settings:changed', data: 2 });
      expect(updated).toEqual([1]);
      expect(settings).toEqual([2]);
    } finally {
      offA();
      offB();
    }
  });

  test('foreign sender ids and non-envelope messages are ignored', () => {
    const got: unknown[] = [];
    const off = onEvent('record:updated', (d) => got.push(d));
    try {
      deliver({ type: 'EVENT_BUS', event: 'record:updated', data: 'x' }, 'other-ext');
      deliver({ type: 'SOME_OTHER_MSG', event: 'record:updated', data: 'x' });
      deliver('not-an-object');
      expect(got).toEqual([]);
    } finally {
      off();
    }
  });

  test('a throwing subscriber neither blocks peers nor escapes', () => {
    const errors: unknown[][] = [];
    const prevError = console.error;
    console.error = (...args: unknown[]) => errors.push(args);
    const got: unknown[] = [];
    const offBad = onEvent('record:deleted', () => {
      throw new Error('subscriber blew up');
    });
    const offGood = onEvent('record:deleted', (d) => got.push(d));
    try {
      expect(() =>
        deliver({ type: 'EVENT_BUS', event: 'record:deleted', data: 'v' }),
      ).not.toThrow();
      expect(got).toEqual(['v']);
      expect(errors).toHaveLength(1);
      expect(String(errors[0]?.[1])).toContain('subscriber blew up');
    } finally {
      offBad();
      offGood();
      console.error = prevError;
    }
  });

  test('unsubscribed listeners never receive; a late subscriber does', () => {
    const before: unknown[] = [];
    const after: unknown[] = [];
    const off = onEvent('sync:completed', (d) => before.push(d));
    off();
    off(); // double-unsubscribe must be harmless
    const offLate = onEvent('sync:completed', (d) => after.push(d));
    try {
      deliver({ type: 'EVENT_BUS', event: 'sync:completed', data: 'done' });
      expect(before).toEqual([]);
      expect(after).toEqual(['done']);
    } finally {
      offLate();
    }
    deliver({ type: 'EVENT_BUS', event: 'sync:completed', data: 'again' });
    expect(after).toEqual(['done']);
  });

  test('delivery with zero subscribers for an event is a no-op', () => {
    const allEvents: EventType[] = [
      'record:updated',
      'record:deleted',
      'settings:changed',
      'sync:completed',
    ];
    for (const event of allEvents) {
      expect(() => deliver({ type: 'EVENT_BUS', event })).not.toThrow();
    }
  });
});
