import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';

// 全局安装必须在模块顶层登记：fullyParallel 会把一个文件拆成多个 chunk，
// 根 afterAll 按 chunk 触发而非按文件触发（isolation:check 的前提）。
initFileSandbox();

import { JSDOM } from 'jsdom';
import { PTDimmer } from '@/entrypoints/content/enhancers/pt/dimmer/index';

/**
 * 事件风暴 × 分片写入：PT 淡化器只允许「一条在途移除链」。
 *
 * 缺陷 1（record:updated 风暴 —— 批量导入 = 每条记录一个事件）：
 *   onRecordChange 每收到一个事件就
 *   ① 同步 `document.querySelectorAll('[data-umm-resolved=…]')` 全表取行，
 *   ② 直接赋值 `this.pendingClear`，**不取消**上一条在途分片链。
 *   → N 条并发的逐帧移除链 + N 次全表同步查询，分片恰好在最需要它的时刻失效。
 *
 * 本 spec 锁定的契约：
 *   1. 风暴期间全表查询与在途链各 ≤1（一轮刷新只付一次查询）；
 *   2. 被取代的旧链照常 settle（X21：取消不得留下悬挂 promise），刷新轮次不被挂起；
 *   3. 一轮 pass 覆盖风暴内全部 record key（键并集），未命中的行保持标记；
 *   4. 行为不变：bulk `*` 清全部、单键只清对应行；初始只隐藏不 dim / 运行时只 dim
 *      不隐藏、双键标记（data-umm-resolved + data-umm-mteam-resolved）契约不动。
 *
 * 夹具说明：待清除的标记行放在 `<div>`（不在 rowSelector `tbody > tr` 里），表格只留
 * 一行 colhead 表头。这样 handler.process 的分片 pass 只有 1 项（同步跑完、不占帧），
 * 手动帧队列里剩下的唯一链就是被观测的 marker 清除链。
 */

const LIST_URL = 'https://www.hddolby.com/torrents.php';
const ORIGIN = 'https://www.hddolby.com';
/** pt/dimmer/index.ts 的 clearResolvedMarkers 全表查询串（逐字匹配，避免与断言用查询混淆）。 */
const MARKER_QUERY_SELECTOR = '[data-umm-resolved="true"], [data-umm-mteam-resolved="true"]';
/** 断言用的等价选择器（不计入 spy）。 */
const MARKER_PROBE_SELECTOR = '[data-umm-mteam-resolved],[data-umm-resolved="true"]';
/** pt/dimmer/index.ts 的 CLEAR_CHUNK_SIZE（逐帧移除行数）—— 锁定值，勿与实现漂移。 */
const CLEAR_CHUNK_SIZE = 20;
const ROW_COUNT = 45;
/** 三个 record key 各自命中的行（详情 URL 带 provider id，供 haystack 匹配）。 */
const WATCHED_IDS = ['9001', '9002', '9003'];
/** pt/dimmer/index.ts 的 300ms 尾沿防抖（真实计时器，多给余量）。 */
const DEBOUNCE_MS = 300;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

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

interface Page {
  doc: Document;
  frames: ReturnType<typeof makeFrameClock>;
  /** 全表 resolved-marker 查询次数。 */
  markerQueries(): number;
  /** DB_GET_WATCHED_IDS 次数（= process 轮次）。 */
  dbQueries(): number;
  markedRows(): Element[];
}

/** ROW_COUNT 行已解决标记；行 5..7 的详情 URL 携带三个 watched id。 */
function mountMarkedRows(): Page {
  const marked = Array.from({ length: ROW_COUNT }, (_, i) => {
    const id = WATCHED_IDS[i - 5] ?? String(7000 + i);
    return `<div data-umm-mteam-resolved="true" class="umm-dimmed"><a href="${ORIGIN}/details.php?id=${id}">Title ${i}</a></div>`;
  }).join('');
  const dom = new JSDOM(
    `<!doctype html><html><body>
       <table class="torrents"><tbody><tr><td class="colhead">主题</td></tr></tbody></table>
       ${marked}
     </body></html>`,
    { url: LIST_URL },
  );
  const doc = dom.window.document;

  let markerQueries = 0;
  const nativeQueryAll = doc.querySelectorAll.bind(doc);
  // defineProperty 而非直接赋值：Document.querySelectorAll 是重载方法，单签名 spy
  // 不满足其类型；只统计与生产串逐字相同的那一次全表查询。
  Object.defineProperty(doc, 'querySelectorAll', {
    value: (selectors: string): NodeListOf<Element> => {
      if (selectors === MARKER_QUERY_SELECTOR) markerQueries++;
      return nativeQueryAll(selectors);
    },
    configurable: true,
    writable: true,
  });

  let dbQueries = 0;
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
      sendMessage: (message: { type: string }, reply?: (res: unknown) => void) => {
        if (message.type === 'DB_GET_WATCHED_IDS') {
          dbQueries++;
          reply?.({ success: true, results: { douban_records: [], imdb_records: [] } });
          return;
        }
        reply?.({ success: true });
      },
      onMessage: { addListener: () => {} },
    },
    storage: { local: { get: async () => ({}) }, onChanged: { addListener: () => {} } },
  });

  return {
    doc,
    frames,
    markerQueries: () => markerQueries,
    dbQueries: () => dbQueries,
    markedRows: () => Array.from(doc.querySelectorAll(MARKER_PROBE_SELECTOR)),
  };
}

function rowByProviderId(doc: Document, id: string): Element | null {
  return doc.querySelector(`a[href$="id=${id}"]`);
}

/**
 * 直接驱动 record 事件处理器，而不是真总线：`event-bus` 的 `initialized` 是模块级
 * 单例，共享 worker 里谁先 `initEventBus()` 就把监听器挂在谁的 chrome 桩上
 * （同 watch-record.spec.ts 的取舍）。被锁契约从 onRecordChange 起成立。
 */
function fireRecordChange(dimmer: PTDimmer, storeName: string, key: string): void {
  (dimmer as unknown as { onRecordChange(data: unknown): void }).onRecordChange({
    storeName,
    key,
  });
}

/** 匹配行（haystack 含 key 的 provider id）。 */
function watchedRows(page: Page): Element[] {
  return WATCHED_IDS.map((id) => rowByProviderId(page.doc, id)!.parentElement!).filter(
    (el) => el !== null,
  );
}

test.describe('PTDimmer record 事件风暴 — 至多一条在途分片链', () => {
  test('连发 3 个不同 key：风暴内查询/在途链各 ≤1，一轮 pass 覆盖全部键', async () => {
    const page = mountMarkedRows();
    const dimmer = new PTDimmer();
    await dimmer.runFor(LIST_URL);

    expect(page.markedRows()).toHaveLength(ROW_COUNT);
    expect(page.markerQueries(), '初始化轮不做 marker 全表查询').toBe(0);
    expect(page.frames.pendingFrames()).toBe(0);
    const roundsAfterInit = page.dbQueries();

    for (const id of WATCHED_IDS) fireRecordChange(dimmer, 'douban_records', `movie::${id}`);

    // 缺陷 1：旧实现在这里已留下 3 条并发链 + 3 次全表同步查询。
    expect(page.frames.pendingFrames(), '风暴期间至多一条在途分片链').toBeLessThanOrEqual(1);
    expect(page.markerQueries(), '风暴期间不得逐事件重扫全表').toBeLessThanOrEqual(1);

    await sleep(DEBOUNCE_MS + 100);
    expect(page.markerQueries(), '一轮刷新只付一次全表查询').toBe(1);
    expect(page.frames.pendingFrames(), '在途链仍只有一条').toBe(1);

    page.frames.drain();
    await sleep(50);

    expect(page.frames.pendingFrames()).toBe(0);
    // 单键并集：一轮 pass 清掉三个 key 各自的行，其余行保持已解决。
    for (const row of watchedRows(page)) {
      expect(row.hasAttribute('data-umm-mteam-resolved'), '命中行应被清标').toBe(false);
    }
    expect(
      rowByProviderId(page.doc, '7020')?.parentElement?.hasAttribute('data-umm-mteam-resolved'),
    ).toBe(true);
    expect(page.markedRows()).toHaveLength(ROW_COUNT - WATCHED_IDS.length);
    expect(page.dbQueries(), '清除链跑完后必须进入 process').toBe(roundsAfterInit + 1);

    dimmer.cleanup();
  });

  test('两轮之间取消在途 pass：旧链 promise 仍 settle，刷新轮次不挂起', async () => {
    const page = mountMarkedRows();
    const dimmer = new PTDimmer();
    await dimmer.runFor(LIST_URL);
    const roundsAfterInit = page.dbQueries();

    fireRecordChange(dimmer, 'douban_records', '*');
    await sleep(DEBOUNCE_MS + 100);
    // 第一轮启动 pass1（首块同步、余下占一帧），帧未推进 → pass1 在途。
    expect(page.frames.pendingFrames()).toBe(1);
    expect(page.markedRows()).toHaveLength(ROW_COUNT - CLEAR_CHUNK_SIZE);
    expect(page.dbQueries(), 'pass 未跑完前不得进入 process').toBe(roundsAfterInit);

    fireRecordChange(dimmer, 'imdb_records', '*');
    await sleep(DEBOUNCE_MS + 100);
    // 第二轮必须取代 pass1（撤掉其排队帧）再启动 pass2 —— 仍只有一条链。
    expect(page.frames.pendingFrames(), '取消后不得并存两条在途清除链').toBe(1);

    page.frames.drain();
    await sleep(50);

    // X21 契约：被取消的 pass 也必须 settle，否则 runActiveProcess 的 await 永久悬挂，
    // 两轮 process 都不会发生。
    expect(page.dbQueries(), '两轮都要走到 process').toBe(roundsAfterInit + 2);
    expect(page.markedRows()).toHaveLength(0);

    dimmer.cleanup();
  });

  test('风暴键数超过帧预算上限 → 塌缩为 bulk `*`，仍是一条链一次查询', async () => {
    const page = mountMarkedRows();
    const dimmer = new PTDimmer();
    await dimmer.runFor(LIST_URL);

    // 9 个不同 key（> BULK_CLEAR_KEY_THRESHOLD=8）：逐键判定会超出单帧预算，
    // 与批量导入同形 → 塌缩成整页 bulk 清除。
    for (let i = 0; i < 9; i++) {
      fireRecordChange(dimmer, 'douban_records', `movie::${7010 + i}`);
    }
    expect(page.frames.pendingFrames(), '塌缩不得多出在途链').toBeLessThanOrEqual(1);
    expect(page.markerQueries(), '塌缩不得多出全表查询').toBeLessThanOrEqual(1);

    await sleep(DEBOUNCE_MS + 100);
    page.frames.drain();
    await sleep(50);

    expect(page.markerQueries()).toBe(1);
    expect(page.markedRows(), 'bulk 语义：整页 resolved 行都被清，等待重评估').toHaveLength(0);

    dimmer.cleanup();
  });

  test('单个事件行为不变：bulk 事件清全部行，仍按 CLEAR_CHUNK_SIZE 分帧', async () => {
    const page = mountMarkedRows();
    const dimmer = new PTDimmer();
    await dimmer.runFor(LIST_URL);
    const roundsAfterInit = page.dbQueries();

    fireRecordChange(dimmer, 'douban_records', '*');
    await sleep(DEBOUNCE_MS + 100);

    // 首块在调用帧内同步完成，其余逐帧 —— 与同步版行为一致，只是调度不同。
    expect(page.markedRows()).toHaveLength(ROW_COUNT - CLEAR_CHUNK_SIZE);
    expect(page.frames.pendingFrames()).toBe(1);
    page.frames.drain();
    await sleep(50);

    expect(page.markedRows()).toHaveLength(0);
    expect(page.dbQueries()).toBe(roundsAfterInit + 1);

    dimmer.cleanup();
  });
});
