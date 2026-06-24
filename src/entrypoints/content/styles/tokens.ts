/**
 * UMM Design Tokens — Content Script Colors
 *
 * Shared color constants for programmatic style injection.
 * These cannot use CSS custom properties because:
 * 1. Styles are injected as JS template strings (not CSS files)
 * 2. Some components run inside Shadow DOM (isolated scope)
 *
 * Usage: import and interpolate into style templates.
 */

// ==================== Primary Blue ====================
export const COLOR_PRIMARY_START = '#1757d6'
export const COLOR_PRIMARY_END = '#0d47b8'
export const COLOR_PRIMARY_SHADOW = 'rgba(13, 71, 184, 0.3)'
export const COLOR_PRIMARY_SHADOW_HOVER = 'rgba(13, 71, 184, 0.5)'
export const COLOR_PRIMARY_SHADOW_ACTIVE = 'rgba(13, 71, 184, 0.4)'

// ==================== Success Green (Done) ====================
export const COLOR_DONE_START = 'rgba(17, 111, 70, 0.96)'
export const COLOR_DONE_END = 'rgba(11, 83, 53, 0.98)'
export const COLOR_DONE_TEXT = '#f4fff8'
export const COLOR_DONE_BORDER = 'rgba(198, 255, 228, 0.26)'
export const COLOR_DONE_SHADOW = 'rgba(11, 101, 54, 0.3)'

// ==================== Danger Red (None) ====================
export const COLOR_NONE_START = 'rgba(164, 43, 60, 0.96)'
export const COLOR_NONE_END = 'rgba(126, 28, 48, 0.98)'
export const COLOR_NONE_TEXT = '#fff7f8'
export const COLOR_NONE_BORDER = 'rgba(255, 214, 220, 0.22)'
export const COLOR_NONE_SHADOW = 'rgba(126, 28, 48, 0.3)'

// ==================== Warning Orange (Minus) ====================
export const COLOR_MINUS_START = '#a55a06'
export const COLOR_MINUS_END = '#8a4700'
export const COLOR_MINUS_SHADOW = 'rgba(138, 71, 0, 0.4)'

// ==================== Success Button (Plus) ====================
export const COLOR_PLUS_START = '#0f7a43'
export const COLOR_PLUS_END = '#0b6536'
export const COLOR_PLUS_SHADOW = 'rgba(11, 101, 54, 0.4)'

// ==================== Info Blue (Original) ====================
export const COLOR_ORIGINAL_START = '#2563eb'
export const COLOR_ORIGINAL_END = '#1d4ed8'
export const COLOR_ORIGINAL_SHADOW = 'rgba(37, 99, 235, 0.4)'

// ==================== NeoDB Glow ====================
export const COLOR_NEOGLOW_BASE = 'rgba(16, 185, 129, 0.35)'
export const COLOR_NEOGLOW_BRIGHT = 'rgba(52, 211, 153, 0.45)'
export const COLOR_NEOGLOW_SHADOW_1 = 'rgba(16, 185, 129, 0.4)'
export const COLOR_NEOGLOW_SHADOW_2 = 'rgba(16, 185, 129, 0.25)'
export const COLOR_NEOGLOW_SHADOW_3 = 'rgba(16, 185, 129, 0.15)'

// ==================== Neutral ====================
export const COLOR_CHIP_SHADOW = 'rgba(15, 23, 42, 0.16)'
export const COLOR_CHIP_SHADOW_HOVER = 'rgba(15, 23, 42, 0.28)'
export const COLOR_CHIP_BORDER = 'rgba(33, 38, 45, 0.18)'
export const COLOR_RATING_BG = 'rgba(255, 255, 255, 0.96)'
export const COLOR_RATING_TEXT = '#0b1929'
