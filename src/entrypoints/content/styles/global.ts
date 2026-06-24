/**
 * 全局样式注入模块
 * 功能：为所有 UMM UI 组件注入统一的样式，应用油猴脚本的渐变色方案
 */

import {
  COLOR_PRIMARY_START, COLOR_PRIMARY_END, COLOR_PRIMARY_SHADOW, COLOR_PRIMARY_SHADOW_HOVER, COLOR_PRIMARY_SHADOW_ACTIVE,
  COLOR_DONE_START, COLOR_DONE_END, COLOR_DONE_TEXT, COLOR_DONE_BORDER, COLOR_DONE_SHADOW,
  COLOR_NONE_START, COLOR_NONE_END, COLOR_NONE_TEXT, COLOR_NONE_BORDER, COLOR_NONE_SHADOW,
  COLOR_MINUS_START, COLOR_MINUS_END, COLOR_MINUS_SHADOW,
  COLOR_PLUS_START, COLOR_PLUS_END, COLOR_PLUS_SHADOW,
  COLOR_ORIGINAL_START, COLOR_ORIGINAL_END, COLOR_ORIGINAL_SHADOW,
  COLOR_NEOGLOW_BASE, COLOR_NEOGLOW_BRIGHT, COLOR_NEOGLOW_SHADOW_1, COLOR_NEOGLOW_SHADOW_2, COLOR_NEOGLOW_SHADOW_3,
  COLOR_CHIP_SHADOW, COLOR_CHIP_SHADOW_HOVER, COLOR_CHIP_BORDER,
  COLOR_RATING_BG, COLOR_RATING_TEXT,
} from './tokens'

/**
 * 搜索徽章样式
 * 配色对比度验证（WCAG AA 标准 ≥ 4.5:1）:
 * - Primary Blue + White: 8.5:1 ✅
 * - Success Green + White: 7.8:1 ✅
 * - Danger Red + White: 6.2:1 ✅
 */
const SEARCH_BADGE_STYLES = `
.umm-search-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  margin-left: 8px;
  font-size: 12px;
  font-weight: 600;
  border-radius: 12px;
  background: linear-gradient(180deg, ${COLOR_PRIMARY_START} 0%, ${COLOR_PRIMARY_END} 100%);
  color: white;
  box-shadow: 0 2px 4px ${COLOR_PRIMARY_SHADOW};
  transition: all 0.2s ease;
  cursor: default;
  user-select: none;
}

.umm-search-badge[data-status="done"] {
  background: linear-gradient(180deg, ${COLOR_DONE_START}, ${COLOR_DONE_END});
  box-shadow: 0 2px 4px ${COLOR_DONE_SHADOW};
}

.umm-search-badge[data-status="none"] {
  background: linear-gradient(180deg, ${COLOR_NONE_START}, ${COLOR_NONE_END});
  box-shadow: 0 2px 4px ${COLOR_NONE_SHADOW};
}

.umm-search-badge:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
}
`

/**
 * 状态标签样式（详情页）
 */
const STATUS_CHIP_STYLES = `
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
  color: ${COLOR_DONE_TEXT} !important;
  background: linear-gradient(180deg, ${COLOR_DONE_START}, ${COLOR_DONE_END}) !important;
  border-color: ${COLOR_DONE_BORDER} !important;
}
.umm-status-chip[data-status="none"] {
  color: ${COLOR_NONE_TEXT} !important;
  background: linear-gradient(180deg, ${COLOR_NONE_START}, ${COLOR_NONE_END}) !important;
  border-color: ${COLOR_NONE_BORDER} !important;
}
.umm-status-chip .umm-label {
  font-weight: 700;
}
.umm-status-chip .umm-rating {
  padding: 2px 8px;
  border-radius: 999px;
  background: ${COLOR_RATING_BG} !important;
  color: ${COLOR_RATING_TEXT} !important;
  font-weight: 800;
  text-shadow: none;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  -webkit-text-fill-color: ${COLOR_RATING_TEXT};
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
 * NeoDB 推送按钮样式
 */
const NEODB_BUTTON_STYLES = `
.umm-neodb-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  margin: 4px 8px 4px 0;
  font-size: 13px;
  font-weight: 700;
  border: none;
  border-radius: 8px;
  background: linear-gradient(180deg, ${COLOR_PRIMARY_START} 0%, ${COLOR_PRIMARY_END} 100%);
  color: white;
  box-shadow: 0 3px 6px ${COLOR_PRIMARY_SHADOW_ACTIVE};
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
  position: relative;
  z-index: 1;
}
.umm-neodb-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 12px ${COLOR_PRIMARY_SHADOW_HOVER};
}
.umm-neodb-btn:active {
  transform: translateY(0);
  box-shadow: 0 2px 4px ${COLOR_PRIMARY_SHADOW};
}
.umm-neodb-btn--minus {
  background: linear-gradient(180deg, ${COLOR_MINUS_START} 0%, ${COLOR_MINUS_END} 100%);
  box-shadow: 0 3px 6px ${COLOR_MINUS_SHADOW};
}
.umm-neodb-btn--plus {
  background: linear-gradient(180deg, ${COLOR_PLUS_START} 0%, ${COLOR_PLUS_END} 100%);
  box-shadow: 0 3px 6px ${COLOR_PLUS_SHADOW};
}
.umm-neodb-btn--original {
  background: linear-gradient(180deg, ${COLOR_ORIGINAL_START} 0%, ${COLOR_ORIGINAL_END} 100%);
  box-shadow: 0 3px 6px ${COLOR_ORIGINAL_SHADOW};
}
.umm-neodb-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}
.umm-neodb-synced .umm-neodb-watermark {
  animation: umm-neodb-glow 2s ease-in-out 3 alternate;
  animation-fill-mode: forwards;
  color: ${COLOR_NEOGLOW_BASE} !important;
  text-shadow:
    0 0 10px ${COLOR_NEOGLOW_SHADOW_1},
    0 0 20px ${COLOR_NEOGLOW_SHADOW_2},
    0 0 30px ${COLOR_NEOGLOW_SHADOW_3} !important;
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
`

/**
 * 暗化效果样式（用于 Mukaku 和 PT 站点）
 */
const DIMMER_STYLES = `
.umm-dimmed {
  transition: opacity 180ms ease;
  opacity: 0.34;
}

.umm-dimmed:hover {
  opacity: 1;
}
`

/**
 * 首页徽章样式
 */
const HOMEPAGE_BADGE_STYLES = `
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
  background: linear-gradient(180deg, ${COLOR_DONE_START}, ${COLOR_DONE_END});
  color: ${COLOR_DONE_TEXT};
  border: 1px solid ${COLOR_DONE_BORDER};
}
.umm-homepage-badge[data-status="none"] {
  background: linear-gradient(180deg, ${COLOR_NONE_START}, ${COLOR_NONE_END});
  color: ${COLOR_NONE_TEXT};
  border: 1px solid ${COLOR_NONE_BORDER};
}
`

/**
 * 共享UI组件样式（用于content/ui/*.ts的panel/modal）
 */
const UI_COMPONENT_STYLES = `
/* 深色面板容器 */
.umm-panel {
  background: #1e1e1e;
  border: 1px solid #333;
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
}
/* 遮罩层 */
.umm-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.7);
  z-index: 9999;
  display: flex;
  justify-content: center;
  align-items: center;
}
/* 强调色标题 */
.umm-panel-title {
  margin: 0;
  color: #03dac6;
  text-align: center;
}
/* 深色输入框 */
.umm-input {
  background: #2a2a2a;
  border: 1px solid #444;
  color: white;
  padding: 10px;
  border-radius: 6px;
  outline: none;
  width: 100%;
  box-sizing: border-box;
}
.umm-input:focus {
  border-color: #03dac6;
}
/* 操作按钮 */
.umm-btn {
  padding: 8px 16px;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  font-weight: bold;
}
.umm-btn--primary {
  background: #03dac6;
  color: #000;
}
.umm-btn--secondary {
  background: #444;
  color: #ccc;
}
/* 标签文字 */
.umm-label-text {
  font-size: 0.9rem;
  color: #aaa;
}
/* 弹性布局 */
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
`

/**
 * 所有样式的集合
 */
const ALL_STYLES = `
${SEARCH_BADGE_STYLES}
${STATUS_CHIP_STYLES}
${NEODB_BUTTON_STYLES}
${DIMMER_STYLES}
${HOMEPAGE_BADGE_STYLES}
${UI_COMPONENT_STYLES}
`

/**
 * 注入全局样式
 */
export function injectGlobalStyles(): void {
  // 检查是否已注入
  if (document.getElementById('umm-global-styles')) {
    return
  }
  
  const styleElement = document.createElement('style')
  styleElement.id = 'umm-global-styles'
  styleElement.textContent = ALL_STYLES
  
  document.head.appendChild(styleElement)
  
  console.log('[UMM] Global styles injected successfully')
}

/**
 * 动态添加样式规则
 */
export function addStyleRule(selector: string, rules: string): void {
  const styleElement = document.getElementById('umm-global-styles') as HTMLStyleElement
  if (!styleElement || !styleElement.sheet) {
    console.warn('[UMM] Global styles not found, cannot add rule')
    return
  }
  
  try {
    styleElement.sheet.insertRule(`${selector} { ${rules} }`, styleElement.sheet.cssRules.length)
  } catch (error) {
    console.error('[UMM] Failed to add style rule:', error)
  }
}
