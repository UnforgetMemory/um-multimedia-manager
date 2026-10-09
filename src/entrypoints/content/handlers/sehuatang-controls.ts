/**
 * 色花堂 forumdisplay 控件重建（overlay 增量，项目令牌基准版）——公共表面（barrel）
 *
 * 在卡片网格（sehuatang.ts）基础上，提取原生页面控件并重建为项目基准 UI：
 *   1. 面包屑（#pt .z）+ 统计信息 → header 上行（上下文与状态）
 *   2. 主题分类选项卡（#thread_types）→ header 下行左侧（导航）
 *   3. 「返 回」「发新帖」+ 复制磁力 → header 下行右侧（操作）；🏠 首页 +
 *      ☰ 菜单 → header 上行「top center 簇」（三列网格中列）
 *   4. 搜索框 + 分页（#fd_page_bottom）→ 底部「灵动岛」悬浮栏
 *      （buildFloatbar 统一合成，现代窗口化页码；返回/发新帖不入岛，仅 header
 *      持有，重复入岛只会撑宽岛体、窄屏溢出）
 *
 * 单体瘦身分层（消费者一律从本 barrel 导入，无需感知内部文件）：
 *   - ./sehuatang-controls-extract — 提取层（Element → 数据，纯函数）
 *   - ./sehuatang-controls-build   — 构建器层（数据 → 项目基准 UI 元素）
 *   - ./sehuatang-controls-mark    — 「已看标记与淡化」状态层
 *   - ./sehuatang-paging           — 分页窗口化/推导/跳转纯函数
 * 本文件保留：首帧背景预载、入场级联（runVisibleEntrance = rAF 读写分离的
 * 单一算法，保持整体不落散）、编排入口 mountSehuatangControls。
 *
 * 设计联调（DESIGN_GUIDE Layer 3 规范）：
 *   - 全部颜色消费 --umm-* 语义令牌（light DOM 由 global.ts 注入 html
 *     [data-umm-theme]；shadow overlay 由 styles.ts 重宿主到 :host），
 *     本模块零调色板 hex。
 *   - 自适应：clamp 流式间距/字号（--umm-* 容器级变量）+ 窄屏换行/横向滚动。
 *   - 主题源 = 扩展设置 umm:appearance（auto 跟随系统）。
 *   - accent = 项目品牌色（--umm-fill-primary / --umm-accent），不再用站点 teal。
 */

import {
  COLOR_OVERLAY_SURFACE,
  COLOR_OVERLAY_SURFACE_DARK,
} from '@/entrypoints/content/styles/tokens';
import {
  extractBreadcrumb,
  extractTypeTabs,
  extractPagination,
} from './sehuatang-controls-extract';
import {
  el,
  buildBreadcrumbBar,
  buildTabsBar,
  buildPager,
  buildActions,
  buildFloatbar,
} from './sehuatang-controls-build';

export type { PaginationData, PagerLink } from './sehuatang-paging';
export { resolveJumpUrl, clampPage } from './sehuatang-paging';

// 「已看标记与淡化」状态层已抽出为独立模块（职责分离，见该文件头注）；此处再
// 导出以保持既有消费者不变（app.ts / app-search.ts / empty-state.ts / styles.ts
// 与 5 个 spec）。withDimBatch（dimmer 批量免过渡执行器）同属该模块。
export {
  withDimBatch,
  markCardsViewed,
  dimCardsVisually,
  countSehuatangCardStates,
  setGridHideViewed,
} from './sehuatang-controls-mark';
export type { MarkedStore } from './sehuatang-controls-mark';

// 提取层 / 构建器层实现已抽出（见文件头分层说明）；此处再导出保持公共表面不变。
export { extractBreadcrumb, extractTypeTabs, extractPagination };
export type { BreadcrumbItem, TypeTab } from './sehuatang-controls-extract';
export { buildBreadcrumbBar, buildTabsBar, buildPager, buildActions, buildFloatbar };
export { buildSearchUrl, buildSearchBox, buildHomeLink } from './sehuatang-controls-build';
export type { IslandMode, FloatbarHandle } from './sehuatang-controls-build';

// ---------------------------------------------------------------------------
// 首帧背景预载（document_start 由 sehuatang-early.content 调用）
// ---------------------------------------------------------------------------

const EARLY_BG_STYLE_ID = 'umm-sht-early-bg';

/**
 * 以主题表面色立即涂刷 html,body 背景（幂等更新同一 style 元素）。
 * 目的：document_start 首帧即呈现主题背景，消除「先看到站点原始背景、
 * 后跳变主题色」的闪烁；色值与 --umm-surface 同源（vibrancy/neutral-50）。
 * body 一并覆盖——Discuz 自带 body 背景，只刷 html 会被 body 盖住。
 */
export function paintSehuatangBackground(doc: Document, theme: 'dark' | 'light'): void {
  const color = theme === 'dark' ? COLOR_OVERLAY_SURFACE_DARK : COLOR_OVERLAY_SURFACE;
  let styleEl = doc.getElementById(EARLY_BG_STYLE_ID) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = doc.createElement('style');
    styleEl.id = EARLY_BG_STYLE_ID;
    doc.documentElement.appendChild(styleEl);
  }
  styleEl.textContent = `html, body { background: ${color} !important; }`;
}

// ---------------------------------------------------------------------------
// 主题同步（html[data-umm-theme] 驱动 global.ts 的 --umm-* 双主题翻转）
// 自 sehuatang-early.content（document_start）接入后，属性与背景由早期脚本
// 负责全程保鲜（含 SPA 内导航场景，早期脚本随文档加载即生效），本模块不再
// 保留独立同步器——避免重复 storage 监听。
// ---------------------------------------------------------------------------

/**
 * 入场级联收窄到首屏可见卡：rAF 内批量读 rect、统一写类名（读写不交错）。
 * 列表页 / 首页 / 搜索页三处编排共用；stepMs = 卡片入场延迟步进
 * （列表页 45ms，首页/搜索页 25ms）。
 */
export function runVisibleEntrance(root: HTMLElement, stepMs = 25): void {
  requestAnimationFrame(() => {
    const cards = Array.from(
      root.querySelectorAll('.umm-card:not(.umm-sht-enter)'),
    ) as HTMLElement[];
    if (cards.length === 0) return;
    const viewportH = window.innerHeight;
    const visible: HTMLElement[] = [];
    for (const card of cards) {
      const rect = card.getBoundingClientRect();
      if (rect.top < viewportH && rect.bottom > 0) visible.push(card);
    }
    visible.forEach((card, idx) => {
      card.classList.add('umm-sht-enter');
      card.style.animationDelay = `${idx * stepMs}ms`;
    });
  });
}

// ---------------------------------------------------------------------------
// 编排
// ---------------------------------------------------------------------------

/**
 * 编排入口：守卫（仅 forumdisplay 列表页）→ 提取 → 隐藏原版 → 双行 header 重建。
 * headerEl 为 overlay 内容根内的注入头部：
 *   row--context = 面包屑（左）+ 统计信息（右）
 *   row--nav     = 选项卡（左）+ 操作组（右：返回/发新帖/复制磁力/菜单；
 *                  搜索框不入 header——统一移至底部灵动岛）
 * 底部浮动栏（灵动岛，buildFloatbar 统一合成 = 搜索 + 分页）默认挂
 * doc.body（legacy light-DOM 路径），shadow 模式经 opts.floatbarParent 挂入
 * overlay 内容根；返回/发新帖不入岛（header 操作组已持有，重复入岛只会
 * 撑宽岛体、窄屏溢出）。
 */
export function mountSehuatangControls(
  doc: Document,
  headerEl: HTMLElement,
  opts?: { floatbarParent?: HTMLElement },
): void {
  if (headerEl.getAttribute('data-umm-sht-mounted') === '1') return;
  if (!doc.getElementById('thread_types')) return;
  headerEl.setAttribute('data-umm-sht-mounted', '1');

  // 提取必须先于隐藏（display:none 不影响 DOM 查询，但保持顺序清晰）。
  const breadcrumb = extractBreadcrumb(doc.querySelector('#pt .z'));
  const tabs = extractTypeTabs(doc.getElementById('thread_types'), doc.location?.href ?? '');
  const bottomPg = extractPagination(doc.querySelector('#fd_page_bottom .pg'));

  const topBack = doc.querySelector('#visitedforums a') as HTMLAnchorElement | null;
  const topPost = doc.getElementById('newspecial');

  // 隐藏原版（保留 DOM 供「发新帖」click() 接线）。
  for (const sel of ['#pt', '#thread_types', '#pgt']) {
    const origin = doc.querySelector(sel) as HTMLElement | null;
    if (origin) origin.style.display = 'none';
  }
  const bottomPgContainer = doc
    .getElementById('fd_page_bottom')
    ?.closest('.pgs') as HTMLElement | null;
  if (bottomPgContainer) bottomPgContainer.style.display = 'none';

  // 双行 header 重建：复用既有子元素（统计区 / 居中簇 / actions 操作组），只重组结构。
  // 上行三列网格 = [面包屑（左）| 居中簇 .umm-sht-center（🏠 + ☰，top center）
  // | 统计区（右）]；居中簇缺失时补空 spacer 保证三列轨道（右列仍靠右）。
  const statArea = headerEl.querySelector('.umm-sht-stat-area');
  const center = headerEl.querySelector('.umm-sht-center');
  const info = headerEl.querySelector('.umm-header-info');
  const actions = headerEl.lastElementChild as HTMLElement | null;
  const crumbBar = buildBreadcrumbBar(doc, breadcrumb);
  const tabsBar = buildTabsBar(doc, tabs);

  const rowContext = el(doc, 'div', 'umm-sht-row umm-sht-row--context');
  if (crumbBar) rowContext.appendChild(crumbBar);
  rowContext.appendChild(center ?? el(doc, 'div', 'umm-sht-center'));
  if (statArea) rowContext.appendChild(statArea);
  else if (info) rowContext.appendChild(info);

  const rowNav = el(doc, 'div', 'umm-sht-row umm-sht-row--nav');
  if (tabsBar) rowNav.appendChild(tabsBar);
  if (actions) {
    // 次要动作（返回/发新帖）置前，主要动作（复制磁力）保持靠右的主次分层。
    for (const btn of buildActions(doc, topBack, topPost).reverse()) {
      actions.insertBefore(btn, actions.firstElementChild);
    }
    rowNav.appendChild(actions);
  }

  headerEl.replaceChildren(rowContext, rowNav);

  // 底部「灵动岛」悬浮栏：搜索 + 底部分页（buildFloatbar 统一合成；岛是
  // 全站唯一搜索入口）。返回/发新帖不再入岛——header 操作组已有同款，
  // 重复按钮只会把岛撑宽、窄屏溢出；上下页切换由 pager 的 ‹ › 图标承担。
  // 有分页时岛默认展示分页舱（策略性优先），⇅ 可轮替到搜索舱。
  const bottomBar = buildPager(doc, bottomPg);
  const island = buildFloatbar(doc, { search: true, pager: bottomBar });
  if (island) (opts?.floatbarParent ?? doc.body).appendChild(island.pill);
}

// ---------------------------------------------------------------------------
// 样式已收编：组件 CSS 唯一事实源 = src/scenario/sehuatang/styles.ts
// （Shadow DOM 编译期常量，含运行时 hide-viewed 规则），本模块不再注入样式。
// ---------------------------------------------------------------------------
