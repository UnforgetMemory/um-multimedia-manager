import { test, expect } from '@playwright/test';

/**
 * intervalWhenVisible — visibility-gated setInterval (`@/libraries/utils/visibility`).
 * Contracts pinned (timer + document stubbed: deterministic tick driving, no
 * real interval timing):
 * 1. ticks fire only while neither document.hidden nor manual pause is active;
 * 2. visibilitychange re-syncs the internal paused flag (hidden → skip,
 *    visible → resume from where it left off, no catch-up burst);
 * 3. pause() stops ticks even while visible, resume() restarts them, resume()
 *    while unpaused is a no-op (does not re-arm a second timer);
 * 4. destroy() clears the interval AND removes the visibilitychange listener —
 *    after destroy, neither a manual tick nor a visibility event revives it.
 */

type Listener = () => void;

interface DocStub {
  hidden: boolean;
  addEventListener: (type: string, fn: Listener) => void;
  removeEventListener: (type: string, fn: Listener) => void;
  listeners: Listener[];
  removed: Listener[];
}

interface TimerStub {
  tick: (() => void) | null;
  cleared: number;
}

let prev: { document: unknown; setInterval: unknown; clearInterval: unknown };
let doc: DocStub;
let timer: TimerStub;

let mod: typeof import('@/libraries/utils/visibility') | undefined;

async function load(): Promise<typeof import('@/libraries/utils/visibility')> {
  if (!mod) mod = await import('@/libraries/utils/visibility');
  return mod;
}

test.beforeEach(() => {
  prev = {
    document: (globalThis as { document?: unknown }).document,
    setInterval: (globalThis as { setInterval?: unknown }).setInterval,
    clearInterval: (globalThis as { clearInterval?: unknown }).clearInterval,
  };
  doc = {
    hidden: false,
    listeners: [],
    removed: [],
    addEventListener: (_type: string, fn: Listener) => void doc.listeners.push(fn),
    removeEventListener: (_type: string, fn: Listener) => void doc.removed.push(fn),
  };
  timer = { tick: null, cleared: 0 };
  Object.defineProperty(globalThis, 'document', { value: doc, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'setInterval', {
    value: (fn: () => void, _ms: number) => {
      timer.tick = fn;
      return 42 as unknown as ReturnType<typeof setInterval>;
    },
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, 'clearInterval', {
    value: (_id: unknown) => {
      timer.cleared += 1;
      timer.tick = null;
    },
    configurable: true,
    writable: true,
  });
});

test.afterEach(() => {
  Object.defineProperty(globalThis, 'document', {
    ...prev,
    value: prev.document,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, 'setInterval', {
    value: prev.setInterval,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, 'clearInterval', {
    value: prev.clearInterval,
    configurable: true,
    writable: true,
  });
});

function fireVisibility(): void {
  for (const fn of doc.listeners) fn();
}

function tick(count = 1): void {
  for (let i = 0; i < count; i++) timer.tick?.();
}

test.describe('intervalWhenVisible', () => {
  test('arms one interval, ticks while visible, and registers one listener', async () => {
    const { intervalWhenVisible } = await load();
    let n = 0;
    const handle = intervalWhenVisible(() => void n++, 1000);
    expect(timer.cleared).toBe(0);
    expect(doc.listeners).toHaveLength(1);
    tick(2);
    expect(n).toBe(2);
    handle.destroy();
  });

  test('hidden tab skips ticks; visibilitychange re-syncs both directions (no catch-up)', async () => {
    const { intervalWhenVisible } = await load();
    let n = 0;
    const handle = intervalWhenVisible(() => void n++, 1000);

    doc.hidden = true;
    fireVisibility();
    tick(5); // hidden: every tick is a no-op, nothing accumulates
    expect(n).toBe(0);

    doc.hidden = false;
    fireVisibility();
    tick(3); // resumes from where it left off: exactly 3 calls, no burst
    expect(n).toBe(3);
    handle.destroy();
  });

  test('starts paused when the document is already hidden at creation', async () => {
    const { intervalWhenVisible } = await load();
    let n = 0;
    doc.hidden = true;
    const handle = intervalWhenVisible(() => void n++, 1000);
    tick();
    expect(n).toBe(0);
    doc.hidden = false;
    fireVisibility();
    tick();
    expect(n).toBe(1);
    handle.destroy();
  });

  test('pause stops ticks while visible; resume restarts; double calls are safe', async () => {
    const { intervalWhenVisible } = await load();
    let n = 0;
    const handle = intervalWhenVisible(() => void n++, 1000);

    handle.pause();
    handle.pause(); // idempotent
    tick(3);
    expect(n).toBe(0);

    handle.resume();
    tick(2);
    expect(n).toBe(2);

    handle.resume(); // resume while unpaused: no-op, still exactly one timer
    tick(1);
    expect(n).toBe(3);
    expect(timer.cleared).toBe(0);
    handle.destroy();
  });

  test('manual pause survives a visibility event; destroy kills timer + listener for good', async () => {
    const { intervalWhenVisible } = await load();
    let n = 0;
    const handle = intervalWhenVisible(() => void n++, 1000);

    handle.pause();
    fireVisibility(); // visibilitychange recomputes paused=false → un-paused
    tick();
    expect(n).toBe(1);

    handle.destroy();
    expect(timer.cleared).toBe(1);
    expect(doc.removed).toEqual(doc.listeners); // exact identity removal

    handle.destroy(); // second destroy is inert (timer already null)
    expect(timer.cleared).toBe(1);
  });
});
