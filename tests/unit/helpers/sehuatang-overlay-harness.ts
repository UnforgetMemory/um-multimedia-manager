/**
 * 色花堂列表页 overlay 编排测试的共享夹具（自 sehuatang-app-orchestration.spec 拆出）。
 *
 * 拆出动机：编排契约分两组（释放/重入 · 读失败/活态刷新/读取作用域），两组
 * 共用同一套 jsdom 挂载 + 后台消息桩 + 记录事件通道。夹具因此住在这里，
 * 两个 spec 各自 `initFileSandbox()` 后调用本模块的安装函数——
 * `defineGlobal` 把每次安装登记到「调用栈上最近的 .spec 文件」，所以
 * IntersectionObserver 这类全局必须由**每个 spec 自己**在模块顶层装一次，
 * 绝不能在模块加载时装（那只会登记到第一个导入它的文件，它 afterAll 一还原
 * 就把还在跑的后一个文件踩空）。
 *
 * 同理，夹具持有的可变状态（读桩应答/计数/订阅表/观察器实例）都是模块级单例：
 * 每个 spec 都必须在 `beforeEach` 调 `resetHarnessState()`，否则文件内的用例
 * 顺序一变就读到上一条用例的残留。
 */

import { expect } from '@playwright/test';
import { JSDOM } from 'jsdom';
import { defineGlobal } from './global-sandbox';
import { STORAGE_KEYS } from '@/libraries/config';
import { invalidateGlobalStats } from '@/scenario/sehuatang/background-reads';
import { runSehuatangOverlayApp } from '@/scenario/sehuatang/app';
import type { EventType } from '@/libraries/utils/event-bus';

export const OVERLAY_ID = 'umm-sht-overlay';
const LIST_URL = 'https://www.sehuatang.net/forum-91-1.html';

// ---------------------------------------------------------------------------
// IntersectionObserver 桩：编排只用得到「建了 IO / 观察了几张卡 / 是否断开」。
// ---------------------------------------------------------------------------

type IOCallback = (
  entries: Array<{ target: Element; isIntersecting: boolean }>,
  observer: FakeIntersectionObserver,
) => void;

export class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  observed = new Set<Element>();
  disconnected = false;
  callback: IOCallback;

  constructor(callback: IOCallback, _options?: { root?: Element | null; rootMargin?: string }) {
    this.callback = callback;
    FakeIntersectionObserver.instances.push(this);
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
}

/** 每个 spec 在模块顶层（initFileSandbox 之后）调用，使安装登记到本文件名下。 */
export function installOverlayGlobals(): void {
  defineGlobal('IntersectionObserver', FakeIntersectionObserver);
}

// ---------------------------------------------------------------------------
// 帖子行夹具（Discuz forumdisplay 实态：th > a.s.xst 标题、td.by em span 日期）
// ---------------------------------------------------------------------------

export function threadRow(tid: string, title: string): string {
  return `
    <tbody id="normalthread_${tid}">
      <tr>
        <td class="num"><span>1</span></td>
        <th class="common">
          <a href="forum.php?mod=viewthread&tid=${tid}" class="s xst">${title}</a>
        </th>
        <td class="by"><cite><span>作者甲</span></cite><em><span>2026-09-01 10:00</span></em></td>
      </tr>
    </tbody>`;
}

/** 默认两行：一行有番号（SSIS-001），一行提不出番号（只剩 TID 兜底键）。 */
export const DEFAULT_ROWS =
  threadRow('1001', 'SSIS-001 标题甲') + threadRow('1002', '原创合集 第三篇');

function listFixture(rows: string): string {
  return `
    <div id="pt"><div class="z"><a href="forum.php">色花堂</a> &gt; <a href="forum-91-1.html">日系</a></div></div>
    <div id="thread_types" class="cl"><ul><li class="a"><a href="forum-91-1.html">全部</a></li></ul></div>
    <table id="threadlisttableid" summary="mode=threadlist">
      <tbody class="header"><tr><th>主题</th></tr></tbody>
      ${rows}
    </table>
    <div class="pgs mbw cl"><div id="fd_page_bottom"><div class="pg"><strong>1</strong><a href="forum-91-2.html">2</a></div></div></div>`;
}

// ---------------------------------------------------------------------------
// 后台读取桩（消息级：批量已看检查 + 全局三段统计 + 写趟计数）
// ---------------------------------------------------------------------------

export interface ReadState {
  hideViewed: boolean;
  /** 批量已看检查的命中集生成（入参 = 本次查询的键集）。 */
  answer: (ids: string[]) => string[];
  /** 前 N 次批量读给坏答案（梯子必须重发才拿得到真答案）。 */
  batchFailures: number;
  /** 批量读整条梯子都无答案。 */
  batchDead: boolean;
  /** 首次批量读挂起不答（断言「渲染先于答案」）。 */
  batchHangs: boolean;
  /** 全局统计读整条梯子都无答案。 */
  statsDead: boolean;
}

const defaults = (): ReadState => ({
  hideViewed: false,
  answer: () => [],
  batchFailures: 0,
  batchDead: false,
  batchHangs: false,
  statsDead: false,
});

// 单一稳定对象：用例中途改的是它的字段（setReadState），reset 就地覆盖回默认，
// 因此不存在「拿着上一条用例的旧引用改状态」的串扰。
const state: ReadState = defaults();
let batchKeys: string[][] = [];
let statsReads = 0;
let writes: string[] = [];
let heldBatch: ((response: unknown) => void) | null = null;

/** 覆盖读桩行为（用例中段改答案/改失败模式用）。 */
export function setReadState(overrides: Partial<ReadState>): void {
  Object.assign(state, overrides);
}

/** 清空夹具状态（每个 spec 的 beforeEach 必调；模块级单例不自愈）。 */
export function resetHarnessState(): void {
  Object.assign(state, defaults());
  batchKeys = [];
  statsReads = 0;
  writes = [];
  heldBatch = null;
  sinks.clear();
  FakeIntersectionObserver.instances.length = 0;
}

export function getBatchCalls(): string[][] {
  return batchKeys;
}

export function getStatsCallCount(): number {
  return statsReads;
}

export function getWriteCalls(): string[] {
  return writes;
}

/** 挂起未答的首次批量读回调（断言「渲染先于答案」的用例手动放行）。 */
export function getPendingBatch(): ((response: unknown) => void) | null {
  return heldBatch;
}

function pickStored(keys: string | string[] | null): Record<string, unknown> {
  const wanted = keys === null ? [] : Array.isArray(keys) ? keys : [keys];
  const out: Record<string, unknown> = {};
  for (const key of wanted) {
    if (key === STORAGE_KEYS.LANGUAGE) out[key] = 'zh-CN';
    else if (key === STORAGE_KEYS.SEHUATANG_HIDE_VIEWED) out[key] = state.hideViewed;
  }
  return out;
}

function installChrome(): void {
  defineGlobal('chrome', {
    storage: {
      local: {
        get: async (keys: string | string[] | null) => pickStored(keys),
        set: async () => undefined,
        remove: async () => undefined,
      },
    },
    runtime: {
      id: 'umm-test-ext',
      lastError: null,
      sendMessage: (
        message: { type: string; payload?: unknown },
        callback: (response: unknown) => void,
      ) => {
        if (message.type === 'ADULT_AV_CHECK_BATCH') {
          const ids = (message.payload as { ids: string[] }).ids;
          batchKeys.push(ids);
          if (state.batchHangs && heldBatch === null) {
            heldBatch = callback;
            return;
          }
          if (state.batchDead || state.batchFailures > 0) {
            if (state.batchFailures > 0) state.batchFailures -= 1;
            callback({ success: false, error: 'service-worker-asleep' });
            return;
          }
          callback({ success: true, watched: state.answer(ids) });
          return;
        }
        if (message.type === 'ADULT_AV_STATS') {
          statsReads += 1;
          if (state.statsDead) {
            callback({ success: false, error: 'service-worker-asleep' });
            return;
          }
          callback({ success: true, jp: 100, us: 20, tid: 7 });
          return;
        }
        if (
          message.type.startsWith('ADULT_AV_ADD') ||
          message.type.startsWith('ADULT_AV_BATCH_ADD')
        ) {
          writes.push(message.type);
        }
        callback({ success: true });
      },
      onMessage: { addListener: (): void => undefined },
    },
  });
}

// ---------------------------------------------------------------------------
// 记录事件通道（spec 自行绑到 app.ts 的注入缝 `__bindRecordEventSinkForTests`；
// 解绑留在 spec 的 afterEach —— 那是模块级单例，绑定跨文件即泄漏）。
// ---------------------------------------------------------------------------

export type RecordEvent = 'record:updated' | 'record:deleted';
const sinks = new Map<string, Set<() => void>>();

export function recordEventSink(event: EventType, cb: () => void): () => void {
  const set = sinks.get(event) ?? new Set<() => void>();
  set.add(cb);
  sinks.set(event, set);
  return () => {
    set.delete(cb);
  };
}

export function emitRecord(event: RecordEvent): void {
  for (const cb of Array.from(sinks.get(event) ?? [])) cb();
}

export function liveSubscribers(event: RecordEvent): number {
  return (sinks.get(event) ?? new Set<() => void>()).size;
}

// ---------------------------------------------------------------------------
// 挂载（早期入口建的 shadow host + 帖子表；全局注入走 sandbox 以便跨文件还原）
// ---------------------------------------------------------------------------

export interface MountOptions extends Partial<ReadState> {
  rows?: string;
}

export async function mountPage(options: MountOptions = {}): Promise<JSDOM> {
  const { rows = DEFAULT_ROWS, ...readOverrides } = options;
  resetHarnessState();
  setReadState(readOverrides);
  // 三段统计缓存在 worker 内是模块单例：上一轮的暖缓存会让本页零消息，
  // 从而让「读了/没读」的断言失真。每页开头强制失效。
  invalidateGlobalStats();

  const dom = new JSDOM(`<!DOCTYPE html><html><body>${listFixture(rows)}</body></html>`, {
    url: LIST_URL,
  });
  const win = dom.window;
  // jsdom 未实现 matchMedia（overlay.ts 的主题探测消费 .matches）——恒 light。
  win.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addListener: (): void => undefined,
    removeListener: (): void => undefined,
  })) as unknown as Window['matchMedia'];

  defineGlobal('window', win);
  defineGlobal('document', win.document);
  defineGlobal('location', win.location);
  defineGlobal('navigator', win.navigator);
  defineGlobal('Node', win.Node);
  defineGlobal('Element', win.Element);
  defineGlobal('HTMLElement', win.HTMLElement);
  defineGlobal('SVGElement', win.SVGElement);
  defineGlobal('MutationObserver', win.MutationObserver);
  defineGlobal('sessionStorage', win.sessionStorage);
  defineGlobal('requestAnimationFrame', (cb: (time: number) => void) => setTimeout(() => cb(0), 0));
  installChrome();

  // 早期入口（document_start）建壳 + open shadow root；main 入口接管挂载。
  const host = win.document.createElement('div');
  host.id = OVERLAY_ID;
  win.document.body.appendChild(host);
  host.attachShadow({ mode: 'open' });
  FakeIntersectionObserver.instances.length = 0;
  return dom;
}

/** 绑定 app.ts 的记录事件注入缝（每个 spec 自己调用，便于隔离闸看见解绑配对）。 */

// ---------------------------------------------------------------------------
// 观测助手（DOM 形态 + 计时）
// ---------------------------------------------------------------------------

export function shellOf(dom: JSDOM): HTMLElement {
  const shell = dom.window.document
    .getElementById(OVERLAY_ID)
    ?.shadowRoot?.querySelector('.umm-sht-shell');
  expect(shell, 'overlay 内应有 .umm-sht-shell 内容根').not.toBeNull();
  return shell as HTMLElement;
}

export function gridOf(shell: HTMLElement): HTMLElement {
  const grid = shell.querySelector('.umm-preview-grid');
  expect(grid, 'shell 内应有 .umm-preview-grid').not.toBeNull();
  return grid as HTMLElement;
}

/** 真卡（骨架卡 .umm-sht-skel 是检查期占位，不是条目）。 */
export function realCards(grid: HTMLElement): HTMLElement[] {
  return Array.from(grid.querySelectorAll('.umm-card:not(.umm-sht-skel)')) as HTMLElement[];
}

export function pageBox(shell: HTMLElement): string {
  return (shell.querySelector('.umm-header-info') as HTMLElement).textContent ?? '';
}

export function globalBox(shell: HTMLElement): string {
  return (shell.querySelector('.umm-sht-stats') as HTMLElement).textContent ?? '';
}

export const settle = (ms = 30): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** 等一整条失败梯子走完（3 档尝试 + 400/1200ms 退避）。 */
export const settleDeadLadder = (): Promise<void> => settle(1700);

/**
 * 跑完整条编排，并把统计节流（模块级 throttle，`last` 跨用例存活）的 120ms
 * 尾调用窗口等掉——不等就会让「头部数字」断言踩在「挂在尾调用里」与「已落地」
 * 之间的竞态上（同一条用例时好时坏）。
 */
export async function runOverlayApp(): Promise<void> {
  await runSehuatangOverlayApp();
  await settle(180);
}
