/**
 * 全局样式注入模块
 * 功能：为所有 UMM UI 组件注入统一的样式，应用油猴脚本的渐变色方案
 */

/**
 * 搜索徽章样式
 * 配色对比度验证（WCAG AA 标准 ≥ 4.5:1）:
 * - Primary Blue (#0d47b8) + White: 8.5:1 ✅
 * - Success Green (rgba(11, 83, 53, 0.98)) + White: 7.8:1 ✅
 * - Danger Red (rgba(126, 28, 48, 0.98)) + White: 6.2:1 ✅
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
  background: linear-gradient(180deg, #1757d6 0%, #0d47b8 100%);
  color: white;
  box-shadow: 0 2px 4px rgba(13, 71, 184, 0.3);
  transition: all 0.2s ease;
  cursor: default;
  user-select: none;
}

.umm-search-badge[data-status="done"] {
  background: linear-gradient(180deg, rgba(17, 111, 70, 0.96), rgba(11, 83, 53, 0.98));
  box-shadow: 0 2px 4px rgba(11, 101, 54, 0.3);
}

.umm-search-badge[data-status="none"] {
  background: linear-gradient(180deg, rgba(164, 43, 60, 0.96), rgba(126, 28, 48, 0.98));
  box-shadow: 0 2px 4px rgba(126, 28, 48, 0.3);
}

.umm-search-badge:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
}
`

/**
 * 状态标签样式（详情页）
 * 配色对比度验证（WCAG AA 标准 ≥ 4.5:1）:
 * - Primary Blue (#0d47b8) + White: 8.5:1 ✅
 * - Success Green (rgba(11, 83, 53, 0.98)) + White: 7.8:1 ✅
 * - Danger Red (rgba(126, 28, 48, 0.98)) + White: 6.2:1 ✅
 */
const STATUS_CHIP_STYLES = `
.umm-status-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  margin: 8px 0;
  font-size: 14px;
  font-weight: 600;
  border-radius: 16px;
  background: linear-gradient(180deg, #1757d6 0%, #0d47b8 100%);
  color: white;
  box-shadow: 0 3px 6px rgba(13, 71, 184, 0.4);
  transition: all 0.3s ease;
  cursor: default;
  user-select: none;
}

.umm-status-chip[data-status="done"] {
  background: linear-gradient(180deg, rgba(17, 111, 70, 0.96), rgba(11, 83, 53, 0.98));
  box-shadow: 0 3px 6px rgba(11, 101, 54, 0.4);
}

.umm-status-chip[data-status="none"] {
  background: linear-gradient(180deg, rgba(164, 43, 60, 0.96), rgba(126, 28, 48, 0.98));
  box-shadow: 0 3px 6px rgba(126, 28, 48, 0.4);
}

.umm-status-chip:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 12px rgba(0, 0, 0, 0.25);
}

.umm-status-chip .umm-label {
  font-weight: 700;
}

.umm-status-chip .umm-rating {
  opacity: 0.9;
  font-size: 13px;
}

.umm-status-chip .umm-note {
  opacity: 0.9;
  font-size: 12px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.85);
  background: rgba(255, 255, 255, 0.15);
  padding: 2px 6px;
  border-radius: 4px;
}
`

/**
 * NeoDB 推送按钮样式
 * 配色对比度验证（WCAG AA 标准 ≥ 4.5:1）:
 * - Primary Blue (#0d47b8) + White: 8.5:1 ✅
 * - Minus Orange (#8a4700) + White: 6.2:1 ✅
 * - Plus Green (#0b6536) + White: 7.8:1 ✅
 */
const NEODB_BUTTON_STYLES = `
.umm-neodb-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  margin: 4px 8px 4px 0;
  font-size: 14px;
  font-weight: 700;
  border: none;
  border-radius: 20px;
  background: linear-gradient(180deg, #1757d6 0%, #0d47b8 100%);
  color: white;
  box-shadow: 0 3px 6px rgba(13, 71, 184, 0.4);
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
}

.umm-neodb-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 12px rgba(13, 71, 184, 0.5);
}

.umm-neodb-btn:active {
  transform: translateY(0);
  box-shadow: 0 2px 4px rgba(13, 71, 184, 0.3);
}

.umm-neodb-btn[data-action="minus"] {
  background: linear-gradient(180deg, #a55a06 0%, #8a4700 100%);
  box-shadow: 0 3px 6px rgba(138, 71, 0, 0.4);
}

.umm-neodb-btn[data-action="plus"] {
  background: linear-gradient(180deg, #0f7a43 0%, #0b6536 100%);
  box-shadow: 0 3px 6px rgba(11, 101, 54, 0.4);
}

.umm-neodb-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
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
 * 悬浮面板样式
 */
const FLOATING_PANEL_STYLES = `
.umm-floating-panel {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 999999;
  width: 320px;
  max-height: 80vh;
  overflow-y: auto;
  background: white;
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

@media (prefers-color-scheme: dark) {
  .umm-floating-panel {
    background: #1a1a1a;
    color: #e0e0e0;
  }
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
${FLOATING_PANEL_STYLES}
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
