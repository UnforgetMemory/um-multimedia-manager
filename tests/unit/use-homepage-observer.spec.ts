import { test, expect } from '@playwright/test';
import { defineGlobal } from './helpers/global-sandbox';
import { JSDOM } from 'jsdom';

/**
 * usePageObserver / useHomepageObserver behavior lock (X11-G).
 *
 * SPA growth watcher for the Douban homepage: leading call on start(),
 * added-node matching (direct or nested), class-attribute churn on observed
 * containers, throttle coalescing of bursts, polling catching mutations the
 * MutationObserver path rejects, stop()/unmount ending everything.
 *
 * jsdom supplies a real MutationObserver; timers are real with short windows.
 * Vue onUnmounted needs a component scope → dynamic imports + mount (see
 * debounced-query.spec.ts precedent).
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
defineGlobal('MutationObserver', dom.window.MutationObserver);

type VueModule = typeof import('vue');
type ObserverModule =
  typeof import('@/scenario/douban/pages/homepage/composables/use-homepage-observer');

let vue: VueModule | undefined;
let mod: ObserverModule | undefined;

async function load(): Promise<{ vue: VueModule; mod: ObserverModule }> {
  if (!vue || !mod) {
    vue = await import('vue');
    mod = await import('@/scenario/douban/pages/homepage/composables/use-homepage-observer');
  }
  return { vue, mod };
}

const SELECTORS = '#screening, .recent-hot';
const doc = dom.window.document;

function el(html: string): HTMLElement {
  const wrapper = doc.createElement('div');
  wrapper.innerHTML = html;
  const node = wrapper.firstElementChild;
  if (!(node instanceof dom.window.HTMLElement)) throw new Error('fixture: not an element');
  return node;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface Harness {
  calls: number[];
  start: () => void;
  stop: () => void;
  teardown: () => void;
}

async function harness(
  options: Partial<
    import('@/scenario/douban/pages/homepage/composables/use-homepage-observer').PageObserverOptions
  > = {},
): Promise<Harness> {
  const { vue: v, mod: m } = await load();
  const calls: number[] = [];
  let start!: () => void;
  let stop!: () => void;

  const container = doc.createElement('div');
  doc.body.appendChild(container);
  const app = v.createApp({
    setup() {
      const obs = m.usePageObserver(() => void calls.push(Date.now()), {
        containerSelectors: SELECTORS,
        pollIntervalMs: 20,
        pollDurationMs: 2000,
        throttleMs: 15,
        ...options,
      });
      start = obs.start;
      stop = obs.stop;
      return () => v.h('div');
    },
  });
  app.mount(container);
  return {
    calls,
    start,
    stop,
    teardown: () => {
      app.unmount();
      container.remove();
    },
  };
}

function clearBody(): void {
  doc.body.replaceChildren();
}

test.afterEach(clearBody);

test.describe('usePageObserver（homepage）', () => {
  test('start() fires the leading callback exactly once; second start() is a no-op', async () => {
    const h = await harness();
    try {
      h.start();
      expect(h.calls).toHaveLength(1);
      h.start(); // `if (observer) return` guard
      await wait(60);
      expect(h.calls).toHaveLength(1);
    } finally {
      h.teardown();
    }
  });

  test('appending a matching container triggers a second (throttled) call', async () => {
    const h = await harness();
    try {
      h.start();
      await wait(40); // leave the leading throttle window
      doc.body.appendChild(el('<div id="screening"></div>'));
      await wait(60);
      expect(h.calls).toHaveLength(2);
    } finally {
      h.teardown();
    }
  });

  test('nested growth: added wrapper CONTAINING a target matches via querySelector', async () => {
    const h = await harness();
    try {
      h.start();
      await wait(40);
      doc.body.appendChild(el('<section><div class="recent-hot"><span>x</span></div></section>'));
      await wait(60);
      expect(h.calls).toHaveLength(2);
    } finally {
      h.teardown();
    }
  });

  test('unrelated DOM churn (no selector hit) never calls back', async () => {
    const h = await harness();
    try {
      h.start();
      await wait(40);
      doc.body.appendChild(el('<div class="footer-ads"><b>no subject section</b></div>'));
      await wait(80);
      expect(h.calls).toHaveLength(1);
    } finally {
      h.teardown();
    }
  });

  test('class attribute change on an observed container re-triggers', async () => {
    const h = await harness();
    try {
      doc.body.appendChild(el('<div id="screening"></div>'));
      h.start(); // leading call, container observed at refresh
      await wait(40);
      doc.getElementById('screening')?.classList.add('js-updated');
      await wait(60);
      expect(h.calls.length).toBeGreaterThanOrEqual(2);
    } finally {
      h.teardown();
    }
  });

  test('burst of mutations coalesces: ≥2 added targets → one trailing call', async () => {
    const h = await harness();
    try {
      h.start();
      await wait(40);
      doc.body.appendChild(el('<div id="screening"></div>'));
      doc.body.appendChild(el('<div class="recent-hot"></div>'));
      await wait(80);
      expect(h.calls).toHaveLength(2); // leading + ONE trailing, not three
    } finally {
      h.teardown();
    }
  });

  test('stop() clears observer + polling: later growth is silent', async () => {
    const h = await harness();
    try {
      h.start();
      await wait(40);
      h.stop();
      doc.body.appendChild(el('<div id="screening"></div>'));
      await wait(80);
      expect(h.calls).toHaveLength(1); // nothing after the leading call
    } finally {
      h.teardown();
    }
  });

  test('component unmount auto-stops (onUnmounted → stop)', async () => {
    const h = await harness();
    h.start();
    await wait(40);
    h.teardown(); // unmount fires stop()
    doc.body.appendChild(el('<div class="recent-hot"></div>'));
    await wait(80);
    expect(h.calls).toHaveLength(1);
  });

  test('pollDurationMs expiry ends the polling interval (interval path is bounded)', async () => {
    // Observer callback path proves itself above; here lock the bound: with a
    // 60ms budget and 10ms interval the poller must not keep re-arming past it
    // — growth AFTER expiry still works via MutationObserver exactly once, so
    // total extra calls stays deterministic instead of unbounded.
    const h = await harness({ pollIntervalMs: 10, pollDurationMs: 60, throttleMs: 15 });
    try {
      h.start();
      await wait(150); // poller expired
      doc.body.appendChild(el('<div id="screening"></div>'));
      await wait(100);
      expect(h.calls).toHaveLength(2); // leading + one growth call
    } finally {
      h.teardown();
    }
  });

  test('alias export: useHomepageObserver === usePageObserver', async () => {
    const { mod: m } = await load();
    expect(m.useHomepageObserver).toBe(m.usePageObserver);
  });
});
