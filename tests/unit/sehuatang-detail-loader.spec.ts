import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';
import { JSDOM, type DOMWindow } from 'jsdom';
import {
  createDetailLoader,
  DETAIL_FLAG,
  type CardDetail,
} from '@/scenario/sehuatang/detail-loader';

/**
 * sehuatang detail-loader behavior lock (X11-G, ADR-024 D3).
 *
 * IO-triggered batch → ONE SEHUATANG_CACHE_GET_BATCH → miss fetches the
 * detail page (DOMParser: ignore_js_op>img zoomfile/file + blockcode ol li
 * magnet) → backfill via onDetail + SEHUATANG_CACHE_PUT. Same-URL dedup,
 * ''→loading→done state machine, destroy() un-hangs pending loadNow and
 * aborts in-flight fetches, detached-card rules.
 *
 * jsdom supplies document/DOMParser; IntersectionObserver / fetch / chrome
 * are hand-stubbed. Unique tids per test — detail-cache L1 is a module
 * singleton that outlives tests inside one worker.
 */

const dom: DOMWindow = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://www.sehuatang.org/forum-2-1.html',
}).window;

initFileSandbox();
defineGlobal('window', dom);
defineGlobal('document', dom.document);
defineGlobal('navigator', dom.navigator);
defineGlobal('Node', dom.Node);
defineGlobal('Element', dom.Element);
defineGlobal('HTMLElement', dom.HTMLElement);
defineGlobal('DOMParser', dom.DOMParser);

// ---------- IntersectionObserver stub ----------
interface FakeIOEntry {
  target: Element;
  isIntersecting: boolean;
}
class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  observed = new Set<Element>();
  disconnected = false;
  lastRootMargin = '';
  private callback: (entries: FakeIOEntry[], observer: FakeIntersectionObserver) => void;
  constructor(
    callback: (entries: FakeIOEntry[], observer: FakeIntersectionObserver) => void,
    options?: { rootMargin?: string },
  ) {
    this.callback = callback;
    FakeIntersectionObserver.instances.push(this);
    this.lastRootMargin = options?.rootMargin ?? '';
  }
  observe(el: Element): void {
    this.observed.add(el);
  }
  unobserve(el: Element): void {
    this.observed.delete(el);
  }
  disconnect(): void {
    this.disconnected = true;
    this.observed.clear();
  }
  fire(entries: FakeIOEntry[]): void {
    this.callback(entries, this);
  }
}
defineGlobal('IntersectionObserver', FakeIntersectionObserver);

// ---------- fetch stub ----------
interface FetchCall {
  url: string;
  credentials?: string;
  signal?: AbortSignal;
}
let fetchCalls: FetchCall[] = [];
let fetchHtml: (url: string) => string = () => '<html></html>';
let fetchHangs = false;
let releaseHang: (() => void) | undefined;

function installFetch(): void {
  fetchCalls = [];
  fetchHtml = () => '<html></html>';
  fetchHangs = false;
  releaseHang = undefined;
  defineGlobal(
    'fetch',
    async (input: unknown, init?: { credentials?: string; signal?: AbortSignal }) => {
      const url = String(input);
      const record: FetchCall = { url, credentials: init?.credentials, signal: init?.signal };
      fetchCalls.push(record);
      const html = fetchHtml(url);
      if (fetchHangs) {
        await new Promise<void>((resolve) => {
          releaseHang = resolve;
        });
      }
      return { text: async () => html };
    },
  );
}

// ---------- chrome messaging stub ----------
interface SentMessage {
  type: string;
  payload?: unknown;
}
let sentMessages: SentMessage[] = [];
let cacheEntriesFor = (_tids: string[]): Record<string, unknown> => ({});
let slowGet = false;

function installChrome(): void {
  sentMessages = [];
  cacheEntriesFor = () => ({});
  slowGet = false;
  const runtime = {
    id: 'testextensionid',
    lastError: null as { message: string } | null,
    sendMessage: (message: SentMessage, callback: (response: unknown) => void) => {
      sentMessages.push(message);
      const respond = () => {
        if (message.type === 'SEHUATANG_CACHE_GET_BATCH') {
          const tids = (message.payload as { tids: string[] }).tids;
          callback({ success: true, data: { entries: cacheEntriesFor(tids) } });
        } else {
          callback({ success: true, data: { saved: 1 } });
        }
      };
      if (slowGet && message.type === 'SEHUATANG_CACHE_GET_BATCH') setTimeout(respond, 10);
      else respond();
    },
  };
  defineGlobal('chrome', { runtime });
}

test.beforeEach(() => {
  installFetch();
  installChrome();
  FakeIntersectionObserver.instances.length = 0;
  dom.document.body.replaceChildren();
});

function makeCard(dataUrl: string): HTMLElement {
  const card = dom.document.createElement('div');
  card.setAttribute('data-url', dataUrl);
  dom.document.body.appendChild(card);
  return card;
}

const threadUrl = (tid: string): string => `https://www.sehuatang.org/thread-${tid}-1-1.html`;

const detailPageHtml = (key: string): string => `<!doctype html><html><body>
  <ignore_js_op><img zoomfile="https://img.example/${key}.jpg" file="/fallback/${key}.jpg" /></ignore_js_op>
  <div class="blockcode"><div><ol><li>magnet:?xt=urn:btih:${key}</li></ol></div></div>
</body></html>`;

async function settle(ms = 60): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * The sync-GET → fetch handoff crosses several microtasks. A fixed sleep is
 * starved when the worker pool saturates the CPU, so wait for the observable
 * (and fail loudly if the handoff never happens) instead.
 */
async function untilFetchInFlight(): Promise<void> {
  for (let attempt = 0; attempt < 400; attempt++) {
    if (fetchCalls.length > 0 && releaseHang !== undefined) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('fetch never entered flight');
}

test.describe('detail-loader — 状态机与 watch()', () => {
  test('DETAIL_FLAG 是 data-umm-detail（跨模块读取契约）', () => {
    expect(DETAIL_FLAG).toBe('data-umm-detail');
  });

  test('watch 只观察未打标卡片；IO rootMargin 预取一屏', () => {
    const loader = createDetailLoader(() => undefined);
    const fresh = makeCard(threadUrl('900101'));
    const flagged = makeCard(threadUrl('900102'));
    flagged.setAttribute(DETAIL_FLAG, 'done');

    loader.watch(fresh);
    loader.watch(flagged);

    const io = FakeIntersectionObserver.instances[0]!;
    expect(io.observed.has(fresh)).toBe(true);
    expect(io.observed.has(flagged)).toBe(false);
    expect(io.lastRootMargin).toBe('100% 0px');
    loader.destroy();
  });

  test('IO 命中 → unobserve 相交项、不动非相交项，并触发批量加载', async () => {
    cacheEntriesFor = () => ({
      'TID-900110': { tid: 'TID-900110', imageUrl: 'I', magnetLink: 'M' },
    });
    const loader = createDetailLoader(() => undefined);
    const hit = makeCard(threadUrl('900110'));
    const passed = makeCard(threadUrl('900111'));
    loader.watch(hit);
    loader.watch(passed);

    const io = FakeIntersectionObserver.instances[0]!;
    io.fire([
      { target: hit, isIntersecting: true },
      { target: passed, isIntersecting: false },
    ]);
    await settle();

    expect(io.observed.has(hit)).toBe(false);
    expect(io.observed.has(passed)).toBe(true);
    expect(hit.getAttribute(DETAIL_FLAG)).toBe('done');
    expect(passed.getAttribute(DETAIL_FLAG)).toBeNull();
    expect(sentMessages).toEqual([
      { type: 'SEHUATANG_CACHE_GET_BATCH', payload: { tids: ['TID-900110'] } },
    ]);
    loader.destroy();
  });
});

test.describe('detail-loader — 缓存命中通道', () => {
  test('hit：单条 GET_BATCH、onDetail 只带两字段、不 fetch、loadedCount+1', async () => {
    cacheEntriesFor = () => ({
      'TID-900201': {
        tid: 'TID-900201',
        cachedAt: 1,
        imageUrl: 'https://img.example/900201.jpg',
        magnetLink: 'magnet:?xt=urn:btih:900201',
      },
    });
    const seen: Array<[HTMLElement, CardDetail]> = [];
    const loader = createDetailLoader((card, detail) => void seen.push([card, detail]));
    const card = makeCard(threadUrl('900201'));

    await loader.loadNow(card);

    expect(sentMessages).toEqual([
      { type: 'SEHUATANG_CACHE_GET_BATCH', payload: { tids: ['TID-900201'] } },
    ]);
    expect(fetchCalls).toHaveLength(0);
    expect(seen).toEqual([
      [
        card,
        { imageUrl: 'https://img.example/900201.jpg', magnetLink: 'magnet:?xt=urn:btih:900201' },
      ],
    ]);
    expect(card.getAttribute(DETAIL_FLAG)).toBe('done');
    expect(loader.loadedCount()).toBe(1);
    loader.destroy();
  });

  test('edge: data-url 非帖子形态（tid=null）→ 跳过缓存查询，直接 fetch，且不写缓存', async () => {
    fetchHtml = () => detailPageHtml('900202');
    const seen: CardDetail[] = [];
    const loader = createDetailLoader((_c, d) => void seen.push(d));
    const card = makeCard('https://www.sehuatang.org/thread-abc-not-a-tid.html');

    await loader.loadNow(card);

    expect(sentMessages.filter((m) => m.type === 'SEHUATANG_CACHE_GET_BATCH')).toHaveLength(0);
    expect(fetchCalls.map((f) => f.url)).toEqual([
      'https://www.sehuatang.org/thread-abc-not-a-tid.html',
    ]);
    expect(seen[0]?.imageUrl).toBe('https://img.example/900202.jpg');
    expect(sentMessages.filter((m) => m.type === 'SEHUATANG_CACHE_PUT')).toHaveLength(0);
    loader.destroy();
  });

  test('edge: data-url 缺失 → 不 fetch 不回调，仅置 done（copy-all 不悬死）', async () => {
    const seen: CardDetail[] = [];
    const loader = createDetailLoader((_c, d) => void seen.push(d));
    const card = makeCard('');

    await loader.loadNow(card);

    expect(fetchCalls).toHaveLength(0);
    expect(sentMessages).toHaveLength(0);
    expect(seen).toHaveLength(0);
    expect(card.getAttribute(DETAIL_FLAG)).toBe('done');
    loader.destroy();
  });
});

test.describe('detail-loader — miss → fetch → 回填 → 写缓存', () => {
  test('miss：fetch 携带 credentials+signal，zoomfile/magnet 解析并 PUT 回缓存', async () => {
    fetchHtml = () => detailPageHtml('900301');
    const seen: CardDetail[] = [];
    const loader = createDetailLoader((_c, d) => void seen.push(d));
    const card = makeCard(threadUrl('900301'));

    await loader.loadNow(card);

    expect(fetchCalls[0]?.credentials).toBe('include');
    expect(fetchCalls[0]?.signal).toBeInstanceOf(AbortSignal);
    expect(seen).toEqual([
      { imageUrl: 'https://img.example/900301.jpg', magnetLink: 'magnet:?xt=urn:btih:900301' },
    ]);
    expect(sentMessages).toContainEqual({
      type: 'SEHUATANG_CACHE_PUT',
      payload: {
        entries: [
          {
            tid: 'TID-900301',
            imageUrl: 'https://img.example/900301.jpg',
            magnetLink: 'magnet:?xt=urn:btih:900301',
          },
        ],
      },
    });
    expect(card.getAttribute(DETAIL_FLAG)).toBe('done');
    loader.destroy();
  });

  test('edge: 无 zoomfile → file 属性兜底；magnet 缺失 → null 但仍写缓存', async () => {
    fetchHtml = () =>
      '<ignore_js_op><img file="/fallback/900302.jpg" /></ignore_js_op><p>无种子</p>';
    const seen: CardDetail[] = [];
    const loader = createDetailLoader((_c, d) => void seen.push(d));
    const card = makeCard(threadUrl('900302'));

    await loader.loadNow(card);

    // getAttribute('file') 原样返回相对路径（非 img.src 解析）——现状锁定
    expect(seen[0]).toEqual({ imageUrl: '/fallback/900302.jpg', magnetLink: null });
    expect(sentMessages).toContainEqual({
      type: 'SEHUATANG_CACHE_PUT',
      payload: {
        entries: [{ tid: 'TID-900302', imageUrl: '/fallback/900302.jpg', magnetLink: null }],
      },
    });
    loader.destroy();
  });

  test('edge: 解析空页（无图无种子）→ onDetail(null,null) 且不写缓存', async () => {
    fetchHtml = () => '<html><body>nothing</body></html>';
    const seen: CardDetail[] = [];
    const loader = createDetailLoader((_c, d) => void seen.push(d));
    const card = makeCard(threadUrl('900303'));

    await loader.loadNow(card);

    expect(seen).toEqual([{ imageUrl: null, magnetLink: null }]);
    expect(sentMessages.filter((m) => m.type === 'SEHUATANG_CACHE_PUT')).toHaveLength(0);
    expect(card.getAttribute(DETAIL_FLAG)).toBe('done');
    loader.destroy();
  });

  test('edge: fetch reject → 吞错为 null/null（不冒泡），done 且 loadedCount 仍计数', async () => {
    defineGlobal('fetch', async (input: unknown) => {
      fetchCalls.push({ url: String(input) });
      throw new Error('network down');
    });
    const seen: CardDetail[] = [];
    const loader = createDetailLoader((_c, d) => void seen.push(d));
    const card = makeCard(threadUrl('900304'));

    await loader.loadNow(card); // must resolve, not reject

    expect(seen).toEqual([{ imageUrl: null, magnetLink: null }]);
    expect(card.getAttribute(DETAIL_FLAG)).toBe('done');
    expect(loader.loadedCount()).toBe(1);
    loader.destroy();
  });
});

test.describe('detail-loader — 并发归并与销毁', () => {
  test('同 URL 双卡 → 只 fetch 一次，两卡各自回填', async () => {
    fetchHtml = () => detailPageHtml('900401');
    const seen: HTMLElement[] = [];
    const loader = createDetailLoader((c) => void seen.push(c));
    const url = threadUrl('900401');
    const a = makeCard(url);
    const b = makeCard(url);

    await Promise.all([loader.loadNow(a), loader.loadNow(b)]);

    // 现状锁定：loadNow 逐卡成批 → 各自一条缓存消息（IO 相交路径才合并为一批，
    // 见上方 IO 用例）；详情页 fetch 经 loader 级 detailByUrl 归并只发一次。
    expect(sentMessages.filter((m) => m.type === 'SEHUATANG_CACHE_GET_BATCH')).toHaveLength(2);
    expect(fetchCalls.filter((f) => f.url === url)).toHaveLength(1);
    expect(seen).toHaveLength(2);
    expect(loader.loadedCount()).toBe(2);
    // 同 tid 归并后仍会各自写缓存（putCachedDetails 两次，幂等覆写）
    expect(sentMessages.filter((m) => m.type === 'SEHUATANG_CACHE_PUT')).toHaveLength(2);
    loader.destroy();
  });

  test('loadNow 幂等：在途重复调用返回同一 Promise；done 后直接 resolve', async () => {
    fetchHangs = true;
    const loader = createDetailLoader(() => undefined);
    const card = makeCard(threadUrl('900402'));

    const p1 = loader.loadNow(card);
    const p2 = loader.loadNow(card);
    expect(p2).toBe(p1); // 同一在途 Promise（inflight 表）

    await untilFetchInFlight();
    releaseHang?.(); // fetch 完成后 p1 才 resolve
    await p1;
    expect(fetchCalls).toHaveLength(1);

    await loader.loadNow(card); // done 卡片：立即 resolve，不再 fetch
    expect(fetchCalls).toHaveLength(1);
    loader.destroy();
  });

  test('destroy：在途 loadNow 立即解除挂起；IO disconnect + fetch signal abort', async () => {
    fetchHangs = true;
    const loader = createDetailLoader(() => undefined);
    const card = makeCard(threadUrl('900403'));

    const pending = loader.loadNow(card);
    await untilFetchInFlight(); // GET（同步桩）已过 → fetch 已在途
    expect(card.getAttribute(DETAIL_FLAG)).toBe('loading');
    expect(fetchCalls).toHaveLength(1);

    loader.destroy();
    await pending; // destroy 的 resolver 清算：不待 fetch 完结
    const io = FakeIntersectionObserver.instances[0]!;
    expect(io.disconnected).toBe(true);
    expect(fetchCalls[0]?.signal?.aborted).toBe(true);
    expect(card.getAttribute(DETAIL_FLAG)).toBe('loading'); // 提前 return，不再 finish

    releaseHang?.();
    await settle();
    loader.destroy(); // 幂等
  });

  test('edge: 缓存返回前卡片被摘除 → 不调 onDetail、不计 loadedCount，但 flag 置 done', async () => {
    slowGet = true; // GET 延迟 ~10ms
    cacheEntriesFor = () => ({
      'TID-900404': { tid: 'TID-900404', imageUrl: 'I', magnetLink: 'M' },
    });
    const seen: HTMLElement[] = [];
    const loader = createDetailLoader((c) => void seen.push(c));
    const card = makeCard(threadUrl('900404'));

    const pending = loader.loadNow(card);
    card.remove();
    await pending;

    expect(seen).toHaveLength(0);
    expect(loader.loadedCount()).toBe(0);
    expect(card.getAttribute(DETAIL_FLAG)).toBe('done');
    loader.destroy();
  });
});
