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
/* 底部「灵动岛」悬浮栏（buildFloatbar 统一合成）挂载于列表/首页/搜索页；
   遮挡补偿 padding 作用任何挂岛页面（.umm-sht-shell--island），风控页无岛
   不多留白。72px = 标准浮岛高度 + 上下安全间距（实测浮岛占位；
   safe-area-inset 兼容 iOS 手势区）。 */
.umm-sht-shell--island { padding-bottom: calc(72px + env(safe-area-inset-bottom, 0px)); }
.umm-preview-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr)); gap: clamp(14px, 2vw, 25px); padding: clamp(14px, 2.5vw, 28px); background: var(--usl-surface); transition: background-color 0.3s ease; }
.umm-card { background: var(--usl-surface-raised); border-radius: 12px; border: 1px solid var(--usl-border); overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 4px 15px rgba(0,0,0,0.25); transition: transform 0.3s ease, box-shadow 0.3s ease, background-color 0.3s ease, border-color 0.3s ease, opacity 0.18s ease; }
.umm-card:hover { transform: translateY(-4px); box-shadow: 0 10px 24px rgba(0,0,0,0.32); }
/* dimmer 只改 opacity（过渡并入基类过渡表——原写法用 transition 整条覆盖，
   会顺带杀死悬停位移/阴影动效，且切换时过渡表突变）；180ms 比 300ms 跟手感更好。 */
.umm-card.umm-viewed { opacity: 0.5; }
.umm-card.umm-viewed:hover { opacity: 1; }
/* 批量上色免过渡（withDimBatch 单帧挂类）：几十张卡同帧落类不各播过渡，
   避免「首屏 dim 慢」的长尾动画；撤销后单卡过渡照旧。 */
.umm-sht-dim-batch .umm-card, .umm-sht-dim-batch .umm-card .umm-card-image img { transition: none; }
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
  /* 紧凑化：纵向留白与区域间距收紧（header 双行 + 岛内组件共用基准），
     上下行间距与组件间隙同源 --sht-gap，消除区域间观感差异。 */
  --sht-pad-y: clamp(6px, 0.9vw, 12px);
  --sht-gap: clamp(6px, 1vw, 12px);
  --sht-font-caption: clamp(0.72rem, 0.68rem + 0.2vw, 0.875rem);
  --sht-font-body: clamp(0.8rem, 0.75rem + 0.25vw, 0.9375rem);
}
.umm-sehuatang-header { position: sticky; top: 0; z-index: 50; display: flex; flex-direction: column; gap: var(--sht-gap); padding: var(--sht-pad-y) var(--sht-pad-x); background: var(--usl-surface); border-bottom: 1px solid var(--usl-border); color: var(--usl-text-primary); transition: background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease; }
.umm-sht-row { display: flex; align-items: center; flex-wrap: wrap; gap: var(--sht-gap); min-width: 0; }
/* 上行三列网格：[左 1fr | 中 auto（top center 簇：🏠 + ☰）| 右 1fr]——
   真正的水平居中（space-between 只是等距近似）；子项 min-width:0 允许长
   文本换行不断列，末列靠右。 */
.umm-sht-row--context { display: grid; grid-template-columns: 1fr auto 1fr; }
.umm-sht-row--context > * { min-width: 0; }
.umm-sht-row--context > :last-child { justify-self: end; }
/* 顶部居中簇（首页 / 菜单按钮；三列网格的中列）。 */
.umm-sht-center { display: flex; align-items: center; justify-content: center; gap: 6px; }
.umm-sht-row--nav { justify-content: space-between; }
/* 右上角统计区：两个 box div —— 本页状态（.umm-header-info）+ 全局三段
   （.umm-sht-stats）；margin-left:auto 把整组推到 header 右上角（窄屏随
   row 的 flex-wrap 整组换行）。 */
.umm-sht-stat-area { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin-left: auto; min-width: 0; }
.umm-header-info, .umm-sht-stats { display: inline-flex; align-items: center; padding: 3px 10px; border-radius: 8px; border: 1px solid var(--usl-border); background: var(--usl-surface-raised); color: var(--usl-text-muted); font-size: var(--sht-font-caption); font-weight: 500; white-space: nowrap; }
/* 左侧上下文文本（搜索页结果计数 + 过滤注记 / 首页站点统计；非 box）。 */
.umm-sht-context { color: var(--usl-text-muted); font-size: var(--sht-font-caption); font-weight: 500; min-width: 0; }
.umm-sht-breadcrumb { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; font-size: var(--sht-font-caption); min-width: 0; }
.umm-sht-crumb { color: var(--usl-accent); text-decoration: none; transition: color 0.15s ease; }
.umm-sht-crumb:hover { color: var(--usl-text-primary); text-decoration: underline; }
.umm-sht-crumb--current { color: var(--usl-text-secondary); font-weight: 600; }
.umm-sht-crumb-sep { color: var(--usl-text-muted); opacity: 0.6; }
.umm-sht-tabs { display: flex; flex: 1 1 auto; min-width: 0; gap: 8px; overflow-x: auto; scrollbar-width: thin; }
.umm-sht-tab { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 999px; border: 1px solid var(--usl-border-strong); background: var(--usl-surface-raised); color: var(--usl-text-secondary); text-decoration: none; font-size: var(--sht-font-body); transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease; }
.umm-sht-tab:hover { border-color: var(--usl-accent); color: var(--usl-text-primary); }
.umm-sht-tab--active { background: var(--usl-fill-primary); border-color: transparent; color: var(--usl-ink-on-fill); font-weight: 700; }
.umm-sht-tab-count { font-size: var(--sht-font-caption); color: var(--usl-text-muted); background: var(--usl-surface-hover); border-radius: 999px; padding: 1px 8px; transition: background-color 0.15s ease, color 0.15s ease; }
.umm-sht-tab--active .umm-sht-tab-count { color: var(--usl-ink-on-fill); background: rgba(255, 255, 255, 0.22); }
.umm-copy-btn { background: var(--usl-fill-primary); color: var(--usl-ink-on-fill); border: none; padding: 5px 14px; border-radius: 8px; cursor: pointer; font-weight: 700; font-size: var(--sht-font-body); box-shadow: var(--usl-shadow-primary); transition: opacity 0.15s ease, background-color 0.3s ease, color 0.3s ease, box-shadow 0.3s ease; }
.umm-copy-btn:not(:disabled):hover { opacity: 0.92; }
.umm-copy-btn:disabled { background: var(--usl-surface-hover); color: var(--usl-text-muted); box-shadow: none; cursor: default; }
.umm-sht-action { display: inline-flex; align-items: center; height: 28px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--usl-border-strong); background: var(--usl-surface-raised); color: var(--usl-text-secondary); font-size: var(--sht-font-body); cursor: pointer; text-decoration: none; transition: border-color 0.15s ease, color 0.15s ease, background-color 0.3s ease; }
.umm-sht-action:hover { border-color: var(--usl-accent); color: var(--usl-text-primary); }
.umm-sht-searchbox { display: flex; align-items: center; gap: 6px; flex: 0 1 auto; min-width: 0; }
.umm-sht-search-input { width: clamp(110px, 15vw, 220px); height: 28px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--usl-border-strong); background: var(--usl-surface); color: var(--usl-text-primary); font-size: var(--sht-font-body); transition: border-color 0.15s ease, background-color 0.3s ease, color 0.3s ease; }
.umm-sht-search-input::placeholder { color: var(--usl-text-muted); }
.umm-sht-search-input:focus { outline: none; border-color: var(--usl-accent); }
.umm-sht-search-btn { padding: 0 10px; }
.umm-sht-pager { display: flex; align-items: center; gap: 6px; font-size: var(--sht-font-body); color: var(--usl-text-secondary); }
.umm-sht-pg-nav, .umm-sht-pg-page { display: inline-flex; align-items: center; justify-content: center; min-width: 28px; height: 28px; padding: 0 8px; border-radius: 8px; border: 1px solid var(--usl-border-strong); background: var(--usl-surface-raised); color: var(--usl-text-secondary); text-decoration: none; transition: border-color 0.15s ease, color 0.15s ease, background-color 0.3s ease; }
.umm-sht-pg-nav:hover, .umm-sht-pg-page:hover { border-color: var(--usl-accent); color: var(--usl-text-primary); }
.umm-sht-pg-nav--disabled { opacity: 0.4; pointer-events: none; }
.umm-sht-pg-page--current { background: var(--usl-fill-primary); border-color: transparent; color: var(--usl-ink-on-fill); font-weight: 700; }
.umm-sht-pg-gap { color: var(--usl-text-muted); padding: 0 2px; }
.umm-sht-pg-jump { width: 46px; height: 28px; border-radius: 8px; border: 1px solid var(--usl-border-strong); background: var(--usl-surface); color: var(--usl-text-primary); text-align: center; font-size: var(--sht-font-body); transition: border-color 0.15s ease, background-color 0.3s ease, color 0.3s ease; }
.umm-sht-pg-jump:focus { outline: none; border-color: var(--usl-accent); }
.umm-sht-pg-total { color: var(--usl-text-muted); font-size: var(--sht-font-caption); white-space: nowrap; }
/* overflow-x: clip（而非 auto）——auto 会把 overflow-y 隐式提升为 auto，令岛
   变成双向滚动容器、裁切摩天轮上下滚动的两舱；clip 不触发提升，纵向溢出不裁切
   （横向兜底仍为裁切，窄屏页数压缩由 ≤640px 规则负责）。 */
.umm-sht-floatbar { position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 6px; padding: 6px clamp(10px, 1.5vw, 14px); border-radius: 999px; background: color-mix(in srgb, var(--usl-surface) 88%, transparent); border: 1px solid var(--usl-border); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25); backdrop-filter: blur(12px); z-index: 2147483000; max-width: 96vw; overflow-x: clip; transition: background-color 0.3s ease, border-color 0.3s ease; }
/* 岛内控件统一胶囊圆角：与胶囊形岛体外形收敛（消除「方控件嵌圆岛」的不协调）。 */
.umm-sht-floatbar .umm-sht-action, .umm-sht-floatbar .umm-sht-search-input, .umm-sht-floatbar .umm-sht-pg-nav, .umm-sht-floatbar .umm-sht-pg-page, .umm-sht-floatbar .umm-sht-pg-jump { border-radius: 999px; }
/* 岛内分页组收紧（页码串更长，窄屏优先保页码与 ‹ › 图标）。 */
.umm-sht-floatbar .umm-sht-pager { flex-wrap: nowrap; gap: 4px; }
/* 岛内键盘焦点环（岛悬浮于内容之上，默认 outline 易被裁切）。 */
.umm-sht-floatbar :focus-visible { outline: 2px solid var(--usl-accent); outline-offset: 2px; }
/* 岛内搜索框：静息收窄（搜索 + 分页同排 96vw 预算内不溢出）；focus 动效
   自适应——宽度平滑展开至输入舒适区，blur 收回。 */
.umm-sht-floatbar .umm-sht-search-input { width: clamp(96px, 12vw, 160px); transition: width 0.25s ease, border-color 0.15s ease, background-color 0.3s ease; }
.umm-sht-floatbar .umm-sht-search-input:focus { width: clamp(140px, 26vw, 240px); }
/* 摩天轮舞台：搜索舱恒上、分页舱恒下（data-umm-slot 唯一决定位置）——切换时
   一舱滚出、另一舱滚入，单次赋值即完成方向正确的过渡；隐藏舱 absolute 不占位，
   并置 visibility:hidden（不可聚焦/读屏不可达；延迟到淡出结束才生效，不打断动画）。
   min-width 让两舱宽度差异收敛、切换时岛宽跳变变小。 */
.umm-sht-island-stage { position: relative; display: flex; align-items: center; justify-content: center; min-width: clamp(172px, 26vw, 240px); }
.umm-sht-island-stage > * { transition: opacity 0.28s ease, transform 0.38s cubic-bezier(0.34, 1.3, 0.64, 1); }
.umm-sht-island-stage > [data-umm-slot="active"] { position: relative; visibility: visible; opacity: 1; transform: translateY(0) scale(1); transition: opacity 0.28s ease, transform 0.38s cubic-bezier(0.34, 1.3, 0.64, 1), visibility 0s linear 0s; }
/* 隐藏舱用 inset:0 铺满同一舱位 + 内部 flex 居中——几何与激活舱完全一致
   （relative ↔ absolute 不可动画，若用 left/top 锚定会在切换瞬间跳位）。 */
.umm-sht-island-stage > [data-umm-slot="hidden-up"] { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; visibility: hidden; opacity: 0; transform: translateY(-140%) scale(0.9); pointer-events: none; transition: opacity 0.28s ease, transform 0.38s cubic-bezier(0.34, 1.3, 0.64, 1), visibility 0s linear 0.38s; }
.umm-sht-island-stage > [data-umm-slot="hidden-down"] { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; visibility: hidden; opacity: 0; transform: translateY(140%) scale(0.9); pointer-events: none; transition: opacity 0.28s ease, transform 0.38s cubic-bezier(0.34, 1.3, 0.64, 1), visibility 0s linear 0.38s; }
/* 轮替控件：⇅ 一键在两舱之间轮替。 */
.umm-sht-island-switch { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; padding: 0; border-radius: 999px; border: 1px solid var(--usl-border-strong); background: var(--usl-surface-raised); color: var(--usl-text-secondary); font-size: var(--sht-font-body); cursor: pointer; transition: border-color 0.15s ease, color 0.15s ease; }
.umm-sht-island-switch:hover { border-color: var(--usl-accent); color: var(--usl-text-primary); }
@media (prefers-reduced-motion: reduce) {
  .umm-sht-island-stage > * { transition: none; }
}
/* 窄屏防溢出：计数器与跳转输入是岛内最宽的非关键项，≤640px 隐藏（页码 +
   ‹ › 上下页图标保留，导航能力不降级）；横向裁切（overflow-x: clip）仅作
   最后兜底，不引入滚动条。 */
@media (max-width: 640px) {
  .umm-sht-floatbar .umm-sht-pg-total, .umm-sht-floatbar .umm-sht-pg-jump { display: none; }
}
`

/** 动效（原 sehuatang-effects.ts injectEffectsStyles）：模糊揭示 + 已看灰度 + 入场级联 + 悬浮栏入场。 */
export const EFFECTS_CSS = `
.umm-card-image { position: relative; }
.umm-card .umm-card-image img { filter: blur(14px) saturate(0.85); transform: scale(1.08); transition: filter 0.5s cubic-bezier(0.22, 1, 0.36, 1), transform 0.5s cubic-bezier(0.22, 1, 0.36, 1); }
.umm-card:not(.umm-sht-revealed):hover .umm-card-image img { transform: scale(1.08); }
.umm-card.umm-sht-revealed .umm-card-image img { filter: blur(0) saturate(1); transform: scale(1); }
.umm-card.umm-sht-revealed:hover .umm-card-image img { transform: scale(1.05); }
.umm-card.umm-viewed .umm-card-image img { filter: grayscale(55%) saturate(0.45) blur(14px); }
/* 已看态图片过渡缩短（0.5s → 0.22s）：blur/grayscale 的 filter 插值是 dim 动画
   最贵的一段，缩短后批量上色与单卡 dim 都更跟手（揭示动效仍走 0.5s 基类）。 */
.umm-card.umm-viewed .umm-card-image img { transition-duration: 0.22s; }
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
 * 搜索页（pg_search）结果卡片（无封面/无磁力，纯文本条目）。
 *
 * 与列表页 .umm-card 同款视觉语言：hover 浮起、阴影、令牌背景、.umm-viewed
 * dimmer；卡片结构差异：左对齐文本布局（无 16/10 封面占位），标题用
 * h3 > a 直链。「所在版块」字段（"求片问答悬赏区" 等）不提取不渲染——
 * 与原需求「无用的分区的优化自动隐藏」一致。
 */
export const SEARCH_CSS = `
.umm-sht-search-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 360px), 1fr)); gap: clamp(14px, 2vw, 25px); padding: clamp(14px, 2.5vw, 28px); }
.umm-sht-search-card { padding: clamp(12px, 1.6vw, 18px); }
.umm-sht-search-body { display: flex; flex-direction: column; gap: 8px; }
.umm-sht-search-title { margin: 0; font-size: clamp(0.95rem, 0.85rem + 0.35vw, 1.05rem); font-weight: 600; line-height: 1.4; }
.umm-sht-search-title a { color: var(--usl-text-primary); text-decoration: none; transition: color 0.15s ease; }
.umm-sht-search-title a:hover { color: var(--usl-accent); }
.umm-sht-search-meta { margin: 0; color: var(--usl-text-muted); font-size: clamp(0.72rem, 0.68rem + 0.2vw, 0.8rem); }
.umm-sht-search-preview { margin: 0; color: var(--usl-text-secondary); font-size: clamp(0.78rem, 0.73rem + 0.22vw, 0.86rem); font-style: italic; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.umm-sht-search-foot { margin: 0; display: flex; flex-wrap: wrap; gap: 4px 12px; color: var(--usl-text-muted); font-size: clamp(0.7rem, 0.65rem + 0.2vw, 0.78rem); }
.umm-sht-search-when { font-variant-numeric: tabular-nums; }
.umm-sht-search-author { color: var(--usl-text-secondary); }
`

/**
 * 首页（pg_index）分区网格（list-style 分组 + 子版块卡片）。
 *
 * 与列表页 .umm-card 同款视觉语言（hover 浮起、阴影、令牌背景），但更轻量
 * （无封面、无磁力、不可 dimmer——子版块是导航，不是观看记录载体）。
 * 卡片 a 链接充当整卡可点击区（覆盖图标/名称/meta/最后发表），省去逐行
 * 监听器。
 */
export const HOME_CSS = `
.umm-sht-home-section { display: flex; flex-direction: column; gap: var(--sht-gap, 12px); padding: clamp(10px, 1.4vw, 18px) clamp(14px, 2.5vw, 28px) 0; }
.umm-sht-home-cat { display: flex; align-items: center; gap: 10px; font-size: clamp(0.95rem, 0.9rem + 0.2vw, 1.1rem); font-weight: 700; color: var(--usl-text-primary); padding: 4px 2px; border-bottom: 1px solid var(--usl-border); }
.umm-sht-home-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr)); gap: clamp(10px, 1.4vw, 16px); }
.umm-sht-home-card { padding: 0; }
.umm-sht-home-card .umm-sht-home-link { display: grid; grid-template-columns: 44px 1fr; gap: clamp(10px, 1.4vw, 14px); align-items: flex-start; padding: clamp(10px, 1.4vw, 14px); color: inherit; text-decoration: none; }
.umm-sht-home-icon { display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; border-radius: 10px; background: var(--usl-surface-hover); overflow: hidden; flex-shrink: 0; }
.umm-sht-home-icon img { width: 28px; height: 28px; object-fit: contain; }
.umm-sht-home-icon.is-new { background: var(--usl-fill-wish); }
.umm-sht-home-body { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.umm-sht-home-name { color: var(--usl-text-primary); font-size: clamp(0.85rem, 0.8rem + 0.25vw, 0.95rem); font-weight: 600; line-height: 1.35; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; transition: color 0.15s ease; }
.umm-sht-home-link:hover .umm-sht-home-name { color: var(--usl-accent); }
.umm-sht-home-meta { display: flex; flex-wrap: wrap; gap: 4px 10px; color: var(--usl-text-muted); font-size: clamp(0.7rem, 0.65rem + 0.2vw, 0.78rem); }
.umm-sht-home-pill { display: inline-flex; align-items: center; padding: 1px 8px; border-radius: 999px; background: var(--usl-fill-primary); color: var(--usl-ink-on-fill); font-weight: 700; font-size: clamp(0.68rem, 0.63rem + 0.2vw, 0.74rem); }
.umm-sht-home-last { color: var(--usl-text-muted); font-size: clamp(0.68rem, 0.63rem + 0.2vw, 0.76rem); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`

/**
 * 风控页（年龄门）——任意路径可返回的站点的风控文档，视觉重建（点击委托
 * 原按钮，见 app-risk.ts）。居中单列面板：域名大字 + 主/次进入按钮 +
 * 分隔线 + 警告块。文本全部透传站点原文（中英双语由站点提供，零 i18n 键）。
 */
export const RISK_CSS = `
.umm-sht-shell--risk { align-items: center; justify-content: center; padding: clamp(20px, 4vw, 48px) clamp(16px, 3vw, 32px); }
.umm-sht-risk-panel { width: 100%; max-width: 560px; display: flex; flex-direction: column; }
.umm-sht-risk-domain { text-align: center; font-size: clamp(1.5rem, 1.2rem + 1.2vw, 2rem); font-weight: 900; letter-spacing: 0.04em; color: var(--usl-text-primary); padding: 4px 0 20px; }
.umm-sht-risk-enter { display: block; width: 100%; margin: 0 0 12px; padding: 15px 20px; border-radius: 12px; border: 1px solid transparent; font-size: clamp(1rem, 0.95rem + 0.25vw, 1.15rem); font-weight: 600; line-height: 1.4; text-align: center; cursor: pointer; font-family: inherit; transition: opacity 0.15s ease, border-color 0.15s ease, color 0.15s ease, background-color 0.3s ease; }
.umm-sht-risk-enter--primary { background: var(--usl-fill-primary); color: var(--usl-ink-on-fill); box-shadow: var(--usl-shadow-primary); }
.umm-sht-risk-enter--primary:hover { opacity: 0.92; }
.umm-sht-risk-enter--secondary { background: var(--usl-surface-raised); color: var(--usl-text-secondary); border-color: var(--usl-border-strong); }
.umm-sht-risk-enter--secondary:hover { border-color: var(--usl-accent); color: var(--usl-text-primary); }
.umm-sht-risk-line { height: 1px; background: var(--usl-border); margin: 14px 0; }
.umm-sht-risk-warn-title { margin: 0; text-align: center; font-size: 1rem; font-weight: 700; color: var(--usl-text-primary); padding: 2px 0 8px; }
.umm-sht-risk-warn { margin: 0; padding: 4px 0; text-align: center; line-height: 1.9; font-size: clamp(0.8rem, 0.76rem + 0.2vw, 0.9rem); color: var(--usl-text-secondary); }
`

/**
 * 列表页「全部已看过」空态（hide ON 且无可见条目）：flex:1 撑满 shell 剩余
 * 高度并居中（shell min-height 100%），eye-off 大插图 + 标题/提示双行。
 * 入场动画与骨架/浮岛同款 reduced-motion 守卫。
 */
export const EMPTY_CSS = `
.umm-sht-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: clamp(32px, 6vw, 72px) clamp(16px, 3vw, 32px); text-align: center; animation: umm-sht-empty-in 0.5s cubic-bezier(0.22, 1, 0.36, 1) backwards; }
.umm-sht-empty svg { width: clamp(104px, 22vw, 148px); height: auto; }
.umm-sht-empty-title { margin: 0; color: var(--usl-text-primary); font-size: clamp(1rem, 0.94rem + 0.3vw, 1.15rem); font-weight: 700; }
.umm-sht-empty-hint { margin: 0; color: var(--usl-text-muted); font-size: clamp(0.78rem, 0.74rem + 0.2vw, 0.88rem); }
@keyframes umm-sht-empty-in { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) { .umm-sht-empty { animation: none; } }
`

/**
 * 完整 overlay 样式表：usl 变量（:host 双主题）+ 网格 + 控件 + 动效 + 首页 + 搜索 + 风控 + 空态。
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
/* === home (pg_index) === */
${HOME_CSS}
/* === search (pg_search) === */
${SEARCH_CSS}
/* === risk (age gate) === */
${RISK_CSS}
/* === empty (all watched) === */
${EMPTY_CSS}
`
