/**
 * 徽章/状态样式块（自 global.ts 拆出，2026-09-25）。
 *
 * 职责：搜索徽章、状态 chip、列表状态、影评徽章 —— 均消费 `var(--usl-*)` 语义令牌，
 * 零调色板字面量、零主题分支（暗色由 THEME_VARS_DARK 翻转变量实现，见 global.ts）。
 *
 * 组合入口仍是 global.ts 的 ALL_STYLES（顺序：主题变量表必须最先）。
 */

import {
  COLOR_CHIP_SHADOW,
  COLOR_CHIP_SHADOW_HOVER,
  COLOR_CHIP_BORDER,
} from './tokens'

/**
 * Search badge styles
 */
export const SEARCH_BADGE_STYLES = `
.umm-search-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  margin-left: 8px;
  font-size: 12px;
  font-weight: 600;
  border-radius: 12px;
  background: var(--usl-fill-primary);
  color: var(--usl-ink-on-fill);
  box-shadow: var(--usl-shadow-primary);
  transition: all 0.2s ease;
  cursor: default;
  user-select: none;
}

.umm-search-badge[data-status="done"] {
  background: var(--usl-fill-done);
  color: var(--usl-ink-done);
  box-shadow: var(--usl-shadow-done);
}

.umm-search-badge[data-status="none"] {
  background: var(--usl-fill-none);
  color: var(--usl-ink-none);
  box-shadow: var(--usl-shadow-none);
}

.umm-search-badge[data-status="wish"] {
  background: var(--usl-fill-wish);
  color: var(--usl-ink-wish);
  box-shadow: var(--usl-shadow-wish);
}

.umm-search-badge[data-status="doing"] {
  background: var(--usl-fill-doing);
  color: var(--usl-ink-doing);
  box-shadow: var(--usl-shadow-doing);
}

.umm-search-badge:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
}
`

/**
 * Status label styles (detail pages)
 */
export const STATUS_CHIP_STYLES = `
.umm-status-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 650;
  line-height: 1.35;
  border: 1px solid ${COLOR_CHIP_BORDER};
  box-shadow: 0 10px 24px ${COLOR_CHIP_SHADOW};
  max-width: 100%;
  box-sizing: border-box;
  position: relative;
  isolation: isolate;
  mix-blend-mode: normal;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.24);
  -webkit-text-fill-color: currentColor;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.umm-status-chip,
.umm-status-chip > span,
.umm-status-chip > strong,
.umm-status-chip > small {
  color: inherit !important;
  -webkit-text-fill-color: currentColor !important;
}
.umm-status-chip[data-status="done"] {
  color: var(--usl-ink-done) !important;
  background: var(--usl-fill-done) !important;
  border-color: var(--usl-border-done) !important;
}
.umm-status-chip[data-status="none"] {
  color: var(--usl-ink-none) !important;
  background: var(--usl-fill-none) !important;
  border-color: var(--usl-border-none) !important;
}
.umm-status-chip[data-status="wish"] {
  color: var(--usl-ink-wish) !important;
  background: var(--usl-fill-wish) !important;
  border-color: var(--usl-border-wish) !important;
}
.umm-status-chip[data-status="doing"] {
  color: var(--usl-ink-doing) !important;
  background: var(--usl-fill-doing) !important;
  border-color: var(--usl-border-doing) !important;
}
.umm-status-chip .umm-label {
  font-weight: 700;
}
.umm-status-chip .umm-rating {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--usl-rating-bg) !important;
  color: var(--usl-rating-ink) !important;
  font-weight: 800;
  text-shadow: none;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  -webkit-text-fill-color: var(--usl-rating-ink);
}
.umm-status-chip .umm-note {
  font-size: 12px;
  font-weight: 600;
  color: inherit !important;
  opacity: 0.92;
  -webkit-text-fill-color: currentColor;
}
.umm-status-chip:hover {
  transform: translateY(-2px) scale(1.02);
  box-shadow: 0 14px 32px ${COLOR_CHIP_SHADOW_HOVER} !important;
}
`

/**
 * List-page status marker styles (Bangumi browse lists, etc.)
 */
export const LIST_STATUS_STYLES = `
.umm-list-status {
  display: inline-block;
  margin: 4px 0 0;
  padding: 1px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 650;
  line-height: 1.7;
  vertical-align: middle;
}
.umm-list-status[data-status="done"] {
  background: var(--usl-fill-done);
  color: var(--usl-ink-done);
  box-shadow: var(--usl-shadow-done);
}
.umm-list-status[data-status="none"] {
  background: var(--usl-fill-none);
  color: var(--usl-ink-none);
  box-shadow: var(--usl-shadow-none);
}
.umm-list-status[data-status="wish"] {
  background: var(--usl-fill-wish);
  color: var(--usl-ink-wish);
  box-shadow: var(--usl-shadow-wish);
}
.umm-list-status[data-status="doing"] {
  background: var(--usl-fill-doing);
  color: var(--usl-ink-doing);
  box-shadow: var(--usl-shadow-doing);
}
.umm-list-status .umm-rating {
  background: var(--usl-rating-bg);
  color: var(--usl-rating-ink);
  padding: 0 6px;
  border-radius: 999px;
  font-weight: 800;
}
`

/**
 * Review-page status badge styles
 * Ink declared via semantic vars — no rule-order reliance
 */
export const REVIEWS_BADGE_STYLES = `
.umm-status {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 4px 10px;
  font-size: var(--umm-font-xs, 11px);
  font-weight: 700;
  border-radius: var(--umm-radius-lg, 12px);
  user-select: none;
  letter-spacing: 0.04em;
  box-shadow:
    0 2px 4px rgba(0, 0, 0, 0.15),
    0 1px 0 rgba(255, 255, 255, 0.2) inset;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  color: var(--usl-ink-on-fill);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
  line-height: 1.3;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  box-sizing: border-box;
  min-height: 22px;
  text-transform: none;
  cursor: default;
}

.umm-status--small {
  padding: 2px 8px;
  font-size: var(--umm-font-xs, 11px);
  gap: 3px;
  min-height: 18px;
  max-width: 100px;
}

.umm-status--done {
  background: var(--usl-fill-done);
  color: var(--usl-ink-done);
  border: 1px solid var(--usl-border-done);
}

.umm-status--none {
  background: var(--usl-fill-none);
  color: var(--usl-ink-none);
  border: 1px solid var(--usl-border-none);
}

.umm-status--wish {
  background: var(--usl-fill-wish);
  color: var(--usl-ink-wish);
  border: 1px solid var(--usl-border-wish);
  text-shadow: none;
}

.umm-status--doing {
  background: var(--usl-fill-doing);
  color: var(--usl-ink-doing);
  border: 1px solid var(--usl-border-doing);
}
`
