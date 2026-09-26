/**
 * 组件与滚动条 chrome 样式块（自 global.ts 拆出，2026-09-25）。
 *
 * 职责：通用面板/按钮/输入等组件块、NeoDB 按钮、dimmer、首页徽章、焦点环、滚动条。
 * 与 badge-styles.ts 的分界是「构件级 chrome」vs「徽章/状态族」，便于按关注点定位。
 *
 * 组合入口仍是 global.ts 的 ALL_STYLES（顺序：主题变量表必须最先）。
 */

import { COLOR_NEOGLOW_BASE, COLOR_NEOGLOW_BRIGHT, COLOR_NEOGLOW_SHADOW_1 } from './tokens';

/**
 * NeoDB push button styles
 * CANONICAL: interest.css owns the Shadow DOM styling; this is the light-DOM twin,
 * values aligned with design-tokens (solid 700-tier fills x white ink, AA).
 */
export const NEODB_BUTTON_STYLES = `
.umm-neodb-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  margin: 4px 8px 4px 0;
  font-size: 13px;
  font-weight: 700;
  border: 1px solid var(--umm-neodb-border, transparent);
  border-radius: 8px;
  background: var(--umm-fill-primary);
  color: var(--umm-ink-on-fill);
  cursor: pointer;
  transition: opacity 0.15s, transform 0.15s;
  user-select: none;
  position: relative;
  z-index: 1;
  font-family: inherit;
  line-height: 1.3;
}
.umm-neodb-btn:hover {
  opacity: 0.85;
  transform: translateY(-1px);
}
.umm-neodb-btn:active {
  transform: translateY(0);
}
.umm-neodb-btn--minus {
  background: var(--umm-neodb-minus);
  color: var(--umm-ink-neodb-minus);
  box-shadow: var(--umm-shadow-neodb-minus);
}
.umm-neodb-btn--plus {
  background: var(--umm-neodb-plus);
  color: var(--umm-ink-neodb-plus);
  box-shadow: var(--umm-shadow-neodb-plus);
}
.umm-neodb-btn--original {
  background: var(--umm-neodb-original);
  color: var(--umm-ink-neodb-original);
  box-shadow: var(--umm-shadow-neodb-original);
}
.umm-neodb-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}
.umm-neodb-synced .umm-neodb-watermark {
  animation: umm-neodb-glow 2s ease-in-out 3 alternate;
  animation-fill-mode: forwards;
  color: var(--umm-neodb-glow-base) !important;
  text-shadow:
    0 0 10px var(--umm-neodb-glow-s1),
    0 0 20px var(--umm-neodb-glow-s2),
    0 0 30px var(--umm-neodb-glow-s3) !important;
}
@keyframes umm-neodb-glow {
  from {
    color: ${COLOR_NEOGLOW_BASE};
    text-shadow: 0 0 10px ${COLOR_NEOGLOW_SHADOW_1};
  }
  to {
    color: ${COLOR_NEOGLOW_BRIGHT};
    text-shadow:
      0 0 15px rgba(52, 211, 153, 0.5),
      0 0 30px rgba(52, 211, 153, 0.35),
      0 0 45px rgba(52, 211, 153, 0.25);
  }
}
@media (prefers-reduced-motion: reduce) {
  .umm-neodb-synced .umm-neodb-watermark {
    animation: none;
  }
}
`;

/**
 * Dimmer styles (Mukaku and PT sites)
 */
export const DIMMER_STYLES = `
.umm-dimmed {
  transition: opacity 180ms ease;
  opacity: 0.34;
}

.umm-dimmed:hover {
  opacity: 1;
}
`;

/**
 * Homepage badge styles
 */
export const HOMEPAGE_BADGE_STYLES = `
.umm-homepage-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  z-index: 10;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  border-radius: 11px;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  color: white;
  pointer-events: none;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
}
.umm-homepage-badge[data-status="done"] {
  background: var(--umm-fill-done);
  color: var(--umm-ink-done);
  border: 1px solid var(--umm-border-done);
}
.umm-homepage-badge[data-status="none"] {
  background: var(--umm-fill-none);
  color: var(--umm-ink-none);
  border: 1px solid var(--umm-border-none);
}
.umm-homepage-badge[data-status="wish"] {
  background: var(--umm-fill-wish);
  color: var(--umm-ink-wish);
  border: 1px solid var(--umm-border-wish);
}
.umm-homepage-badge[data-status="doing"] {
  background: var(--umm-fill-doing);
  color: var(--umm-ink-doing);
  border: 1px solid var(--umm-border-doing);
}
`;

/**
 * Shared UI component styles (for content/ui/*.ts panel/modal)
 */
export const UI_COMPONENT_STYLES = `
.umm-panel {
  background: var(--umm-surface-raised, var(--umm-bg, #ffffff));
  border: 1px solid var(--umm-overlay-border, var(--umm-border, #e3e8f0));
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  transition: background-color 0.3s ease, border-color 0.3s ease, color 0.3s ease;
}
.umm-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.7);
  /* Must clear the sehuatang floating pill (z 2147483000) — modals top everything. */
  z-index: 2147483001;
  display: flex;
  justify-content: center;
  align-items: center;
}
.umm-panel-title {
  margin: 0;
  color: var(--umm-accent, var(--umm-link, #3a55ec));
  text-align: center;
}
.umm-input {
  background: var(--umm-surface, var(--umm-bg-secondary, #f7f9fc));
  border: 1px solid var(--umm-border-strong, var(--umm-border, #e3e8f0));
  color: var(--umm-overlay-text-primary, var(--umm-text-primary, #151a23));
  padding: 10px;
  border-radius: 6px;
  outline: none;
  width: 100%;
  box-sizing: border-box;
  transition: background-color 0.3s ease, border-color 0.3s ease, color 0.3s ease;
}
.umm-input:focus {
  border-color: var(--umm-accent, var(--umm-link, #3a55ec));
}
.umm-btn {
  padding: 8px 16px;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  font-weight: bold;
}
.umm-btn--primary {
  background: var(--umm-fill-primary, var(--umm-link, #3a55ec));
  color: var(--umm-ink-on-fill, var(--umm-bg, #ffffff));
}
.umm-btn--secondary {
  background: var(--umm-surface-hover, var(--umm-bg-secondary, #f7f9fc));
  color: var(--umm-overlay-text-secondary, var(--umm-text-secondary, #4d5870));
}
.umm-label-text {
  font-size: 0.9rem;
  color: var(--umm-overlay-text-muted, var(--umm-text-muted, #94a0b5));
}
.umm-flex-col {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.umm-flex-row {
  display: flex;
  gap: 10px;
}
.umm-flex-end {
  justify-content: flex-end;
}
.umm-mt {
  margin-top: 10px;
}
`;

/**
 * Focus-visible styles (keyboard navigation)
 *
 * ADR-026 D7：本表注入**宿主页面**，故一律以「元素自身的 `umm-` 类」作为作用域。
 * 原实现为裸 `:focus-visible` + `button/a/input/select:focus-visible`，会把焦点环
 * 画到宿主页的按钮、链接、输入框乃至可滚动的 div 上（实测：宿主页 4 类元素全部
 * 命中 2px 实线环）。改后扩展 UI 仍保留焦点环，宿主页不再被改写。
 *
 * 已知残差：扩展给宿主元素打的标记类（`umm-dimmed` / `umm-viewed` / `umm-sht-*` /
 * `umm-neodb-synced`）同样满足 `[class*="umm-"]`——但那些元素本就被扩展有意改写
 * 外观，且均非可聚焦控件，影响可忽略。
 */
export const FOCUS_VISIBLE_STYLES = `
[class*="umm-"]:focus-visible {
  outline: 2px solid var(--umm-accent, var(--umm-link, #3a55ec));
  outline-offset: 2px;
  border-radius: 4px;
}

.umm-dl-trigger:focus-visible,
.umm-pill-btn:focus-visible,
.umm-island-nav-link:focus-visible,
.umm-search-submit:focus-visible,
.umm-island-submit:focus-visible,
.umm-page-link:focus-visible,
.umm-page-go:focus-visible {
  outline: 2px solid var(--umm-link, #3a55ec);
  outline-offset: 2px;
}
`;

/**
 * Scrollbar styles — ADR-026 D7：同样收进 `umm-` 作用域。
 *
 * 原实现为裸 `::-webkit-scrollbar*` + `* { scrollbar-width: thin }`，会把**宿主页
 * 整站**（含 `<html>` 与所有内层滚动容器）的滚动条改成 6px 细条（实测：宿主的
 * 滚动 div 与 `documentElement` 的 `scrollbar-width` 计算值均为 `thin`）。
 * 改后仅扩展自身元素（及其后代）受影响，宿主页恢复原生滚动条。
 */
export const SCROLLBAR_STYLES = `
[class*="umm-"]::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

[class*="umm-"]::-webkit-scrollbar-track {
  background: transparent;
}

[class*="umm-"]::-webkit-scrollbar-thumb {
  background: var(--umm-border, rgba(0, 0, 0, 0.1));
  border-radius: 3px;
}

[class*="umm-"]::-webkit-scrollbar-thumb:hover {
  background: var(--umm-border-hover, rgba(0, 0, 0, 0.2));
}

[class*="umm-"] {
  scrollbar-width: thin;
  scrollbar-color: var(--umm-border, rgba(0, 0, 0, 0.1)) transparent;
}
`;
