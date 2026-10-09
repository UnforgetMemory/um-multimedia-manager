import { test, expect } from '@playwright/test';
import type { JSDOM } from 'jsdom';
import { initFileSandbox } from './helpers/global-sandbox';
import { __bindRecordEventSinkForTests } from '@/scenario/sehuatang/app';
import { invalidateGlobalStats } from '@/scenario/sehuatang/background-reads';
import {
  FakeIntersectionObserver,
  gridOf,
  installOverlayGlobals,
  emitRecord,
  getBatchCalls,
  liveSubscribers,
  mountPage,
  type MountOptions,
  OVERLAY_ID,
  realCards,
  recordEventSink,
  resetHarnessState,
  runOverlayApp,
  settle,
  shellOf,
  threadRow,
} from './helpers/sehuatang-overlay-harness';

/**
 * 色花堂列表页 overlay 编排（scenario/sehuatang/app.ts）行为锁 · 第一组：
 * **释放 / 重入契约**。
 *
 * 钉住两条（真实运行编排入口，断言可观测的 DOM 形态与消息次数——不钉文本、
 * 不在测试里重算生产逻辑）：
 *   1. DOM 守卫兜底 = 重入清理的唯一出口：分页观察器断开、详情加载器销毁
 *      （IO disconnect）、记录事件订阅解除，释放后向（已摘除的）被观察表格
 *      追加行不再产生任何读取或 DOM 写入。
 *   2. 释放必须撤销待决的节流尾调用：断观察器/加载器/订阅并不等于释放干净。
 *
 * 其余契约（读失败语义 / 活态刷新 / 读取作用域）在
 * `sehuatang-app-orchestration-read-refresh.spec.ts`，两组共用
 * `helpers/sehuatang-overlay-harness.ts` 的挂载与消息桩。
 *
 * jsdom 陷阱（与既有 Sehuatang 渲染 spec 同款）：serial 模式防全局注入竞态；
 * `Element` 必须与被注入 window 同 realm（生产 `target instanceof Element`
 * 否则恒 false，委托监听器静默失效）；IntersectionObserver / rAF / matchMedia
 * 需手工桩。record 事件经 app.ts 的显式注入 API `__bindRecordEventSinkForTests`
 * 派发——event-bus 的 `initialized` 是 worker 级单例、跨文件不可依赖（注入先例：
 * `__bindSettingsAreaForTests`、content/handlers/javdb 的 deps.subscribeRecord）。
 */

test.describe.configure({ mode: 'serial' });

// 夹具的全局安装登记到「本文件」名下：initFileSandbox 必须早于任何安装动作，
// 否则本文件的还原钩子注册不上（afterAll 只按 chunk 触发，救不回整份文件）。
initFileSandbox();
installOverlayGlobals();

async function mount(options: MountOptions = {}): Promise<JSDOM> {
  __bindRecordEventSinkForTests(recordEventSink);
  return mountPage(options);
}

test.beforeEach(() => {
  // 夹具持模块级可变状态（读桩应答/消息计数/订阅表/IO 实例）：逐条归零。
  resetHarnessState();
});

test.afterEach(() => {
  // 注入 API 持模块级单例：每条用例结束都必须解回生产绑定。
  __bindRecordEventSinkForTests(undefined);
  invalidateGlobalStats();
});

// ---------------------------------------------------------------------------
// 1) 释放 / 重入契约
// ---------------------------------------------------------------------------

test('DOM 守卫兜底：无帖子表 → dismiss overlay，并断开上一轮遗留的观察器/加载器/订阅', async () => {
  const dom = await mount({ answer: (ids) => ids.slice(0, 1) });
  await runOverlayApp();
  const shell = shellOf(dom);
  const grid = gridOf(shell);
  const table = dom.window.document.getElementById('threadlisttableid')!;
  const mountedBefore = realCards(grid).length;
  const readsBefore = getBatchCalls().length;
  const loaderIO = FakeIntersectionObserver.instances[0];
  expect(loaderIO, '详情懒加载器必须建过 IntersectionObserver').toBeDefined();
  expect(loaderIO!.observed.size, '每张卡都纳入懒加载观察').toBe(mountedBefore);
  expect(liveSubscribers('record:updated'), '挂载后 1 个更新订阅').toBe(1);
  expect(liveSubscribers('record:deleted'), '挂载后 1 个删除订阅').toBe(1);

  // 重入到非列表页（URL 判型误覆盖时的 DOM 兜底）：释放 + dismiss。
  table.remove();
  await runOverlayApp();

  expect(dom.window.document.getElementById(OVERLAY_ID), 'overlay host 应被移除').toBeNull();
  expect(loaderIO!.disconnected, 'loader.destroy() 必须断开 IO').toBe(true);
  expect(liveSubscribers('record:updated'), '释放后更新订阅归零').toBe(0);
  expect(liveSubscribers('record:deleted'), '释放后删除订阅归零').toBe(0);

  // 释放之后向「曾被观察」的表格追加行：观察器已断 ⇒ 既不读也不写。
  table.insertAdjacentHTML('beforeend', threadRow('1003', 'ABC-777 追加丙'));
  await settle(300);
  expect(realCards(grid).length, '释放后不得再向旧网格写卡').toBe(mountedBefore);
  expect(getBatchCalls().length, '释放后不得再发已看读取').toBe(readsBefore);
  emitRecord('record:updated');
  await settle();
  expect(getBatchCalls().length, '释放后事件不得触发读取').toBe(readsBefore);
  // 待决节流尾调用的撤销在下一条用例单独钉（那是本契约曾被漏掉的一半：
  // 断观察器/加载器/订阅并不等于释放干净）。
});

test('释放必须撤销待决的节流尾调用：释放前排的队，不得在释放后读取或写卡', async () => {
  // 观察器/加载器/订阅都释放干净并不够：throttle 的尾调用定时器活在闭包里，
  // 外部拿不到 —— 释放前排进 250ms/300ms 窗口的那一次，仍会在页面已拆之后
  // 发一次已看读取并把卡写进摘除的网格。
  const dom = await mount({ answer: (ids) => ids });
  await runOverlayApp();
  const shell = shellOf(dom);
  const grid = gridOf(shell);
  const table = dom.window.document.getElementById('threadlisttableid')!;

  // 排两个队：分页 flush（第二次追加落在 250ms 尾窗口内）与记录同步（300ms）。
  table.insertAdjacentHTML('beforeend', threadRow('2001', 'AAA-111 尾调用甲'));
  await settle(5);
  table.insertAdjacentHTML('beforeend', threadRow('2002', 'BBB-222 尾调用乙'));
  emitRecord('record:updated');
  await settle(5);
  emitRecord('record:deleted');

  const readsQueued = getBatchCalls().length;
  const cardsQueued = realCards(grid).length;

  // 立刻重入到非列表页 → releasePageResources()（表已摘除）。
  table.remove();
  await runOverlayApp();
  const readsAtRelease = getBatchCalls().length;
  expect(readsAtRelease, '释放前排的尾调用不得在释放过程中就地把读取打上去').toBe(readsQueued);

  // 等过所有尾窗口（250/300/120ms 的 2 倍）。
  await settle(650);
  expect(getBatchCalls().length, '释放后不得再有已看读取').toBe(readsQueued);
  expect(realCards(grid).length, '释放后不得再向摘除的网格写卡').toBe(cardsQueued);
});
