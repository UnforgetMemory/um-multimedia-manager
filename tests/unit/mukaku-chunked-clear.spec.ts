import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';

// 模块顶层登记 sandbox：fullyParallel 下根 afterAll 按 chunk 触发，
// 且 isolation:check 要求全局安装可归属到本文件（见 helpers/global-sandbox）。
initFileSandbox();

import { JSDOM } from 'jsdom';
import { MukakuHandler } from '@/entrypoints/content/handlers/mukaku/handler';
import { clearProcessedMarkers } from '@/entrypoints/content/handlers/mukaku/refresh';

/**
 * 事件风暴 × 分片写入：Mukaku 的 processed-marker 全表清除。
 *
 * 缺陷 2：handler.onRecordChange → `clearProcessedMarkers(document)` 是一次同步、
 * 不分片的整文档 `querySelectorAll(...).forEach(remove)`，且发生在防抖之外。与 PT 侧
 * X9-B 已分片的 mteam/nexusphp/bulk-clear 同形：浏览页上百张 `.video-card` 时，批量
 * 导入产生的逐条 record 事件会连着付 N 次整表长任务。
 *
 * 本 spec 锁定的契约：
 *   1. 清除按帧分片：N 行产生 ≥2 个批次（首块同步 ≤ CLEAR_CHUNK_SIZE 行，其余逐帧）；
 *   2. 返回的 run 一定 settle（await 不悬挂）；
 *   3. 事件风暴期间至多一条在途链，一轮刷新只付一次全表查询；
 *   4. 刷新轮次在清除链跑完后才 rescan（`.video-card` 查询计数即「跑到了」的观测点）。
 */

const SITE_URL = 'https://www.mukaku.com/';
/** 生产全表选择器（逐字匹配，断言用的观测查询走原生句柄，不计数）。 */
const MARKER_SELECTOR = '[data-umm-mukaku-processed="true"]';
/** processVisibleCards → collectVisibleCards 的扫描选择器。 */
const SCAN_SELECTOR = '.video-card';
/** mukaku/refresh.ts 的分片大小（与 PT 侧同基准：20 行/帧）。 */
const CLEAR_CHUNK_SIZE = 20;
const CARD_COUNT = 45;
/** handler.ts 的 300ms 尾沿防抖（真实计时器，多给余量）。 */
const DEBOUNCE_MS = 300;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** 可注入的「帧」时钟：一次 schedule = 一帧，tick 驱动下一帧。 */
function makeClock() {
  const queue: (() => void)[] = [];
  return {
    schedule(task: () => void): () => void {
      queue.push(task);
      return () => {
        const i = queue.indexOf(task);
        if (i >= 0) queue.splice(i, 1);
      };
    },
    tick(): void {
      queue.shift()?.();
    },
    pendingFrames(): number {
      return queue.length;
    },
  };
}

/** 手动驱动的 rAF 队列：pendingFrames() 即「在途分片链」条数。 */
function makeFrameClock() {
  const queue: Array<{ id: number; task: () => void }> = [];
  let nextId = 1;
  return {
    requestAnimationFrame(task: () => void): number {
      const id = nextId++;
      queue.push({ id, task });
      return id;
    },
    cancelAnimationFrame(id: number): void {
      const i = queue.findIndex((frame) => frame.id === id);
      if (i >= 0) queue.splice(i, 1);
    },
    pendingFrames(): number {
      return queue.length;
    },
    drain(): void {
      while (queue.length > 0) queue.shift()!.task();
    },
  };
}

// ——— 纯函数层（注入 schedule 手动驱动帧）———

interface FakeCard {
  attrs: Set<string>;
  classes: Set<string>;
  removeAttribute(name: string): void;
  classList: { remove(className: string): void };
}

function makeCards(count: number): FakeCard[] {
  return Array.from({ length: count }, () => {
    // classList.remove 被脱离元素调用（forEach(clearMukakuMarkers)）→ 用闭包而非 this。
    const attrs = new Set(['data-umm-mukaku-processed']);
    const classes = new Set(['umm-dimmed']);
    return {
      attrs,
      classes,
      removeAttribute: (name: string) => {
        attrs.delete(name);
      },
      classList: {
        remove: (className: string) => {
          classes.delete(className);
        },
      },
    };
  });
}

function clearedCount(cards: FakeCard[]): number {
  return cards.filter((card) => !card.attrs.has('data-umm-mukaku-processed')).length;
}

function fakeRoot(cards: FakeCard[]): Pick<Document, 'querySelectorAll'> {
  return {
    querySelectorAll: (selectors: string) => {
      expect(selectors).toBe(MARKER_SELECTOR);
      return cards as unknown as Element[];
    },
  } as unknown as Pick<Document, 'querySelectorAll'>;
}

test.describe('clearProcessedMarkers 分片契约', () => {
  test('45 行 → 首块同步 ≤20，其余每帧一块，promise 照常 settle', async () => {
    const cards = makeCards(CARD_COUNT);
    const clock = makeClock();

    const run = clearProcessedMarkers(fakeRoot(cards), { schedule: clock.schedule });

    // 缺陷 2：旧实现一次同步清完 45 行（宿主页面长任务），没有帧间批次。
    expect(clearedCount(cards), '一帧内不得写完整表').toBe(CLEAR_CHUNK_SIZE);
    expect(clock.pendingFrames(), '45 行必须产生 ≥2 个批次').toBe(1);

    clock.tick();
    expect(clearedCount(cards)).toBe(CLEAR_CHUNK_SIZE * 2);
    clock.tick();
    expect(clearedCount(cards)).toBe(CARD_COUNT);

    await run.promise;
    expect(clock.pendingFrames()).toBe(0);
    // 与同步版行为一致：标记与 umm-dimmed 类同时撤下（重评估 + 取消变暗）。
    for (const card of cards) {
      expect(card.attrs.has('data-umm-mukaku-processed')).toBe(false);
      expect(card.classes.has('umm-dimmed')).toBe(false);
    }
  });

  test('空表立即 settle，不排帧', async () => {
    const clock = makeClock();
    const run = clearProcessedMarkers(fakeRoot([]), { schedule: clock.schedule });
    await run.promise;
    expect(clock.pendingFrames()).toBe(0);
  });
});

// ——— 处理器层（真实 jsdom 卡片 + 手动帧队列）———

interface Page {
  doc: Document;
  frames: ReturnType<typeof makeFrameClock>;
  markerQueries(): number;
  scans(): number;
  markedCards(): Element[];
  allCards(): Element[];
}

/**
 * 45 张搜索页形态卡（div.video-card，无 /mv/ 链接）→ 重扫落入 noIdCards 分支，
 * 页面 URL 无 sb 参数 → 列表 API 提前返回，整轮 rescan 不发任何网络请求；
 * `.video-card` 全表查询次数即「刷新轮次跑到扫描」的观测点。
 */
function mountCards(): Page {
  const cards = Array.from(
    { length: CARD_COUNT },
    (_, i) =>
      `<div class="video-card umm-dimmed" data-umm-mukaku-processed="true"><a href="/actor/a${i}">片名 ${i}</a></div>`,
  ).join('');
  const dom = new JSDOM(
    `<!doctype html><html><body><div class="list">${cards}</div></body></html>`,
    { url: SITE_URL },
  );
  const doc = dom.window.document;

  let markerQueries = 0;
  let scans = 0;
  const nativeQueryAll = doc.querySelectorAll.bind(doc);
  // defineProperty 而非直接赋值：Document.querySelectorAll 是重载方法，单签名 spy
  // 不满足其类型。只统计与生产串逐字相同的调用。
  Object.defineProperty(doc, 'querySelectorAll', {
    value: (selectors: string): NodeListOf<Element> => {
      if (selectors === MARKER_SELECTOR) markerQueries++;
      if (selectors === SCAN_SELECTOR) scans++;
      return nativeQueryAll(selectors);
    },
    configurable: true,
    writable: true,
  });

  const frames = makeFrameClock();
  defineGlobal('document', doc);
  defineGlobal('window', dom.window);
  defineGlobal('location', dom.window.location);
  defineGlobal('MutationObserver', dom.window.MutationObserver);
  defineGlobal('requestAnimationFrame', frames.requestAnimationFrame);
  defineGlobal('cancelAnimationFrame', frames.cancelAnimationFrame);
  defineGlobal('chrome', {
    runtime: {
      id: 'test-extension',
      lastError: undefined,
      sendMessage: (_message: { type: string }, reply?: (res: unknown) => void) => {
        reply?.({ success: true });
      },
      onMessage: { addListener: () => {} },
    },
    storage: {
      local: { get: async () => ({}), set: async () => {} },
      onChanged: { addListener: () => {} },
    },
  });

  return {
    doc,
    frames,
    markerQueries: () => markerQueries,
    scans: () => scans,
    markedCards: () => Array.from(nativeQueryAll(MARKER_SELECTOR)),
    allCards: () => Array.from(nativeQueryAll(SCAN_SELECTOR)),
  };
}

/**
 * 直连事件处理器：`event-bus` 的 `initialized` 是模块级单例，共享 worker 下先
 * initEventBus 的文件会把监听器绑在自己的 chrome 桩上（同 watch-record.spec.ts）。
 */
function fireRecordChange(handler: MukakuHandler, storeName: string, key: string): void {
  (handler as unknown as { onRecordChange(data: unknown): void }).onRecordChange({
    storeName,
    key,
  });
}

test.describe('MukakuHandler record 事件风暴 — 至多一条在途清除链', () => {
  test('连发 3 个事件：风暴内查询/在途链各 ≤1，一轮只付一次全表查询', async () => {
    const page = mountCards();
    const handler = new MukakuHandler();
    handler.activate();
    expect(page.markedCards()).toHaveLength(CARD_COUNT);

    for (const id of ['9001', '9002', '9003']) {
      fireRecordChange(handler, 'douban_records', `movie::${id}`);
    }

    // 缺陷 2：旧实现在这里已经同步整表清了 3 次。
    expect(page.markerQueries(), '风暴期间不得逐事件整表清除').toBeLessThanOrEqual(1);
    expect(page.frames.pendingFrames(), '至多一条在途分片链').toBeLessThanOrEqual(1);

    await sleep(DEBOUNCE_MS + 100);
    expect(page.markerQueries(), '一轮刷新只付一次全表查询').toBe(1);
    expect(page.frames.pendingFrames(), '清除链按帧分批，仍在途').toBe(1);
    expect(page.scans(), '清除链跑完前不得 rescan').toBe(0);

    page.frames.drain();
    await sleep(50);

    expect(page.frames.pendingFrames()).toBe(0);
    expect(page.markedCards()).toHaveLength(0);
    expect(page.scans(), '清除链 settle 后刷新轮次完成 rescan').toBe(1);
    for (const card of page.allCards()) {
      expect(card.classList.contains('umm-dimmed'), '清除同时撤下 dim 类').toBe(false);
    }

    handler.cleanup();
  });

  test('第二轮取代在途链：旧链 promise 仍 settle，两轮都完成刷新', async () => {
    const page = mountCards();
    const handler = new MukakuHandler();
    handler.activate();

    fireRecordChange(handler, 'douban_records', '*');
    await sleep(DEBOUNCE_MS + 100);
    expect(page.frames.pendingFrames(), '首块同步、余下逐帧').toBe(1);
    expect(page.markedCards()).toHaveLength(CARD_COUNT - CLEAR_CHUNK_SIZE);

    fireRecordChange(handler, 'imdb_records', '*');
    await sleep(DEBOUNCE_MS + 100);
    expect(page.frames.pendingFrames(), '不得并存两条清除链').toBe(1);

    page.frames.drain();
    await sleep(100);

    expect(page.frames.pendingFrames()).toBe(0);
    expect(page.markedCards()).toHaveLength(0);
    expect(page.scans(), '两轮都要走到 rescan（被取代的链不得悬挂）').toBe(2);

    handler.cleanup();
  });
});
