import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';

initFileSandbox();
import { JSDOM } from 'jsdom';
import { createVideoOverlay, parseYoutubeVideoId } from '@/entrypoints/content/ui/video-overlay';

/**
 * Deferred work owned by the shared video overlay.
 *
 * A recommendation watcher is armed seconds after the FAB, so teardown can race
 * it: a pending timer that survives cleanup re-registers the container observer
 * and re-stamps badges on a page that was already released. Feed churn is the
 * other half — one mutation batch scheduling its own timer meant one bulk DB
 * read per batch instead of one per settle window.
 */

const REC_WATCH_DELAY_MS = 3000;
const REC_REFRESH_DELAY_MS = 300;
const DECORATE_DELAY_MS = 500;

interface Task {
  id: number;
  fn: () => void;
  ms: number;
}

class FakeClock {
  private pending: Task[] = [];
  private seq = 1;
  readonly cleared: number[] = [];

  setTimeout(fn: () => void, ms = 0): number {
    const task: Task = { id: this.seq++, fn, ms };
    this.pending.push(task);
    return task.id;
  }

  clearTimeout(id?: number): void {
    if (id === undefined) return;
    this.cleared.push(id);
    this.pending = this.pending.filter((t) => t.id !== id);
  }

  /** Runs every pending timeout with this exact delay; timers they add stay pending. */
  fireWithDelay(ms: number): number {
    const due = this.pending.filter((t) => t.ms === ms);
    for (const task of due) {
      this.pending = this.pending.filter((t) => t.id !== task.id);
      task.fn();
    }
    return due.length;
  }

  get pendingDelays(): number[] {
    return this.pending.map((t) => t.ms);
  }
}

interface Observation {
  target: string;
}

interface ObserverRecord {
  observations: Observation[];
  connected: boolean;
}

interface Sent {
  type: string;
}

/** Awaiting several microtask ticks delivers MutationObserver records + promise chains. */
async function flush(): Promise<void> {
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

const CARDS = ['/watch?v=AAAAAAAAAAA', '/watch?v=BBBBBBBBBBB']
  .map((href) => `<div class="rc"><a href="${href}"></a><div class="th"></div></div>`)
  .join('');

function mount(opts: { withCards?: boolean } = {}): {
  document: Document;
  clock: FakeClock;
  records: ObserverRecord[];
  sent: Sent[];
} {
  const withCards = opts.withCards ?? true;
  const cardsHtml = withCards ? CARDS : '';
  const dom = new JSDOM(
    `<!doctype html><html><body><div id="secondary">${cardsHtml}</div></body></html>`,
    {
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      pretendToBeVisual: true,
    },
  );
  const doc = dom.window.document;
  const clock = new FakeClock();
  const records: ObserverRecord[] = [];
  const sent: Sent[] = [];

  function targetName(node: Node): string {
    if (node === doc.body) return 'body';
    if (node === doc.documentElement) return 'html';
    const el = node as Element;
    return el.id ? `#${el.id}` : String(node.nodeName).toLowerCase();
  }

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
  defineGlobal('navigator', dom.window.navigator);
  defineGlobal('Element', dom.window.Element);
  defineGlobal('HTMLElement', dom.window.HTMLElement);
  defineGlobal('Node', dom.window.Node);
  defineGlobal('MutationObserver', SpyMutationObserver);
  defineGlobal('setTimeout', clock.setTimeout.bind(clock));
  defineGlobal('clearTimeout', clock.clearTimeout.bind(clock));
  defineGlobal('setInterval', () => 0);
  defineGlobal('clearInterval', () => {});
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
  return { document: doc, clock, records, sent };
}

type OverlayConfig = Parameters<typeof createVideoOverlay>[0];

function youtubeOverlay(overrides?: Partial<OverlayConfig>): ReturnType<typeof createVideoOverlay> {
  return createVideoOverlay({
    storeName: 'youtube_records',
    attrPrefix: 'umm-t',
    fontFamily: 'Roboto,Arial,sans-serif',
    theme: {
      attr: 'dark',
      darkCheck: () => document.documentElement.hasAttribute('dark'),
      vars: {
        dark: {
          card: '#212121',
          fg: '#fff',
          border: '#383838',
          overlay: 'rgba(0,0,0,0.7)',
          bbg: '#383838',
          mutedFg: '#aaa',
          ratingBtnBg: '#383838',
          ratingBtnFg: '#ccc',
        },
        light: {
          card: '#fff',
          fg: '#0f0f0f',
          border: '#d9d9d9',
          overlay: 'rgba(0,0,0,0.45)',
          bbg: '#fff',
          mutedFg: '#606060',
          ratingBtnBg: '#f0f0f0',
          ratingBtnFg: '#0f0f0f',
        },
      },
    },
    player: {
      playerSelector: '#movie_player',
      initialVideoSelector: '#movie_player video',
      pollVideoSelector: '#movie_player video',
      requirePlayerTarget: false,
      pollInterval: 2000,
    },
    dimmerStyleId: 'umm-t-dimmer-styles',
    dimmerCss: '',
    recommendation: {
      cardSelector: '.rc',
      linkSelector: 'a[href*="/watch?v="]',
      idFromLink: (link) => parseYoutubeVideoId(link.getAttribute('href') || ''),
      dimmedAttr: 'data-umm-t-dimmed',
      thumbSelector: '.th',
      containerSelectors: ['#secondary'],
    },
    ...overrides,
  });
}

function liveContainerObservers(records: ObserverRecord[]): number {
  return records.filter((r) => r.connected && r.observations.some((o) => o.target === '#secondary'))
    .length;
}

function bulkReads(sent: Sent[]): number {
  return sent.filter((m) => m.type === 'DB_GET_BULK').length;
}

function refreshPending(clock: FakeClock): number {
  return clock.pendingDelays.filter((ms) => ms === REC_REFRESH_DELAY_MS).length;
}

test.describe('video-overlay — recommendation deferred work', () => {
  test('startRecommendationWatch arms one tracked timer and still attaches', async () => {
    const { clock, records, sent } = mount();
    const overlay = youtubeOverlay();
    overlay.setCurrent('dQw4w9WgXcQ');

    overlay.startRecommendationWatch();
    expect(clock.pendingDelays.filter((ms) => ms === REC_WATCH_DELAY_MS)).toHaveLength(1);
    expect(liveContainerObservers(records)).toBe(0);

    expect(clock.fireWithDelay(REC_WATCH_DELAY_MS)).toBe(1);
    await flush();
    expect(liveContainerObservers(records)).toBe(1);
    expect(bulkReads(sent)).toBe(1);
    overlay.destroy();
  });

  test('cleanup cancels the armed watch: no observer, no bulk read', async () => {
    const { clock, records, sent } = mount();
    const overlay = youtubeOverlay();
    overlay.setCurrent('dQw4w9WgXcQ');

    overlay.startRecommendationWatch();
    overlay.cleanup();

    expect(clock.pendingDelays).not.toContain(REC_WATCH_DELAY_MS);
    expect(clock.cleared).toHaveLength(1);

    // Nothing may revive a torn-down page: run whatever survived anyway.
    clock.fireWithDelay(REC_WATCH_DELAY_MS);
    clock.fireWithDelay(REC_REFRESH_DELAY_MS);
    clock.fireWithDelay(DECORATE_DELAY_MS);
    await flush();
    expect(liveContainerObservers(records)).toBe(0);
    expect(bulkReads(sent)).toBe(0);
    overlay.destroy();
  });

  test('destroy cancels a pending refresh burst and disconnects the observer', async () => {
    const { document: doc, clock, records } = mount();
    const overlay = youtubeOverlay();
    overlay.setCurrent('dQw4w9WgXcQ');
    overlay.watchRecommendations();

    doc.getElementById('secondary')!.append(doc.createElement('div'));
    await flush();
    expect(refreshPending(clock)).toBe(1);

    overlay.destroy();
    expect(refreshPending(clock)).toBe(0);
    expect(liveContainerObservers(records)).toBe(0);
  });

  test('a burst of feed mutations inside one settle window reads once', async () => {
    const { document: doc, clock, sent } = mount();
    const overlay = youtubeOverlay();
    overlay.setCurrent('dQw4w9WgXcQ');
    overlay.watchRecommendations();

    const container = doc.getElementById('secondary')!;
    let peakPending = 0;
    for (let i = 0; i < 3; i++) {
      container.append(doc.createElement('div'));
      await flush();
      peakPending = Math.max(peakPending, refreshPending(clock));
    }
    expect(peakPending).toBe(1);

    expect(clock.fireWithDelay(REC_REFRESH_DELAY_MS)).toBe(1);
    await flush();
    expect(bulkReads(sent)).toBe(1);
    // The decoration pass is still pending; firing it would mutate and re-arm.
    expect(clock.pendingDelays).toContain(DECORATE_DELAY_MS);
    overlay.destroy();
  });

  /* ── X40: no full-store fallback, and external writes refresh ───────── */

  test('no visible recommendation cards ⇒ no DB traffic at all (never DB_GET_ALL)', async () => {
    const { clock, sent } = mount({ withCards: false });
    const overlay = youtubeOverlay();
    overlay.setCurrent('dQw4w9WgXcQ');

    overlay.startRecommendationWatch();
    expect(clock.fireWithDelay(REC_WATCH_DELAY_MS)).toBe(1);
    await flush();

    // The old code fell back to a whole-store scan when the key list was empty,
    // but with no cards there is nothing to decorate — the scan bought a full
    // IndexedDB walk and an unchanged screen.
    expect(sent).toEqual([]);
    overlay.destroy();
  });

  test('an external record write re-runs the targeted bulk read', async () => {
    const { clock, sent } = mount();
    const handlers = new Set<() => void>();
    let released = 0;
    const overlay = youtubeOverlay({
      subscribeRecord: (_store, _key, onChange) => {
        handlers.add(onChange);
        return () => {
          handlers.delete(onChange);
          released++;
        };
      },
    });
    overlay.setCurrent('dQw4w9WgXcQ');

    overlay.startRecommendationWatch();
    expect(clock.fireWithDelay(REC_WATCH_DELAY_MS)).toBe(1);
    await flush();
    expect(bulkReads(sent)).toBe(1);
    expect(handlers.size, 'the recommendation lifecycle must subscribe').toBe(1);

    handlers.forEach((onChange) => onChange());
    await flush();
    expect(refreshPending(clock)).toBe(1);
    expect(clock.fireWithDelay(REC_REFRESH_DELAY_MS)).toBe(1);
    await flush();
    expect(bulkReads(sent)).toBe(2);
    overlay.destroy();
  });

  test('destroy releases the record subscription (no refresh after teardown)', async () => {
    const { clock, sent } = mount();
    const handlers = new Set<() => void>();
    let released = 0;
    const overlay = youtubeOverlay({
      subscribeRecord: (_store, _key, onChange) => {
        handlers.add(onChange);
        return () => {
          handlers.delete(onChange);
          released++;
        };
      },
    });
    overlay.setCurrent('dQw4w9WgXcQ');
    overlay.startRecommendationWatch();
    expect(clock.fireWithDelay(REC_WATCH_DELAY_MS)).toBe(1);
    await flush();

    overlay.destroy();
    expect(released).toBe(1);
    expect(handlers.size).toBe(0);

    const before = bulkReads(sent);
    handlers.forEach((onChange) => onChange());
    await flush();
    expect(refreshPending(clock)).toBe(0);
    expect(bulkReads(sent)).toBe(before);
  });
});
