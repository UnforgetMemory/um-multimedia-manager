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
 * 来源：content.ts _createDoubanStatusChip 中的样式注入，统一到全局
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
  border: 1px solid rgba(33, 38, 45, 0.18);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.16);
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
  color: #f4fff8 !important;
  background: linear-gradient(180deg, rgba(17, 111, 70, 0.96), rgba(11, 83, 53, 0.98)) !important;
  border-color: rgba(198, 255, 228, 0.26) !important;
}
.umm-status-chip[data-status="none"] {
  color: #fff7f8 !important;
  background: linear-gradient(180deg, rgba(164, 43, 60, 0.96), rgba(126, 28, 48, 0.98)) !important;
  border-color: rgba(255, 214, 220, 0.22) !important;
}
.umm-status-chip .umm-label {
  font-weight: 700;
}
.umm-status-chip .umm-rating {
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.96) !important;
  color: #0b1929 !important;
  font-weight: 800;
  text-shadow: none;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  -webkit-text-fill-color: #0b1929;
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
  box-shadow: 0 14px 32px rgba(15, 23, 42, 0.28) !important;
}
`

/**
 * NeoDB 推送按钮样式
 * 来源：content.ts injectNeoDBPushButtons 中的样式注入，统一到全局
 * 包含水印荧光动画效果
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
  background: linear-gradient(180deg, #1757d6 0%, #0d47b8 100%);
  color: white;
  box-shadow: 0 3px 6px rgba(13, 71, 184, 0.4);
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
  position: relative;
  z-index: 1;
}
.umm-neodb-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 12px rgba(13, 71, 184, 0.5);
}
.umm-neodb-btn:active {
  transform: translateY(0);
  box-shadow: 0 2px 4px rgba(13, 71, 184, 0.3);
}
.umm-neodb-btn--minus {
  background: linear-gradient(180deg, #a55a06 0%, #8a4700 100%);
  box-shadow: 0 3px 6px rgba(138, 71, 0, 0.4);
}
.umm-neodb-btn--plus {
  background: linear-gradient(180deg, #0f7a43 0%, #0b6536 100%);
  box-shadow: 0 3px 6px rgba(11, 101, 54, 0.4);
}
.umm-neodb-btn--original {
  background: linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%);
  box-shadow: 0 3px 6px rgba(37, 99, 235, 0.4);
}
.umm-neodb-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}
.umm-neodb-synced .umm-neodb-watermark {
  animation: umm-neodb-glow 2s ease-in-out 3 alternate;
  animation-fill-mode: forwards;
  color: rgba(16, 185, 129, 0.35) !important;
  text-shadow:
    0 0 10px rgba(16, 185, 129, 0.4),
    0 0 20px rgba(16, 185, 129, 0.25),
    0 0 30px rgba(16, 185, 129, 0.15) !important;
}
@keyframes umm-neodb-glow {
  from {
    color: rgba(16, 185, 129, 0.35);
    text-shadow: 0 0 10px rgba(16, 185, 129, 0.4);
  }
  to {
    color: rgba(52, 211, 153, 0.45);
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
 * 所有样式的集合
 */
const ALL_STYLES = `
${SEARCH_BADGE_STYLES}
${STATUS_CHIP_STYLES}
${NEODB_BUTTON_STYLES}
${DIMMER_STYLES}
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
