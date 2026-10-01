import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';

initFileSandbox();
import { JSDOM } from 'jsdom';
import type { UrlIdentity } from '@/types';

/**
 * create-detail-handler — the shared legacy detail pipeline (imdb / tmdb /
 * neodb / bangumi), covered for the two paths X32 ② introduced:
 *
 *  - the FIRST paint merges page truth with the stored record;
 *  - an external record write re-derives the SAME verdict through the SAME
 *    merge, and the returned route teardown stops it — a leaked watch would
 *    keep repainting a page the user already left, and a refresh still in flight
 *    when the route goes away must drop its late answer.
 *
 * The record watch is INJECTED (`watchRecord` config seam) rather than driven
 * through the real bus: `event-bus` latches its chrome listener once per worker,
 * so a spec that used it would pass or fail by file-order luck — which is exactly
 * how this case behaved when it went through the global bus (green standalone,
 * red in the merged run). Key/store filtering is covered where it lives, in
 * `watch-record.spec.ts`; here the assertion is that the handler arms the watch
 * with the right store + key at all.
 */

const dom = new JSDOM('<!doctype html><html><body><h1 id="title">X</h1></body></html>', {
  url: 'https://www.imdb.com/title/tt0111161/',
  pretendToBeVisual: true,
});

const sent: Array<{ type: string; payload: unknown }> = [];
let storedRecord: unknown = null;
/** When on, DB_GET answers are held so a refresh can be raced against teardown. */
let holdDbGet = false;
const heldReplies: Array<() => void> = [];

defineGlobal('window', dom.window);
defineGlobal('document', dom.window.document);
defineGlobal('navigator', dom.window.navigator);
defineGlobal('location', dom.window.location);
defineGlobal('Node', dom.window.Node);
defineGlobal('Element', dom.window.Element);
defineGlobal('HTMLElement', dom.window.HTMLElement);
defineGlobal('chrome', {
  runtime: {
    id: 'umm-test',
    lastError: undefined,
    sendMessage: (msg: { type: string; payload?: unknown }, cb?: (res: unknown) => void) => {
      sent.push({ type: msg.type, payload: msg.payload });
      if (msg.type === 'DB_GET') {
        const reply = (): void => cb?.({ success: true, record: storedRecord });
        if (holdDbGet) {
          heldReplies.push(reply);
          return;
        }
        reply();
        return;
      }
      cb?.({ success: true });
    },
  },
});

type Watch = (storeName: string, key: string, onChange: () => void) => () => void;

/** Injected bus: records what the handler armed, and lets the test fire it. */
const armed: Array<{ storeName: string; key: string }> = [];
const onChangeHandlers = new Set<() => void>();
let releaseCount = 0;
const watch: Watch = (storeName, key, onChange) => {
  armed.push({ storeName, key });
  onChangeHandlers.add(onChange);
  return () => {
    onChangeHandlers.delete(onChange);
    releaseCount++;
  };
};

function deliver(): void {
  for (const onChange of [...onChangeHandlers]) onChange();
}

const IDENTITY = {
  platform: 'imdb',
  type: 'movie',
  providerId: 'tt0111161',
  url: 'https://www.imdb.com/title/tt0111161/',
} as unknown as UrlIdentity;

interface Render {
  status: number;
  rating: number;
  note: string;
}

type PageScanResult = import('@/entrypoints/content/handlers/create-detail-handler').PageScanResult;

async function boot(opts: {
  pageStatus?: 'done' | 'none';
  pageRating?: number;
}): Promise<{ renders: Render[]; dispose: () => void }> {
  const mod = await import('@/entrypoints/content/handlers/create-detail-handler');
  const renders: Render[] = [];
  const handle = mod.createDetailPageHandler({
    platform: 'imdb',
    titleSelector: '#title',
    scanFn: (): PageScanResult => ({
      status: opts.pageStatus ?? 'none',
      rating: opts.pageRating ?? 0,
    }),
    renderFn: async (_identity, status, rating, note) => {
      renders.push({ status, rating, note });
    },
    watchRecord: watch,
  });
  const dispose = (await handle(IDENTITY)) ?? (() => undefined);
  return { renders, dispose };
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

test.describe('create-detail-handler 首帧与外部写入刷新', () => {
  test.beforeEach(() => {
    storedRecord = null;
    sent.length = 0;
    armed.length = 0;
    heldReplies.length = 0;
    releaseCount = 0;
    holdDbGet = false;
    onChangeHandlers.clear();
  });

  test('首帧：页面未看 + 库内无记录 ⇒ status 0，读取与订阅用同一个键', async () => {
    const { renders, dispose } = await boot({ pageStatus: 'none' });
    try {
      expect(renders).toEqual([{ status: 0, rating: 0, note: '' }]);
      expect(sent).toEqual([
        { type: 'DB_GET', payload: { storeName: 'imdb_records', key: 'movie::tt0111161' } },
      ]);
      // The refresh would otherwise listen to someone else's record.
      expect(armed).toEqual([{ storeName: 'imdb_records', key: 'movie::tt0111161' }]);
    } finally {
      dispose();
    }
  });

  test('外部写入后免重载刷新：同一 merge 得到 status 2 + 库内评分', async () => {
    const { renders, dispose } = await boot({ pageStatus: 'none' });
    try {
      storedRecord = { status: 2, rating: 9 };
      deliver();
      await flush();
      expect(renders).toHaveLength(2);
      expect(renders[1]).toMatchObject({ status: 2, rating: 9 });
    } finally {
      dispose();
    }
  });

  test('删除方向也可表达：事件后库内无记录 ⇒ 回到 status 0', async () => {
    storedRecord = { status: 2, rating: 9 };
    const { renders, dispose } = await boot({ pageStatus: 'none' });
    try {
      expect(renders[0]).toMatchObject({ status: 2, rating: 9 });
      storedRecord = null;
      deliver();
      await flush();
      expect(renders.at(-1)).toMatchObject({ status: 0, rating: 0 });
    } finally {
      dispose();
    }
  });

  test('每次事件只重读一次（不叠加读取）', async () => {
    const { dispose } = await boot({ pageStatus: 'none' });
    try {
      const before = sent.filter((m) => m.type === 'DB_GET').length;
      deliver();
      await flush();
      expect(sent.filter((m) => m.type === 'DB_GET').length).toBe(before + 1);
    } finally {
      dispose();
    }
  });

  test('路由下线后不再重绘，且释放的正是那条订阅', async () => {
    const { renders, dispose } = await boot({ pageStatus: 'none' });
    dispose();
    const before = renders.length;

    storedRecord = { status: 2, rating: 10 };
    deliver();
    await flush();
    expect(renders).toHaveLength(before);
    expect(releaseCount).toBe(1);
    expect(onChangeHandlers.size).toBe(0);
  });

  // Unsubscribing stops NEW work; this pins the in-flight case — a refresh whose
  // DB answer lands after the user already navigated away must not paint another
  // title's DOM.
  test('刷新在途时路由下线：晚到的答案不得重绘', async () => {
    const { renders, dispose } = await boot({ pageStatus: 'none' });
    const before = renders.length;

    storedRecord = { status: 2, rating: 10 };
    holdDbGet = true;
    deliver();
    await flush();
    expect(heldReplies.length).toBeGreaterThan(0); // the refresh is in flight

    dispose();
    for (const reply of heldReplies.splice(0)) reply();
    await flush();
    expect(renders).toHaveLength(before);
  });

  test('页面自己说已看时，评分取页面值（merge 规则在两条路径上同源）', async () => {
    storedRecord = { status: 0, rating: 3 };
    const { renders, dispose } = await boot({ pageStatus: 'done', pageRating: 7 });
    try {
      expect(renders[0]).toMatchObject({ status: 2, rating: 7 });
      deliver();
      await flush();
      expect(renders.at(-1)).toMatchObject({ status: 2, rating: 7 });
    } finally {
      dispose();
    }
  });
});
