/**
 * 列表页「全部已看过」空态（hide ON 且无可见条目时的 eye-off 大插图 + 双行提示）。
 *
 * 触发面（三处状态变更的汇合点都经 app.ts updateHeaderInfo → syncEmptyHiddenState）：
 *   1. 初始挂载：hide ON 且整页线程全部已看（已看不渲染，grid 为空）；
 *   2. AJAX 分页：新页追加未看卡 → 空态撤销；新页亦全已看 → 空态保持；
 *   3. 运行时切换：菜单「隐藏已阅」ON 后渲染卡全为已看（内联 display:none）；
 *      再切 OFF → 空态撤销。
 *
 * 「隐藏」判定语义（与 sehuatang-controls 的既定契约一致，三态不可混淆）：
 *   - 初始隐藏 = 不渲染（hiddenAtMount 计数，grid 中无 DOM 痕迹）；
 *   - 运行时隐藏 = setGridHideViewed 的内联 display:none（仅作用于 .umm-viewed）；
 *   - 运行时标记（点击跳转 / 记录同步）= 只 dim 不隐藏 → 计为可见，不触发空态。
 *
 * 空版块防误报：grid 为空且 hiddenAtMount 为 0（本就无条目）不显示空态——
 * 「全部已看过」的文案只在确有隐藏事实（hiddenAtMount > 0 或 grid 内有
 * display:none 卡）时成立。
 */

import { t } from '@/entrypoints/content/i18n'
import { escapeHtml } from '@/utils/escape-html'

const EMPTY_CLASS = 'umm-sht-empty'

/**
 * 空态判定（纯函数，JSDOM 可测）。
 *
 * 真值表：
 *   - hide OFF → 恒 false（dim 卡仍可见，页面不空）；
 *   - 任一渲染卡可见（无 display:none）→ false；
 *   - 全部渲染卡 display:none（或 grid 为空）且 hiddenAtMount > 0 → true；
 *   - 全部渲染卡 display:none 且 hiddenAtMount = 0 → true（运行时切换全隐）；
 *   - grid 为空且 hiddenAtMount = 0 → false（空版块 / 骨架期，非「已看」语义）。
 */
export function isEmptyHiddenState(grid: HTMLElement, hideOn: boolean, hiddenAtMount: number): boolean {
  if (!hideOn) return false
  let visibleRendered = 0
  let hiddenRendered = 0
  // 骨架卡（.umm-sht-skel）是检查期占位，不计入可见/隐藏事实。
  for (const card of Array.from(grid.querySelectorAll('.umm-card:not(.umm-sht-skel)')) as HTMLElement[]) {
    if (card.style.display === 'none') hiddenRendered++
    else visibleRendered++
  }
  if (visibleRendered > 0) return false
  return hiddenRendered > 0 || hiddenAtMount > 0
}

/**
 * 空态节点构建（doc 显式传参，JSDOM 可测）。
 *
 * 视觉：徽章圆 + eye-off 线稿（斜杠用 accent 色点出「已隐藏」语义）+ 飘浮
 * 装饰点；全部消费 --usl-* 令牌（内联 SVG 在 shadow DOM 内继承 :host 变量，
 * 双主题自适应，零调色板色值）。文本 = 图下双行：标题 + 提示（role="status"
 * 供读屏播报）。
 */
export function buildEmptyState(doc: Document): HTMLElement {
  const root = doc.createElement('div')
  root.className = EMPTY_CLASS
  root.setAttribute('role', 'status')
  root.innerHTML = `
    <svg viewBox="0 0 120 120" fill="none" aria-hidden="true" focusable="false">
      <circle cx="14" cy="22" r="4" fill="var(--usl-border-strong)"/>
      <circle cx="106" cy="96" r="5" fill="var(--usl-border-strong)"/>
      <circle cx="60" cy="60" r="50" fill="var(--usl-surface-hover)"/>
      <path d="M32 60 C 42 45, 78 45, 88 60 C 78 75, 42 75, 32 60 Z" stroke="var(--usl-text-secondary)" stroke-width="4" stroke-linejoin="round"/>
      <circle cx="60" cy="60" r="9" stroke="var(--usl-text-secondary)" stroke-width="4"/>
      <line x1="36" y1="84" x2="84" y2="36" stroke="var(--usl-accent)" stroke-width="4.5" stroke-linecap="round"/>
    </svg>
    <p class="umm-sht-empty-title">${escapeHtml(t('sht.empty_watched_title'))}</p>
    <p class="umm-sht-empty-hint">${escapeHtml(t('sht.empty_watched_hint'))}</p>
  `
  return root
}

/**
 * 空态挂/撤（幂等）：shell 内至多一个 .umm-sht-empty，状态翻转时增删。
 * shell 为 null（页面生命周期外/非法页兜底路径）直接跳过。
 */
export function syncEmptyHiddenState(shell: HTMLElement | null, grid: HTMLElement, hiddenAtMount: number): void {
  if (!shell) return
  const hideOn = grid.classList.contains('umm-sht-hide-viewed')
  const existing = shell.querySelector(`:scope > .${EMPTY_CLASS}`) as HTMLElement | null
  if (isEmptyHiddenState(grid, hideOn, hiddenAtMount)) {
    if (!existing) shell.appendChild(buildEmptyState(shell.ownerDocument))
  } else {
    existing?.remove()
  }
}
