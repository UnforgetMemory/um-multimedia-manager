import { test, expect } from '@playwright/test';
import type { JSDOM } from 'jsdom';
import { initFileSandbox } from './helpers/global-sandbox';
// 渲染文案来自内容脚本 i18n 字典（locale 是 worker 级共享状态）——期望值走同一个
// t() 而不是钉中文。
import { t } from '@/entrypoints/content/i18n';
import { __bindRecordEventSinkForTests, runSehuatangOverlayApp } from '@/scenario/sehuatang/app';
import { __bindErrorNotifierForTests } from '@/scenario/sehuatang/app-notify';
import { invalidateGlobalStats } from '@/scenario/sehuatang/background-reads';
import {
  emitRecord,
  getBatchCalls,
  getPendingBatch,
  getStatsCallCount,
  getWriteCalls,
  globalBox,
  gridOf,
  installOverlayGlobals,
  mountPage,
  type MountOptions,
  pageBox,
  realCards,
  recordEventSink,
  resetHarnessState,
  runOverlayApp,
  settle,
  settleDeadLadder,
  setReadState,
  shellOf,
  threadRow,
} from './helpers/sehuatang-overlay-harness';

/**
 * 色花堂列表页 overlay 编排（scenario/sehuatang/app.ts）行为锁 · 第二组：
 * **读失败语义 + 活态刷新 + 读取作用域**（释放/重入契约在
 * `sehuatang-app-orchestration.spec.ts`；两组共用
 * `helpers/sehuatang-overlay-harness.ts` 的挂载与消息桩）。
 *
 * 钉住的三类契约（真实运行编排入口，断言可观测的 DOM 形态与消息次数——不钉
 * 文本、不在测试里重算生产逻辑）：
 *   1. **读失败 ≠ 空答案**（X26-D / X70 纪律）：hide ON 时坏答案不隐藏条目、
 *      不挂「全部已看过」空态、全局三段渲染为破折号（假 0 会被读成结论），后台
 *      不可达每页只说一次；一次坏答案后梯子必须重发并采纳真答案。
 *   2. **活态刷新**：record:updated / record:deleted 对**现有节点**重判 dim
 *      （零重建、元素引用不变）、番号 + TID 双键任一命中即已看、点击跳转的
 *      视觉标记只被 updated 豁免、统计缓存随事件失效重取。
 *   3. **读取作用域**：AJAX 分页增量只读新行的键（旧行不重扫）；无可解析行 /
 *      零行页面不产生任何已看读取，也不误挂空态。
 *
 * 「后台不可达」的呈现出口断言走 app-notify 的注入缝 `__bindErrorNotifierForTests`
 * ——不去数 FloatingToast 自己的 DOM：该模块把容器缓在「本 worker 里第一个把
 * document 装成全局的模块」上，跨 spec 读它的 DOM 在共享 worker 下随文件分派
 * 顺序时好时坏（单跑绿、合跑红）。注入缝是模块级单例，故 afterEach 必须解绑。
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

/** 「后台不可达」呈现出口的记录（(message, error) 对）；模块级数组，逐条归零。 */
const errorReports: Array<{ message: string; error: unknown }> = [];

async function mount(options: MountOptions = {}): Promise<JSDOM> {
  __bindRecordEventSinkForTests(recordEventSink);
  return mountPage(options);
}

test.beforeEach(() => {
  // 夹具持模块级可变状态（读桩应答/消息计数/订阅表/IO 实例）：逐条归零。
  resetHarnessState();
  errorReports.length = 0;
  __bindErrorNotifierForTests((message, error) => {
    errorReports.push({ message, error });
  });
});

test.afterEach(() => {
  // 两个注入 API 都持模块级单例：每条用例结束都必须解回生产绑定，
  // 否则绑定活到同 worker 的后一个文件（隔离闸按第五条泄漏通道计数）。
  __bindRecordEventSinkForTests(undefined);
  __bindErrorNotifierForTests(undefined);
  invalidateGlobalStats();
});

// ---------------------------------------------------------------------------
// 2) 首屏不被消息阻塞 + 读失败语义 + 读取作用域
// ---------------------------------------------------------------------------

test('hide OFF：真卡先渲染（已看检查仍在途），答案到达后一次性落 dim', async () => {
  const dom = await mount({ batchHangs: true });
  const appRun = runSehuatangOverlayApp();
  await settle(40);

  const shell = shellOf(dom);
  const grid = gridOf(shell);
  expect(realCards(grid), '首屏不得等消息/DB').toHaveLength(2);
  expect(grid.querySelectorAll('.umm-sht-skel'), 'hide OFF 不挂骨架卡').toHaveLength(0);
  expect(realCards(grid).filter((c) => c.classList.contains('umm-viewed'))).toHaveLength(0);
  expect(getBatchCalls(), '并行扇出：答案在途时读取已发出').toHaveLength(1);
  expect([...getBatchCalls()[0]!].sort()).toEqual(['SSIS-001', 'TID-1001', 'TID-1002']);

  const held = getPendingBatch()!;
  held({ success: true, watched: ['SSIS-001'] });
  await appRun;
  // 统计走 120ms trailing 节流（合并高频触发）：数字跟进要等这一窗口的尾调用。
  await settle(180);

  const after = realCards(grid);
  expect(after[0]!.classList.contains('umm-viewed'), '番号键命中 → dim').toBe(true);
  expect(after[1]!.classList.contains('umm-viewed'), '未命中不得 dim').toBe(false);
  expect(pageBox(shell)).toBe(t('sht.page_box', { watched: '1', hidden: '0' }));
  expect(globalBox(shell)).toContain('100');
});

test('hide ON + 整梯无答案：不隐藏任何条目、不挂空态、全局三段是破折号而非 0', async () => {
  const dom = await mount({ hideViewed: true, batchDead: true, statsDead: true });
  await runOverlayApp();
  await settleDeadLadder();

  const shell = shellOf(dom);
  const grid = gridOf(shell);
  expect(realCards(grid), '读失败绝不等于「都看过」→ 全量渲染').toHaveLength(2);
  expect(grid.querySelectorAll('.umm-sht-skel'), '骨架必须换成真卡').toHaveLength(0);
  expect(realCards(grid).filter((c) => c.classList.contains('umm-viewed'))).toHaveLength(0);
  expect(shell.querySelector('.umm-sht-empty'), '无隐藏事实不得挂空态').toBeNull();
  expect(pageBox(shell)).toBe(t('sht.page_box', { watched: '0', hidden: '0' }));
  expect(globalBox(shell), '无答案渲染为破折号：0/0/0 会被读成结论').not.toMatch(/\d/);

  // 呈现出口经注入缝观测（见模块头）：一整条失败梯子 = 恰好一次「后台不可达」。
  const unreachable = () => errorReports.filter((r) => r.message === t('neodb.comm_failed'));
  expect(unreachable(), '后台不可达要说一次').toHaveLength(1);
  const firstDetail = unreachable()[0]!.error;
  expect(
    typeof firstDetail === 'string' && firstDetail.length > 0,
    '报告必须带上梯子末次的失败原因，不能是空手而来',
  ).toBe(true);

  // 再来一整轮失败读取（事件驱动刷新）：同一页只提示一次，重复提示是噪声。
  setReadState({ batchDead: false });
  emitRecord('record:updated');
  await settleDeadLadder();
  expect(unreachable().length, '「后台不可达」每页只说一次：第二轮刷新不得再报').toBe(1);
  expect(getStatsCallCount(), '失败不留缓存 → 刷新必然重开梯子').toBeGreaterThanOrEqual(2);
});

test('hide ON：一次坏答案不是结论——梯子重发并采纳真答案，只渲染未看条目', async () => {
  const dom = await mount({ hideViewed: true, batchFailures: 1, answer: () => ['SSIS-001'] });
  await runOverlayApp();

  const shell = shellOf(dom);
  const grid = gridOf(shell);
  expect(getBatchCalls().length, '坏答案后必须再问一次').toBe(2);
  const rendered = realCards(grid);
  expect(rendered, '已看条目在 hide ON 下不渲染').toHaveLength(1);
  expect(rendered[0]!.getAttribute('data-tid')).toBe('TID-1002');
  expect(grid.querySelectorAll('.umm-sht-skel')).toHaveLength(0);
  expect(pageBox(shell)).toBe(t('sht.page_box', { watched: '0', hidden: '1' }));
  expect(shell.querySelector('.umm-sht-empty'), '仍有可见条目 → 不挂空态').toBeNull();
});

test('零行页：不发任何已看读取，也不误挂「全部已看过」空态', async () => {
  const dom = await mount({ hideViewed: true, rows: '' });
  await runOverlayApp();
  await settle(40);

  const shell = shellOf(dom);
  expect(getBatchCalls(), '空行集不发消息').toHaveLength(0);
  expect(realCards(gridOf(shell))).toHaveLength(0);
  expect(shell.querySelector('.umm-sht-empty'), '本就无条目 ≠ 全部已看').toBeNull();

  emitRecord('record:updated');
  await settle(40);
  expect(getBatchCalls(), '无卡的网格收到事件也不重扫').toHaveLength(0);
});

test('AJAX 分页：新行只读新行的键（旧行不重扫）；无可解析行时零读取、零 DOM 写入', async () => {
  const dom = await mount();
  await runOverlayApp();
  const shell = shellOf(dom);
  const grid = gridOf(shell);
  const mounted = realCards(grid);
  expect(mounted).toHaveLength(2);
  const table = dom.window.document.getElementById('threadlisttableid')!;

  table.insertAdjacentHTML('beforeend', threadRow('1003', 'ABC-777 追加丙'));
  await settle(60);
  const cards = realCards(grid);
  expect(cards, '新行追加为一张卡').toHaveLength(mounted.length + 1);
  expect(
    [...getBatchCalls().at(-1)!].sort(),
    '分页读取的键集必须恰好是新行（把旧行一起问 = 全表扫描）',
  ).toEqual(['ABC-777', 'TID-1003']);

  // 只有行壳、提不出线程数据 → 整批跳过：不读后台、不动网格、不重算头部。
  // 观察器的 flush 是 250ms 合并节流（上一批刚跑完），必须等过合并窗口才谈「这一批」。
  const readsBefore = getBatchCalls().length;
  const statsBefore = getStatsCallCount();
  const delaysBefore = cards.map((card) => card.style.animationDelay);
  table.insertAdjacentHTML(
    'beforeend',
    '<tbody id="normalthread_bad"><tr><td>广告位</td></tr></tbody>',
  );
  await settle(320);
  expect(realCards(grid), '坏行不产卡').toHaveLength(mounted.length + 1);
  expect(getBatchCalls().length, '无可解析行 → 不发已看读取').toBe(readsBefore);
  expect(getStatsCallCount(), '暖缓存下的头部刷新零消息（已缓存即不再读）').toBe(statsBefore);
  expect(
    realCards(grid).map((card) => card.style.animationDelay),
    '增量批次的入场动画不得回卷到既有卡',
  ).toEqual(delaysBefore);
});

// ---------------------------------------------------------------------------
// 3) 记录事件活态刷新
// ---------------------------------------------------------------------------

test('record:updated 重判现有节点（零重建）并推进本页已看数/复制按钮/统计缓存', async () => {
  const dom = await mount();
  await runOverlayApp();
  const shell = shellOf(dom);
  const grid = gridOf(shell);
  const before = realCards(grid);
  expect(before).toHaveLength(2);
  const copyBtn = shell.querySelector('.umm-copy-btn') as HTMLButtonElement;
  const statsAtMount = getStatsCallCount();

  // 别处写入记录：命中走 TID 兜底键（番号行与无番号行各一）。
  setReadState({ answer: () => ['TID-1001', 'TID-1002'] });
  emitRecord('record:updated');
  await settle(300);

  const after = realCards(grid);
  expect(after).toHaveLength(2);
  expect(
    after.every((card, idx) => card === before[idx]),
    '活态刷新只改类——不得为了「看起来刷新」重建卡片',
  ).toBe(true);
  expect(after.map((card) => card.classList.contains('umm-viewed'))).toEqual([true, true]);
  expect(pageBox(shell)).toBe(t('sht.page_box', { watched: '2', hidden: '0' }));
  expect(copyBtn.textContent ?? '').toContain('(0)');
  expect(copyBtn.disabled, '无未看条目 → 复制按钮禁用').toBe(true);
  // 重读覆盖双键（无番号行的 avid/tid 同形，集合去重后仍是这三把键）。
  expect(Array.from(new Set(getBatchCalls().at(-1) ?? [])).sort()).toEqual([
    'SSIS-001',
    'TID-1001',
    'TID-1002',
  ]);
  expect(getStatsCallCount(), '事件使统计缓存失效 → 恰好重取一次').toBe(statsAtMount + 1);
});

test('重读失败不得抹掉已确认的淡化（「没读到」不是「没看过」）', async () => {
  const dom = await mount({ answer: () => ['SSIS-001'] });
  await runOverlayApp();
  const shell = shellOf(dom);
  const grid = gridOf(shell);
  expect(realCards(grid)[0]!.classList.contains('umm-viewed'), '初检落 dim').toBe(true);

  setReadState({ batchDead: true });
  emitRecord('record:updated');
  await settleDeadLadder();

  expect(
    realCards(grid)[0]!.classList.contains('umm-viewed'),
    '一次读不到不等于「没看过」，更不等于可以把已确认的 dimmer 全部抹掉',
  ).toBe(true);
  expect(pageBox(shell)).toBe(t('sht.page_box', { watched: '1', hidden: '0' }));
});

test('点击跳转的视觉标记：updated 豁免、deleted 一并失效，且全程不落库', async () => {
  const dom = await mount();
  await runOverlayApp();
  const shell = shellOf(dom);
  const grid = gridOf(shell);
  const tidOnly = realCards(grid)[1]!;
  expect(tidOnly.getAttribute('data-avid'), '夹具该行无番号，主键回退到 TID 形态').toBe('TID-1002');

  tidOnly
    .querySelector('.umm-card-title a')!
    .dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  expect(tidOnly.classList.contains('umm-viewed'), '同 tick 落类（仅页面状态）').toBe(true);
  expect(getWriteCalls(), '点击跳转不落库').toEqual([]);

  // 别的卡片落库触发全量重算：视觉标记必须豁免，否则即时反馈闪回。
  setReadState({ answer: () => ['SSIS-001'] });
  emitRecord('record:updated');
  await settle(300);
  expect(realCards(grid)[1]!.classList.contains('umm-viewed'), 'updated 保留视觉标记').toBe(true);

  // 用户显式删除记录：视觉标记一并失效，否则删除不生效且统计自相矛盾。
  emitRecord('record:deleted');
  await settle(300);
  expect(realCards(grid)[1]!.classList.contains('umm-viewed'), 'deleted 撤除视觉标记').toBe(false);
  expect(pageBox(shell)).toBe(t('sht.page_box', { watched: '1', hidden: '0' }));
});
