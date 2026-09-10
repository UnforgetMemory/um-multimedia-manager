/**
 * 色花堂 overlay Shadow DOM 样式（编译期常量，零运行时拼接）。
 *
 * 收编自原运行时注入的 4 个 style 字符串（sehuatang.ts / controls / effects /
 * menu），并修复 .umm-sht-hide-viewed 运行时规则缺失（菜单 toggle 即时生效）。
 *
 * 令牌：--usl-* 变量在 light DOM 由 global.ts 定义在 html[data-umm-theme] 上，
 * shadow 内不可达——uslVarsForHost() 把同一常量源（THEME_VARS / THEME_VARS_DARK）
 * 重宿主到 :host / :host(.umm-theme--dark)，单一事实源不复制色值。
 * 组件 CSS 只消费 var(--usl-*)，**零调色板色值**（禁止一切 hex 与命名色；
 * ds:check 门禁沿用）。**豁免登记**（新增豁免须在此说明原因）：
 *   1. 纯黑阴影 `rgba(0,0,0,.25/.32)` —— 不受主题翻转影响的物理光效；
 *   2. 图片遮罩 scrim `rgba(18,20,26,.45/.72)` —— 与封面模糊配套的固定观感；
 *   3. 激活态墨叠层 `rgba(255,255,255,.22)`（tab 计数胶囊）—— 叠在
 *      `--usl-fill-primary` 上的提亮层，浅深主题同值；
 *   4. `color-mix(in srgb, var(--usl-surface) 88%, transparent)` —— 令牌派生
 *      alpha（与 douban/styles/detail.css 既有模式一致），非裸色值。
 * 以上四条之外的 hex / 命名色 / 其它 rgba 一律视为违规（sehuatang-styles.spec
 * 有对应守卫）。
 *
 * 注意：本文件是模板字符串常量——注释禁止反引号（见 gotchas：反引号提前
 * 结束模板字符串导致 PARSE_ERROR）。
 */

import { THEME_VARS, THEME_VARS_DARK } from '@/entrypoints/content/styles/global'

/** 把 light-DOM 的 html 作用域变量表重宿主到 shadow :host（单一事实源，零色值复制）。 */
export function uslVarsForHost(): string {
  const light = THEME_VARS.replace(/^\s*html\s*\{/m, ':host {')
  const dark = THEME_VARS_DARK.replace(/html\[data-umm-theme="dark"\]\s*\{/, ':host(.umm-theme--dark) {')
  return `${light}\n${dark}`
}

/** 网格与卡片（原 sehuatang.ts injectStyles）。导出供样式 spec 断言。 */
export const GRID_CSS = `
.umm-sht-shell { display: flex; flex-direction: column; min-height: 100%; background: var(--usl-surface); transition: background-color 0.3s ease; }
.umm-preview-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr)); gap: clamp(14px, 2vw, 25px); padding: clamp(14px, 2.5vw, 28px); background: var(--usl-surface); transition: background-color 0.3s ease; }
.umm-card { background: var(--usl-surface-raised); border-radius: 12px; border: 1px solid var(--usl-border); overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 4px 15px rgba(0,0,0,0.25); transition: transform 0.3s ease, box-shadow 0.3s ease, background-color 0.3s ease, border-color 0.3s ease; }
.umm-card:hover { transform: translateY(-4px); box-shadow: 0 10px 24px rgba(0,0,0,0.32); }
.umm-card.umm-viewed { opacity: 0.5; transition: opacity 0.3s ease; }
.umm-card.umm-viewed:hover { opacity: 1; }
.umm-card-image { aspect-ratio: 16/10; background: var(--usl-surface-hover); overflow: hidden; }
.umm-card-image img { width: 100%; height: 100%; object-fit: cover; cursor: pointer; }
.umm-card-content { padding: clamp(10px, 1.4vw, 15px); display: flex; flex-direction: column; flex-grow: 1; gap: 4px; }
.umm-card-title { margin: 0; }
.umm-card-title a { color: var(--usl-text-primary); text-decoration: none; font-size: clamp(0.95rem, 0.85rem + 0.35vw, 1.05rem); font-weight: 600; transition: color 0.15s ease; }
.umm-card-title a:hover { color: var(--usl-accent); }
.umm-card-meta { margin: 0; color: var(--usl-text-muted); font-size: clamp(0.72rem, 0.68rem + 0.2vw, 0.8rem); }
.umm-card-links { margin-top: auto; display: flex; justify-content: flex-end; gap: 15px; padding-top: 10px; }
.umm-magnet-link { font-size: 1.5rem; padding: 6px 12px; border-radius: 8px; text-decoration: none; background: var(--usl-fill-wish); color: var(--usl-ink-wish); border: 1px solid var(--usl-border-wish); transition: opacity 0.15s ease; }
.umm-magnet-link:hover { opacity: 0.9; }
.umm-magnet-link.umm-sht-copied { animation: umm-sht-copied-pop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1); }
@keyframes umm-sht-copied-pop { 0% { transform: scale(1); } 40% { transform: scale(1.28); filter: brightness(1.35); } 100% { transform: scale(1); } }
/* 骨架卡（hide-viewed 启用时已看检查期间的占位；脉冲动画受 reduced-motion 守卫）。 */
.umm-sht-skel-line { height: 0.9em; border-radius: 6px; background: var(--usl-surface-hover); }
@keyframes umm-sht-skel-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
.umm-card.umm-sht-skel { animation: umm-sht-skel-pulse 1.6s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .umm-card.umm-sht-skel { animation: none; } }
`

/** 控件（原 sehuatang-controls.ts injectControlsStyles）：header 双行 + 面包屑/选项卡/分页/悬浮栏。 */
export const CONTROLS_CSS = `
.umm-sehuatang-header, .umm-sht-floatbar {
  --sht-pad-x: clamp(14px, 2.5vw, 32px);
  --sht-pad-y: clamp(10px, 1.4vw, 18px);
  --sht-gap: clamp(8px, 1.2vw, 16px);
  --sht-font-caption: clamp(0.72rem, 0.68rem + 0.2vw, 0.875rem);
  --sht-font-body: clamp(0.8rem, 0.75rem + 0.25vw, 0.9375rem);
}
.umm-sehuatang-header { position: sticky; top: 0; z-index: 50; display: flex; flex-direction: column; gap: var(--sht-gap); padding: var(--sht-pad-y) var(--sht-pad-x); background: var(--usl-surface); border-bottom: 1px solid var(--usl-border); color: var(--usl-text-primary); transition: background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease; }
.umm-sht-row { display: flex; align-items: center; gap: var(--sht-gap); }
.umm-sht-row--context { justify-content: space-between; }
.umm-sht-row--nav { justify-content: space-between; flex-wrap: wrap; }
.umm-header-info { color: var(--usl-text-muted); font-size: var(--sht-font-caption); white-space: nowrap; }
.umm-sht-breadcrumb { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; font-size: var(--sht-font-caption); }
.umm-sht-crumb { color: var(--usl-accent); text-decoration: none; transition: color 0.15s ease; }
.umm-sht-crumb:hover { color: var(--usl-text-primary); text-decoration: underline; }
.umm-sht-crumb--current { color: var(--usl-text-secondary); font-weight: 600; }
.umm-sht-crumb-sep { color: var(--usl-text-muted); opacity: 0.6; }
.umm-sht-tabs { display: flex; flex-wrap: wrap; gap: 8px; overflow-x: auto; }
.umm-sht-tab { display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; border-radius: 999px; border: 1px solid var(--usl-border-strong); background: var(--usl-surface-raised); color: var(--usl-text-secondary); text-decoration: none; font-size: var(--sht-font-body); transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease; }
.umm-sht-tab:hover { border-color: var(--usl-accent); color: var(--usl-text-primary); }
.umm-sht-tab--active { background: var(--usl-fill-primary); border-color: transparent; color: var(--usl-ink-on-fill); font-weight: 700; }
.umm-sht-tab-count { font-size: var(--sht-font-caption); color: var(--usl-text-muted); background: var(--usl-surface-hover); border-radius: 999px; padding: 1px 8px; transition: background-color 0.15s ease, color 0.15s ease; }
.umm-sht-tab--active .umm-sht-tab-count { color: var(--usl-ink-on-fill); background: rgba(255, 255, 255, 0.22); }
.umm-copy-btn { background: var(--usl-fill-primary); color: var(--usl-ink-on-fill); border: none; padding: 7px 16px; border-radius: 8px; cursor: pointer; font-weight: 700; font-size: var(--sht-font-body); box-shadow: var(--usl-shadow-primary); transition: opacity 0.15s ease, background-color 0.3s ease, color 0.3s ease, box-shadow 0.3s ease; }
.umm-copy-btn:not(:disabled):hover { opacity: 0.92; }
.umm-copy-btn:disabled { background: var(--usl-surface-hover); color: var(--usl-text-muted); box-shadow: none; cursor: default; }
.umm-sht-action { display: inline-flex; align-items: center; height: 30px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--usl-border-strong); background: var(--usl-surface-raised); color: var(--usl-text-secondary); font-size: var(--sht-font-body); cursor: pointer; text-decoration: none; transition: border-color 0.15s ease, color 0.15s ease, background-color 0.3s ease; }
.umm-sht-action:hover { border-color: var(--usl-accent); color: var(--usl-text-primary); }
.umm-sht-pager { display: flex; align-items: center; gap: 6px; font-size: var(--sht-font-body); color: var(--usl-text-secondary); }
.umm-sht-pg-nav, .umm-sht-pg-page { display: inline-flex; align-items: center; justify-content: center; min-width: 30px; height: 30px; padding: 0 8px; border-radius: 8px; border: 1px solid var(--usl-border-strong); background: var(--usl-surface-raised); color: var(--usl-text-secondary); text-decoration: none; transition: border-color 0.15s ease, color 0.15s ease, background-color 0.3s ease; }
.umm-sht-pg-nav:hover, .umm-sht-pg-page:hover { border-color: var(--usl-accent); color: var(--usl-text-primary); }
.umm-sht-pg-nav--disabled { opacity: 0.4; pointer-events: none; }
.umm-sht-pg-page--current { background: var(--usl-fill-primary); border-color: transparent; color: var(--usl-ink-on-fill); font-weight: 700; }
.umm-sht-pg-gap { color: var(--usl-text-muted); padding: 0 2px; }
.umm-sht-pg-jump { width: 46px; height: 30px; border-radius: 8px; border: 1px solid var(--usl-border-strong); background: var(--usl-surface); color: var(--usl-text-primary); text-align: center; font-size: var(--sht-font-body); transition: border-color 0.15s ease, background-color 0.3s ease, color 0.3s ease; }
.umm-sht-pg-jump:focus { outline: none; border-color: var(--usl-accent); }
.umm-sht-pg-total { color: var(--usl-text-muted); font-size: var(--sht-font-caption); white-space: nowrap; }
.umm-sht-floatbar { position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 8px; padding: 8px clamp(10px, 1.6vw, 14px); border-radius: 999px; background: color-mix(in srgb, var(--usl-surface) 88%, transparent); border: 1px solid var(--usl-border); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25); backdrop-filter: blur(12px); z-index: 2147483000; max-width: 96vw; overflow-x: auto; transition: background-color 0.3s ease, border-color 0.3s ease; }
.umm-sht-floatbar .umm-sht-pager { flex-wrap: nowrap; }
`

/** 动效（原 sehuatang-effects.ts injectEffectsStyles）：模糊揭示 + 已看灰度 + 入场级联 + 悬浮栏入场。 */
export const EFFECTS_CSS = `
.umm-card-image { position: relative; }
.umm-card .umm-card-image img { filter: blur(14px) saturate(0.85); transform: scale(1.08); transition: filter 0.5s cubic-bezier(0.22, 1, 0.36, 1), transform 0.5s cubic-bezier(0.22, 1, 0.36, 1); }
.umm-card:not(.umm-sht-revealed):hover .umm-card-image img { transform: scale(1.08); }
.umm-card.umm-sht-revealed .umm-card-image img { filter: blur(0) saturate(1); transform: scale(1); }
.umm-card.umm-sht-revealed:hover .umm-card-image img { transform: scale(1.05); }
.umm-card.umm-viewed .umm-card-image img { filter: grayscale(55%) saturate(0.45) blur(14px); }
.umm-card.umm-viewed.umm-sht-revealed .umm-card-image img { filter: grayscale(0%) saturate(1); }
.umm-card-image::after { content: ""; position: absolute; inset: 0; background: linear-gradient(160deg, rgba(18, 20, 26, 0.45), rgba(18, 20, 26, 0.72)); opacity: 1; transition: opacity 0.5s cubic-bezier(0.22, 1, 0.36, 1); pointer-events: none; }
.umm-card.umm-sht-revealed .umm-card-image::after { opacity: 0; }
@keyframes umm-sht-card-in { from { opacity: 0; transform: translateY(26px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
.umm-card.umm-sht-enter { animation: umm-sht-card-in 0.55s cubic-bezier(0.22, 1.2, 0.36, 1) backwards; }
@keyframes umm-sht-float-in { from { opacity: 0; transform: translate(-50%, 28px) scale(0.92); } to { opacity: 1; transform: translate(-50%, 0) scale(1); } }
.umm-sht-floatbar { animation: umm-sht-float-in 0.65s cubic-bezier(0.34, 1.56, 0.64, 1) backwards; }
@media (prefers-reduced-motion: reduce) {
  .umm-card.umm-sht-enter, .umm-sht-floatbar { animation: none; }
  .umm-card .umm-card-image img, .umm-card-image::after { transition: none; }
  .umm-card { transition: none; }
  .umm-card:hover { transform: none; }
}
`

/**
 * 完整 overlay 样式表：usl 变量（:host 双主题）+ 网格 + 控件 + 动效。
 * 菜单面板样式不进本表——菜单是 light-DOM .umm-overlay 组件（z 高于 overlay
 * host），样式由 global.ts 组件表与 sehuatang-menu.ts 自带注入负责。
 */
export const SEHUATANG_OVERLAY_CSS = `
${uslVarsForHost()}
/* === grid === */
${GRID_CSS}
/* === controls === */
${CONTROLS_CSS}
/* === effects === */
${EFFECTS_CSS}
`
