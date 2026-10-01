/**
 * 色花堂 overlay 编排（ADR-024 D1/D3）。
 *
 * 接管链：sehuatang-early.content（document_start）已建 shadow host +
 * loading 骨架 → 本模块（document_idle 由 sehuatang-main.content 调用）。
 *
 * 渲染管线正确顺序（性能核心纪律）：
 *   1. i18n + DOM 守卫（#threadlisttableid 缺失 → dismiss overlay 退出）；
 *   2. 同步提取原生行数据/控件（覆盖层下的原页面 DOM 完整保留）；
 *   3. 行内数据（标题/日期/链接）先行渲染：hide OFF 直接挂真卡；hide ON
 *      先挂骨架卡（已看检查到达前不泄露已看条目，到达后单帧换真卡，无中途 pop）；
 *   4. 已看批量检查与渲染并行扇出——首屏不被任何消息/DB 阻塞；
 *   5. 封面/磁力 = IntersectionObserver 懒加载（detail-loader：缓存 → fetch），
 *      卡片入视口才产生请求；图片 lazy + decoding=async；
 *   6. 入场级联仅首屏可见卡（rAF + 批量读 rect 后统一写，读写不交错）。
 *   7. 「全部已看过」空态：hide ON 且无可见条目 → eye-off 大插图 + 关闭提示
 *      （empty-state.ts）；挂/撤随 updateHeaderInfo 每次刷新——初始挂载 /
 *      AJAX 分页 / 菜单切换与运行时标记三处状态变更的汇合点。
 *
 * 查询纪律：UI 元素一律经 shell/grid/header 闭包引用或容器内 querySelector，
 * 禁止 document 级全文档扫描（原页面 DOM 巨大且与我们无关）。
 */

import { AdultAvStore } from '@/provider/adult-av';
import { settingsItems } from '@/engine/settings/items';
import { t, initI18n } from '@/entrypoints/content/i18n';
import { throttle } from '@/libraries/utils';
import { errorLog, infoLog, warnLog } from '@/libraries/utils/logger';
import { resetStatsUnreachableGate } from './app-notify';
import { releaseTrailingWriters, trackTrailingWriter } from './app-trailing-writers';
import { onEvent, type EventType } from '@/libraries/utils/event-bus';
import { FloatingToast } from '@/entrypoints/content/utils/toast';
import {
  mountSehuatangControls,
  markCardsViewed,
  dimCardsVisually,
  runVisibleEntrance,
  withDimBatch,
} from '@/entrypoints/content/handlers/sehuatang-controls';
import { initImageReveal, runCardEntrance } from '@/entrypoints/content/handlers/sehuatang-effects';
import {
  partitionInitialVisible,
  parseThreadList,
  parseThreadRow,
  collectNewThreadRows,
  collectThreadTrackKeys,
  shouldDimOnNavigate,
  type SehuatangThread,
} from '@/entrypoints/content/handlers/sehuatang-extract';
import { attachSehuatangOverlay } from './overlay';
// 头部统计/空态刷新（页面级隐藏数与挂载点状态随本模块拆出，2026-09-28）。
import {
  addHiddenAtMount,
  registerEmptyShell,
  resetHeaderStatsPage,
  setHiddenAtMount,
  updateHeaderInfo,
} from './app-header-stats';
import {
  createDetailLoader,
  DETAIL_FLAG,
  type CardDetail,
  type DetailLoader,
} from './detail-loader';
// 卡片渲染原语与跨页保存失败诊断（2026-09-25 自本模块拆出）
import { buildCard, renderSkeleton, cardTrackKeys } from './card-render';
import { reportSaveFailure, consumeSaveFailure } from './save-failure';
import { buildHeader } from './header';
// 背景读取的重试/缓存纪律（失败的读取不是结论，见模块头）。
import {
  bumpGlobalStats as bumpStats,
  invalidateGlobalStats,
  readWatchedIds,
} from './background-reads';

// 页面生命周期状态：每次 handler 运行重置。三段已看统计缓存与已看批量检查的
// 重试纪律均在 ./background-reads（失败的读取不进缓存）；头部两个框所读的
// 「本页隐藏数」与空态挂载点在 ./app-header-stats（2026-09-28 拆出）。

// 保存失败诊断（跨页 sessionStorage 标记 + 消费）见 ./save-failure（2026-09-25 拆出）

// 页面级单例（重入清理）：分页观察器 / 详情加载器 / 事件订阅。
let activePaginationObserver: MutationObserver | null = null;
let activeDetailLoader: DetailLoader | null = null;
let activeUnsubscribeEvents: (() => void) | null = null;

/** 记录事件订阅通道：生产绑定 = event-bus 的 onEvent（行为不变）；测试经
 *  `__bindRecordEventSinkForTests` 注入捕获器（显式注入 API 先例：`__bindSettingsAreaForTests`）。 */
type RecordEventSink = (event: EventType, cb: () => void) => () => void;
let recordEventSink: RecordEventSink = onEvent;
export function __bindRecordEventSinkForTests(sink?: RecordEventSink): void {
  recordEventSink = sink ?? onEvent;
}

/**
 * 本次会话内「仅视觉」标记的卡片（点击跳转触发，不落库）。
 *
 * 必须与 DB 派生的 .umm-viewed 区分：record:updated 会触发全量重算
 * （applyWatchedClasses → classList.toggle），若不豁免，别的卡片落库会把
 * 这里的 dimmer 抹掉，用户的即时反馈会闪回。
 */
let visuallyMarked = new WeakSet<HTMLElement>();

// 头部统计（本页已看/隐藏 + 全局三段）与空态挂撤见 ./app-header-stats
// （2026-09-28 拆出）；updateHeaderInfo 是三处状态变更的汇合点。

/** 构建单卡静态结构（零网络；封面/磁力由 DetailLoader 懒加载回填）。 */
// buildCard / renderSkeleton 见 ./card-render（2026-09-25 拆出）

/** 详情回填（缓存/抓取同一路径）：封面 + 磁力锚点 + 复制标记接线。
 *  headerRef 间接引用：loader 先于 header 创建（copy-all 依赖 loader），
 *  磁力点击回调触发时 header 必然已就位。 */
function makeDetailFiller(
  grid: HTMLElement,
  headerRef: { current: HTMLElement | null },
): (card: HTMLElement, detail: CardDetail) => void {
  return (card, detail) => {
    const imgContainer = card.querySelector('.umm-card-image');
    if (detail.imageUrl && imgContainer && !imgContainer.querySelector('img')) {
      const img = document.createElement('img');
      img.src = detail.imageUrl;
      img.loading = 'lazy';
      img.decoding = 'async';
      img.alt = '';
      // 协议白名单复用于封面跳转：仅 http(s) 可 window.open（标题链接为静态
      // 渲染的站内 URL，仍按不可信输入防御）。
      const pageUrl = card.getAttribute('data-url') ?? '';
      if (/^https?:/i.test(pageUrl.trim())) {
        img.onclick = () => window.open(pageUrl, '_blank', 'noopener,noreferrer');
      }
      imgContainer.appendChild(img);
    }

    if (detail.magnetLink && !card.querySelector('.umm-magnet-link')) {
      const magnetLink = detail.magnetLink;
      // 协议白名单：磁力链接来自站点详情页文本，仍按不可信输入防御——
      // 仅 magnet:/http(s): 可作 href 导航；非法则不设 href（锚点不可导航）。
      const safeHref = /^(magnet:|https?:)/i.test(magnetLink.trim());
      const a = document.createElement('a');
      if (safeHref) a.href = magnetLink;
      a.className = 'umm-magnet-link';
      a.textContent = '⚡';
      a.title = t('Copy Magnet');
      a.onclick = (e) => {
        e.preventDefault();
        navigator.clipboard
          .writeText(magnetLink)
          .then(() => {
            // 复制反馈动效：按钮 pop + toast（仅复制成功时）。
            a.classList.add('umm-sht-copied');
            setTimeout(() => a.classList.remove('umm-sht-copied'), 650);
            FloatingToast.success(t('Copy Done', { count: String(1) }));
          })
          .catch((error: unknown) => {
            warnLog('[UMM] Sehuatang clipboard write failed:', error);
          });
        // 统一标记路径：data-avid = trackId（番号或 TID 兜底），类落下即
        // dimmer 生效；落库走单次批量消息，失败自动逐条兜底 + 跨页失败标记。
        const header = headerRef.current;
        const refresh = () => {
          if (header) updateHeaderInfo(header, grid);
        };
        // 该卡若此前被「点击跳转」标记过（只加类、未落库），先摘掉视觉标记——
        // 否则会被 markCardsViewed 的「已含 .umm-viewed 即跳过」幂等过滤吞掉，
        // 观看记录永远不落库。摘除后由 markCardsViewed 同步把类补回。
        if (visuallyMarked.delete(card)) card.classList.remove('umm-viewed');
        markCardsViewed(
          [card],
          'sehuatang',
          AdultAvStore,
          refresh,
          (added, ids) => {
            bumpStats(ids);
            refresh();
            infoLog(`[UMM] saved watched ids (${added}):`, ids.join(', ') || '(none)');
          },
          (error) => {
            reportSaveFailure(String(error));
            FloatingToast.error(t('Magnet Save Failed'));
          },
        );
      };
      card.querySelector('.umm-card-links')?.appendChild(a);
    }
  };
}

/** 批量构卡 → 单帧挂载 → 逐卡纳入懒加载观察。 */
function mountCards(
  grid: HTMLElement,
  threads: SehuatangThread[],
  loader: DetailLoader,
): HTMLElement[] {
  const fragment = document.createDocumentFragment();
  const cards: HTMLElement[] = [];
  for (const info of threads) {
    const card = buildCard(info);
    cards.push(card);
    fragment.appendChild(card);
  }
  grid.appendChild(fragment);
  for (const card of cards) loader.watch(card);
  return cards;
}

// cardTrackKeys 见 ./card-render（2026-09-25 拆出）

/** 已看类批量应用（hide OFF 异步路径与 record:updated 同步共用）。
 *  双键命中：番号键（jav_ids/usav_ids）或 TID 键（sehuatang_ids）任一即已看。
 *
 *  preserveVisualMarks：是否保留会话内「点击跳转」的视觉标记。
 *    - record:**updated** → true：别的卡片落库会触发全量重算，若此刻不豁免，
 *      被点击卡在帖子页写入到达前会被 toggle(false) 抹掉（即时反馈闪回）；
 *    - record:**deleted** → false：用户显式删除记录时视觉标记必须一并失效，
 *      否则删除不生效，且「本页已看」与三段统计自相矛盾。
 */
function applyWatchedClasses(
  grid: HTMLElement,
  watchedIds: Set<string>,
  preserveVisualMarks = true,
): void {
  // 批量免过渡（withDimBatch）：几十张卡同帧落类不再各播 0.18s/0.22s 过渡
  // （首屏 dim 观感「慢」的主因）；键判定内联，避免逐卡分配临时数组。
  withDimBatch(grid, () => {
    for (const card of Array.from(
      grid.querySelectorAll('.umm-card[data-avid], .umm-card[data-tid]'),
    ) as HTMLElement[]) {
      const visual = preserveVisualMarks && visuallyMarked.has(card);
      const avid = card.getAttribute('data-avid');
      const tid = card.getAttribute('data-tid');
      const watched =
        visual ||
        (avid !== null && avid !== '' && watchedIds.has(avid.toUpperCase())) ||
        (tid !== null && tid !== '' && watchedIds.has(tid.toUpperCase()));
      card.classList.toggle('umm-viewed', watched);
      if (!watched) visuallyMarked.delete(card);
    }
  });
}

/**
 * 点击跳转即 dimmer（**仅页面状态，不落库**）。
 *
 * 适用面见 shouldDimOnNavigate：只提取到 TID 的条目，或详情子请求已结束
 * 但仍无磁力的条目。这两类没有自然的「复制磁力」落库路径，用户会直接点进
 * 帖子；数据变更交给目标帖子页的静默记录（sehuatang-main.content 的
 * recordThreadVisit），此处只做视觉状态，避免冗余写入。
 *
 * 委托绑定在 grid 上（捕获所有异步回填的封面/标题）；只认两个「跳转」点击
 * 面：标题链接 与 封面图（磁力锚点不在此列，它走复制落库路径）。
 */
function initNavigateDimmer(grid: HTMLElement, headerRef: { current: HTMLElement | null }): void {
  // 幂等守卫（与 initImageReveal 同款）：同一 grid 重复初始化不叠加监听器。
  if (grid.getAttribute('data-umm-sht-dim') === '1') return;
  grid.setAttribute('data-umm-sht-dim', '1');

  grid.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!target.closest('.umm-card-title a, .umm-card-image img')) return;
    const card = target.closest('.umm-card') as HTMLElement | null;
    if (!card || card.classList.contains('umm-viewed')) return;
    const eligible = shouldDimOnNavigate({
      trackId: card.getAttribute('data-avid'),
      detailSettled: card.getAttribute(DETAIL_FLAG) === 'done',
      hasMagnet: card.querySelector('.umm-magnet-link') !== null,
    });
    if (!eligible) return;
    // 同步落类（同一 tick，跳转前生效）；不做任何消息/DB 调用。
    if (dimCardsVisually([card]) > 0) {
      visuallyMarked.add(card);
      const header = headerRef.current;
      if (header) updateHeaderInfo(header, grid);
    }
  });
}

/** 跨标签/面板写入同步：record 更新 → 重跑批量检查 → 类对齐 + 三段统计失效重取。
 *  更新与删除分开节流：删除必须走 preserveVisualMarks=false（见 applyWatchedClasses）。 */
function subscribeRecordUpdates(grid: HTMLElement, headerEl: HTMLElement): () => void {
  const runSync = (preserveVisualMarks: boolean) => {
    const cards = Array.from(
      grid.querySelectorAll('.umm-card[data-avid], .umm-card[data-tid]'),
    ) as HTMLElement[];
    const ids = cards.flatMap(cardTrackKeys);
    if (ids.length === 0) return;
    void readWatchedIds(ids).then((res) => {
      if (!res.ok) {
        // 重读失败时保留现有标记：一次读不到不等于「没看过」，
        // 更不等于可以把已确认的 dimmer 全部抹掉。
        warnLog('[UMM] Sehuatang watched re-read failed, keeping current marks:', res.error);
        return;
      }
      applyWatchedClasses(grid, res.watched, preserveVisualMarks);
      invalidateGlobalStats();
      updateHeaderInfo(headerEl, grid);
    });
  };
  const syncUpdated = throttle(() => runSync(true), 300);
  const syncDeleted = throttle(() => runSync(false), 300);
  trackTrailingWriter(syncUpdated);
  trackTrailingWriter(syncDeleted);
  const offUpdated = recordEventSink('record:updated', syncUpdated);
  const offDeleted = recordEventSink('record:deleted', syncDeleted);
  return () => {
    offUpdated();
    offDeleted();
  };
}

/** 解析原生帖子表全部行（覆盖层下的 light DOM；纯提取）。 */
// parseThreadList 见 @/entrypoints/content/handlers/sehuatang-extract（2026-09-25 归入该模块）

/**
 * AJAX 静态地址分页（Discuz #autopbn）：URL 不变、新行追加到原表格。
 * 处理新行时复用初始进程语义：hide 启用 → 已看线程不渲染（隐藏策略正确
 * 作用于每次数据切换）；hide 关闭 → 已看加 dimmer 类。仅新卡入场动画。
 *
 * hide 状态**实时读取** grid 的 umm-sht-hide-viewed 类（菜单 toggle 是命令式
 * 即时生效），不能沿用挂载时读出的常量——否则运行时切 OFF 后追加的已看行
 * 仍会被隐藏，与「运行时只 dim 不隐藏」语义冲突。
 */
async function processNewThreads(
  rows: Element[],
  grid: HTMLElement,
  headerEl: HTMLElement,
  loader: DetailLoader,
): Promise<void> {
  const threads: SehuatangThread[] = [];
  for (const row of rows) {
    const thread = parseThreadRow(row);
    if (thread) threads.push(thread);
  }
  if (threads.length === 0) return;

  const hideViewed = grid.classList.contains('umm-sht-hide-viewed');
  const trackIds = collectThreadTrackKeys(threads);
  const checked = await readWatchedIds(trackIds);
  if (!checked.ok) {
    // 读不到仍要出卡（分页不能因一次坏消息断掉），但绝不按「都没看」隐藏。
    warnLog('[UMM] Sehuatang paged watched read failed, rendering unfiltered:', checked.error);
  }
  const watchedIds = checked.watched;

  let toRender: SehuatangThread[] = threads;
  if (hideViewed) {
    const partitioned = partitionInitialVisible(threads, watchedIds);
    toRender = partitioned.visible;
    addHiddenAtMount(partitioned.hiddenCount);
  }
  const newCards = mountCards(grid, toRender, loader);

  if (!hideViewed) {
    for (const card of newCards) {
      if (cardTrackKeys(card).some((key) => watchedIds.has(key.toUpperCase())))
        card.classList.add('umm-viewed');
    }
  }

  runCardEntrance(grid, 45, true);
  updateHeaderInfo(headerEl, grid);
}

/**
 * 监听帖子表新增行（覆盖 #autopbn 自动翻页 / 任何 AJAX 分页），
 * throttle(250ms) 合并批量追加；既有行 ID 预先登记避免重复处理。
 */
function startPaginationSync(grid: HTMLElement, headerEl: HTMLElement, loader: DetailLoader): void {
  if (grid.getAttribute('data-umm-sht-paging') === '1') return;
  const table = document.getElementById('threadlisttableid');
  if (!table) return;
  grid.setAttribute('data-umm-sht-paging', '1');

  const processed = new Set<string>();
  for (const row of Array.from(table.querySelectorAll('tbody[id^="normalthread_"]'))) {
    if (row.id) processed.add(row.id);
  }

  const pendingRows: Element[] = [];
  const flush = throttle(() => {
    if (pendingRows.length === 0) return;
    const rows = pendingRows.splice(0);
    void processNewThreads(rows, grid, headerEl, loader);
  }, 250);
  trackTrailingWriter(flush);

  const observer = new MutationObserver((mutations) => {
    for (const row of collectNewThreadRows(mutations, processed)) pendingRows.push(row);
    flush();
  });
  observer.observe(table, { childList: true, subtree: true });
  activePaginationObserver = observer;
}

// buildHeader moved to ./header (2026-09-26 god-file split)

/**
 * 释放页面级单例资源（重入清理 / 非法页兜底共用；幂等）。
 * 断连分页观察器、销毁详情加载器（含取消在途 fetch）、解除事件订阅。
 */
function releasePageResources(): void {
  // 先撤销待决尾调用（定时器在 throttle 闭包里，外部拿不到）。
  releaseTrailingWriters();
  activePaginationObserver?.disconnect();
  activePaginationObserver = null;
  activeDetailLoader?.destroy();
  activeDetailLoader = null;
  activeUnsubscribeEvents?.();
  activeUnsubscribeEvents = null;
}

/**
 * overlay 编排入口（sehuatang-main.content 调用）。
 * 前置：早期入口已建 shadow host；本函数失败兜底 = dismiss 还原原页面。
 */
export async function runSehuatangOverlayApp(): Promise<void> {
  await initI18n();
  infoLog('[UMM] Sehuatang overlay app activated');

  // Forumdisplay 列表页 DOM 守卫：帖子表格是唯一标记。早期入口仅凭 URL
  // 建壳；详情/搜索等 URL 形态已被 url.ts 排除，此处兜底 DOM 复核。
  const threadList = document.getElementById('threadlisttableid');
  const overlay = attachSehuatangOverlay();
  if (!threadList) {
    // 非法页兜底：连同上一轮遗留的观察器/加载器/订阅一起拆掉，不留悬挂资源。
    releasePageResources();
    overlay?.dismiss();
    return;
  }
  if (!overlay) return;

  try {
    // 上一页面遗留的保存失败诊断：立即呈现原因（跨页证据）。
    consumeSaveFailure();

    // 重入清理：断连旧观察器/加载器/订阅（幂等重挂载）。
    releasePageResources();

    // 页面生命周期状态重置。
    invalidateGlobalStats();
    resetStatsUnreachableGate();
    resetHeaderStatsPage();
    visuallyMarked = new WeakSet<HTMLElement>();

    // 隐藏已看设置读取与 UI 构建并行（storage 读不阻塞结构搭建）。
    const hideViewedPromise = settingsItems()
      .sehuatangHideViewed.getValue()
      .catch((error: unknown) => {
        warnLog('[UMM] Sehuatang hide-viewed setting read failed, defaulting to show:', error);
        return false;
      });

    // 原始帖子表隐藏（DOM 保留：AJAX 分页观察与发新帖 click() 转发依赖）。
    threadList.style.display = 'none';

    // overlay 内容根：壳（header + 网格）单帧挂载，替换 loading 骨架。
    // --island 修饰类：列表页挂载「灵动岛」（搜索+分页+动作，buildFloatbar
    // 统一合成），遮挡补偿 padding（GRID_CSS 的 padding-bottom）作用任何挂岛
    // 页面；风控页无岛不多留白。
    const shell = document.createElement('div');
    shell.className = 'umm-sht-shell umm-sht-shell--island';
    const grid = document.createElement('div');
    grid.className = 'umm-preview-grid';
    shell.appendChild(grid);
    // 空态挂载点登记：此后每次 updateHeaderInfo 刷新都会按需挂/撤空态。
    registerEmptyShell(shell);

    // 封面模糊遮罩 + hover 揭示（防抖），事件委托覆盖异步加载的图片。
    initImageReveal(grid);

    // 详情懒加载器：IO 视口驱动 → 缓存 → fetch。headerRef 打破 loader（copy-all
    // 依赖）与 filler（磁力回调依赖 header）的循环：header 构建后回填引用。
    const headerRef: { current: HTMLElement | null } = { current: null };
    const loader = createDetailLoader(makeDetailFiller(grid, headerRef));
    activeDetailLoader = loader;

    // 点击跳转即 dimmer（仅页面状态，不落库）——只对「无磁力可复制」的两类条目生效。
    initNavigateDimmer(grid, headerRef);

    const hideViewed = await hideViewedPromise;

    const threads = parseThreadList();
    infoLog(`[UMM] Found ${threads.length} threads`);

    // 已看批量检查与渲染并行扇出（首屏不被消息/DB 阻塞）。空 id 集不发任何消息。
    const trackIds = collectThreadTrackKeys(threads);
    const watchedPromise = readWatchedIds(trackIds);

    if (hideViewed) {
      grid.classList.add('umm-sht-hide-viewed');
      // 骨架先行：已看检查到达前不渲染真卡（已看条目零闪现）；
      // 检查完成后单帧换真卡（无入场中途 pop）。
      renderSkeleton(grid, threads.length);
      const headerEl = buildHeader(shell, grid, loader, { updateHeaderInfo, bumpStats });
      headerRef.current = headerEl;
      mountSehuatangControls(document, headerEl, { floatbarParent: shell });
      overlay.mountContent(shell);

      const checked = await watchedPromise;
      const watchedIds = checked.watched;
      infoLog(
        `[UMM] watched check: queried ${trackIds.length} → matched ${watchedIds.size}${checked.ok ? '' : ' (read failed)'}`,
      );
      if (!checked.ok) {
        // 读失败 → 不隐藏任何条目（骨架换成全量真卡）：宁可多显示，不可把
        // 「没读到」渲染成「都看过」而永久隐藏条目。
        warnLog('[UMM] Sehuatang watched check unread, hiding nothing:', checked.error);
      }
      // 导航/重入致 grid 脱离文档 → 放弃本轮回填，避免对游离节点操作。
      if (!grid.isConnected) return;
      const partitioned = partitionInitialVisible(threads, watchedIds);
      setHiddenAtMount(partitioned.hiddenCount);
      grid.replaceChildren();
      mountCards(grid, partitioned.visible, loader);
      runVisibleEntrance(grid, 45);
      updateHeaderInfo(headerEl, grid);
      startPaginationSync(grid, headerEl, loader);
      activeUnsubscribeEvents = subscribeRecordUpdates(grid, headerEl);
    } else {
      const headerEl = buildHeader(shell, grid, loader, { updateHeaderInfo, bumpStats });
      headerRef.current = headerEl;
      mountSehuatangControls(document, headerEl, { floatbarParent: shell });
      mountCards(grid, threads, loader);
      overlay.mountContent(shell);
      runVisibleEntrance(grid, 45);
      updateHeaderInfo(headerEl, grid);
      startPaginationSync(grid, headerEl, loader);
      activeUnsubscribeEvents = subscribeRecordUpdates(grid, headerEl);

      // hide OFF：真卡已渲染，已看检查到达后一次性批量加 dimmer 类。
      const checked = await watchedPromise;
      infoLog(`[UMM] watched check: queried ${trackIds.length} → matched ${checked.watched.size}`);
      if (!checked.ok) {
        // 读不到就不落任何 dim 类：缺标记是可见的「未淡」，假淡是丢信息。
        warnLog('[UMM] Sehuatang watched check unread, dimming nothing:', checked.error);
      }
      if (!grid.isConnected) return;
      applyWatchedClasses(grid, checked.watched);
      updateHeaderInfo(headerEl, grid);
    }
  } catch (error) {
    // attachSehuatangOverlay already tore the old shell down — without this
    // catch a mid-build throw leaves the host page hidden and the overlay empty.
    // Same posture as app-home: dismiss restores the original page.
    errorLog('[UMM] Sehuatang list build failed, dismissing overlay:', error);
    releasePageResources();
    overlay.dismiss();
  }
}
