import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';

initFileSandbox();
import { JSDOM } from 'jsdom';

/**
 * useDebouncedQuery — the single shared trailing-debounce source behind the
 * options query boxes (LinkedTab / RatingTab). Contract under test:
 * 1. rapid calls collapse into ONE trailing invocation carrying the last args;
 * 2. while a pass is in flight the newest request is re-armed, not dropped,
 *    bounded by MAX_BUSY_RETRIES (then it is dropped as before);
 * 3. `cancel` / `dispose` (and host-component unmount) drop the pending pass;
 * 4. a throwing or rejecting query never disappears — it reaches `onError`
 *    (the caller's user-visible feedback seam) or the console.
 */

// Vue's runtime-dom captures `document` at module-initialisation time, so the
// jsdom globals must exist before the first 'vue' import (precedent:
// douban-mark-dialog-a11y.spec.ts) → Vue-facing imports happen inside tests.
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://example.com/' });

defineGlobal('window', dom.window);
defineGlobal('document', dom.window.document);
defineGlobal('navigator', dom.window.navigator);
defineGlobal('Node', dom.window.Node);
defineGlobal('Element', dom.window.Element);
defineGlobal('HTMLElement', dom.window.HTMLElement);
defineGlobal('SVGElement', dom.window.SVGElement);

type VueModule = typeof import('vue');
type DebouncedQueryModule = typeof import('@/feature/composables/use-debounced-query');

let vue: VueModule | undefined;
let mod: DebouncedQueryModule | undefined;

async function load(): Promise<{ vue: VueModule; mod: DebouncedQueryModule }> {
  if (!vue || !mod) {
    vue = await import('vue');
    mod = await import('@/feature/composables/use-debounced-query');
  }
  return { vue, mod };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Positive expectations poll the observable instead of the wall clock: with a
 * full worker pool a 60 ms sleep can expire before a 15 ms timer has run, and
 * the assertion then fails on a correct implementation (observed in a merged
 * run: MAX_BUSY_RETRIES reached 3 of 6 re-arms inside 300 ms). Negative
 * expectations — "nothing must happen" — keep a bounded sleep, since lateness
 * cannot fake a call. A value that could keep growing additionally needs a
 * quiescence check: equality on a monotonic ramp can match mid-flight.
 */
async function until(observable: () => unknown, expected: unknown): Promise<void> {
  await expect.poll(observable, { timeout: 5_000 }).toEqual(expected);
}

test.describe('useDebouncedQuery', () => {
  test('rapid calls collapse into one trailing invocation carrying the last args', async () => {
    const { mod: m } = await load();
    const calls: unknown[][] = [];
    const { run } = m.useDebouncedQuery<number[]>((n) => void calls.push([n]), { delay: 20 });

    run(1);
    run(2);
    run(3);
    expect(calls).toEqual([]);

    await until(() => calls, [[3]]);
  });

  test('a call after the window closes fires a second pass', async () => {
    const { mod: m } = await load();
    const calls: number[] = [];
    const { run } = m.useDebouncedQuery<number[]>((n) => void calls.push(n), { delay: 15 });

    run(1);
    await until(() => calls, [1]);
    run(2);
    await until(() => calls, [1, 2]);
  });

  test('isRunning defers: the newest request survives a busy window', async () => {
    const { mod: m } = await load();
    const calls: number[] = [];
    let running = true;
    const { run } = m.useDebouncedQuery<number[]>(
      (n) => {
        calls.push(n);
      },
      { delay: 15, isRunning: () => running },
    );

    run(1);
    await wait(45);
    expect(calls).toEqual([]); // held back, but still pending

    running = false;
    // re-armed window fired once the pass freed up
    await until(() => calls, [1]);
  });

  test('keystrokes during a busy window coalesce to the last one, not a queue', async () => {
    const { mod: m } = await load();
    const calls: number[] = [];
    let busy = true; // an earlier pass is still in flight
    const { run } = m.useDebouncedQuery<number[]>((n) => void calls.push(n), {
      delay: 15,
      isRunning: () => busy,
    });

    run(1);
    await wait(25);
    run(2);
    busy = false;
    await until(() => calls, [2]);
  });

  test('a permanently busy guard drops the request after MAX_BUSY_RETRIES re-arms', async () => {
    const { mod: m } = await load();
    const calls: number[] = [];
    let checks = 0;
    const { run } = m.useDebouncedQuery<number[]>((n) => void calls.push(n), {
      delay: 15,
      isRunning: () => {
        checks++;
        return true;
      },
    });

    run(1);
    // Initial pass + MAX_BUSY_RETRIES re-arms, then the request is given up on.
    await until(() => checks, m.MAX_BUSY_RETRIES + 1);
    // Hitting the value is not enough: on a monotonic ramp `toEqual` also matches
    // mid-flight, so an implementation that never gives up would sail through.
    // The ceiling has to actually stop the chain.
    const atCeiling = checks;
    await wait(150); // > one re-arm window (delay 15ms)
    expect(checks, 're-arm chain kept going past the ceiling').toBe(atCeiling);
    expect(calls).toEqual([]);
  });

  test('cancel drops the pending pass, later calls still schedule', async () => {
    const { mod: m } = await load();
    const calls: number[] = [];
    const { run, cancel } = m.useDebouncedQuery<number[]>((n) => void calls.push(n), { delay: 20 });

    run(1);
    cancel();
    await wait(60);
    expect(calls).toEqual([]);

    run(2);
    await until(() => calls, [2]);
  });

  test('dispose drops the pending pass and blocks further runs', async () => {
    const { mod: m } = await load();
    const calls: number[] = [];
    const { run, dispose } = m.useDebouncedQuery<number[]>((n) => void calls.push(n), {
      delay: 20,
    });

    run(1);
    dispose();
    await wait(60);
    expect(calls).toEqual([]);

    run(2);
    await wait(60);
    expect(calls).toEqual([]);
  });

  test('a rejecting query reaches onError instead of vanishing', async () => {
    const { mod: m } = await load();
    const errors: unknown[] = [];
    const { run } = m.useDebouncedQuery(
      async () => {
        throw new Error('db down');
      },
      { delay: 10, onError: (e) => void errors.push(e) },
    );

    run();
    await until(() => errors.length, 1);
    expect(String(errors[0])).toContain('db down');
  });

  test('a synchronous throw reaches the same failure seam', async () => {
    const { mod: m } = await load();
    const errors: unknown[] = [];
    const { run } = m.useDebouncedQuery(
      () => {
        throw new Error('parse blew up');
      },
      { delay: 10, onError: (e) => void errors.push(e) },
    );

    run();
    await until(() => errors.length, 1);
    expect(String(errors[0])).toContain('parse blew up');
  });

  test('without onError the failure is still logged, never silent', async () => {
    const { mod: m } = await load();
    const warnings: unknown[][] = [];
    const prevWarn = console.warn;
    console.warn = (...args: unknown[]) => warnings.push(args);
    const { run } = m.useDebouncedQuery(
      async () => {
        throw new Error('quiet failure');
      },
      { delay: 10 },
    );
    try {
      run();
      await until(() => warnings.length, 1);
      expect(String(warnings[0]?.[0])).toContain('useDebouncedQuery failed');
      expect(String(warnings[0]?.[1])).toContain('quiet failure');
    } finally {
      console.warn = prevWarn;
    }
  });

  test('a still-mounted host lets the pending pass fire (positive control)', async () => {
    const { vue: v, mod: m } = await load();
    const calls: number[] = [];
    const container = dom.window.document.createElement('div');
    dom.window.document.body.appendChild(container);
    const app = v.createApp({
      setup() {
        m.useDebouncedQuery<number[]>((n) => void calls.push(n), { delay: 20 }).run(7);
        return () => v.h('div');
      },
    });
    app.mount(container);
    await wait(80);
    expect(calls).toEqual([7]);
    app.unmount();
    container.remove();
  });

  test('unmounting the host component cancels the pending pass', async () => {
    const { vue: v, mod: m } = await load();
    const calls: number[] = [];

    const container = dom.window.document.createElement('div');
    dom.window.document.body.appendChild(container);
    const app = v.createApp({
      setup() {
        // Scheduled while mounted; the unmount below must drop it.
        m.useDebouncedQuery<number[]>((n) => void calls.push(n), { delay: 25 }).run(1);
        return () => v.h('div');
      },
    });
    app.mount(container);
    app.unmount();

    await wait(80);
    expect(calls).toEqual([]);
    container.remove();
  });
});
