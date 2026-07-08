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
export const COLOR_PRIMARY_START_DARK = '#60a5fa'
export const COLOR_PRIMARY_END_DARK = '#3b82f6'
export const COLOR_PRIMARY_SHADOW_DARK = 'rgba(96, 165, 250, 0.3)'

// ==================== Success Green (Done) ====================
export const COLOR_DONE_START = 'rgba(17, 111, 70, 0.96)'
export const COLOR_DONE_END = 'rgba(11, 83, 53, 0.98)'
export const COLOR_DONE_TEXT = '#f4fff8'
export const COLOR_DONE_BORDER = 'rgba(198, 255, 228, 0.26)'
export const COLOR_DONE_SHADOW = 'rgba(11, 101, 54, 0.3)'
export const COLOR_DONE_START_DARK = 'rgba(22, 128, 61, 0.96)'
export const COLOR_DONE_END_DARK = 'rgba(21, 128, 61, 0.98)'
export const COLOR_DONE_TEXT_DARK = '#f0fdf4'
export const COLOR_DONE_BORDER_DARK = 'rgba(187, 247, 208, 0.2)'
export const COLOR_DONE_SHADOW_DARK = 'rgba(21, 128, 61, 0.3)'

// ==================== Danger Red (None) ====================
export const COLOR_NONE_START = 'rgba(164, 43, 60, 0.96)'
export const COLOR_NONE_END = 'rgba(126, 28, 48, 0.98)'
export const COLOR_NONE_TEXT = '#fff7f8'
export const COLOR_NONE_BORDER = 'rgba(255, 214, 220, 0.22)'
export const COLOR_NONE_SHADOW = 'rgba(126, 28, 48, 0.3)'
export const COLOR_NONE_START_DARK = 'rgba(185, 28, 28, 0.96)'
export const COLOR_NONE_END_DARK = 'rgba(153, 27, 27, 0.98)'
export const COLOR_NONE_TEXT_DARK = '#fef2f2'
export const COLOR_NONE_BORDER_DARK = 'rgba(254, 202, 202, 0.2)'
export const COLOR_NONE_SHADOW_DARK = 'rgba(185, 28, 28, 0.3)'

// ==================== Warning Orange (Minus) — aligned with interest.css ====================
export const COLOR_MINUS_START = '#d97706'
export const COLOR_MINUS_END = '#b45309'
export const COLOR_MINUS_SHADOW = 'rgba(180, 83, 9, 0.3)'
export const COLOR_MINUS_START_DARK = '#a16207'
export const COLOR_MINUS_END_DARK = '#854d0e'
export const COLOR_MINUS_SHADOW_DARK = 'rgba(133, 77, 14, 0.4)'

// ==================== Success Button (Plus) — aligned with interest.css ====================
export const COLOR_PLUS_START = '#16a34a'
export const COLOR_PLUS_END = '#15803d'
export const COLOR_PLUS_SHADOW = 'rgba(21, 128, 61, 0.3)'
export const COLOR_PLUS_START_DARK = '#15803d'
export const COLOR_PLUS_END_DARK = '#166534'
export const COLOR_PLUS_SHADOW_DARK = 'rgba(22, 101, 52, 0.4)'

// ==================== Info Blue (Original) — aligned with interest.css ====================
export const COLOR_ORIGINAL_START = '#6366f1'
export const COLOR_ORIGINAL_END = '#4f46e5'
export const COLOR_ORIGINAL_SHADOW = 'rgba(79, 70, 229, 0.3)'
export const COLOR_ORIGINAL_START_DARK = '#4f46e5'
export const COLOR_ORIGINAL_END_DARK = '#4338ca'
export const COLOR_ORIGINAL_SHADOW_DARK = 'rgba(79, 70, 229, 0.4)'

// ==================== NeoDB Glow ====================
export const COLOR_NEOGLOW_BASE = 'rgba(16, 185, 129, 0.35)'
export const COLOR_NEOGLOW_BRIGHT = 'rgba(52, 211, 153, 0.45)'
export const COLOR_NEOGLOW_SHADOW_1 = 'rgba(16, 185, 129, 0.4)'
export const COLOR_NEOGLOW_SHADOW_2 = 'rgba(16, 185, 129, 0.25)'
export const COLOR_NEOGLOW_SHADOW_3 = 'rgba(16, 185, 129, 0.15)'
export const COLOR_NEOGLOW_BASE_DARK = 'rgba(16, 185, 129, 0.25)'
export const COLOR_NEOGLOW_BRIGHT_DARK = 'rgba(52, 211, 153, 0.35)'
export const COLOR_NEOGLOW_SHADOW_1_DARK = 'rgba(16, 185, 129, 0.3)'
export const COLOR_NEOGLOW_SHADOW_2_DARK = 'rgba(16, 185, 129, 0.2)'
export const COLOR_NEOGLOW_SHADOW_3_DARK = 'rgba(16, 185, 129, 0.1)'

// ==================== Neutral ====================
export const COLOR_CHIP_SHADOW = 'rgba(15, 23, 42, 0.16)'
export const COLOR_CHIP_SHADOW_HOVER = 'rgba(15, 23, 42, 0.28)'
export const COLOR_CHIP_BORDER = 'rgba(33, 38, 45, 0.18)'
export const COLOR_RATING_BG = 'rgba(255, 255, 255, 0.96)'
export const COLOR_RATING_TEXT = '#0b1929'
export const COLOR_CHIP_SHADOW_DARK = 'rgba(0, 0, 0, 0.3)'
export const COLOR_CHIP_SHADOW_HOVER_DARK = 'rgba(0, 0, 0, 0.4)'
export const COLOR_CHIP_BORDER_DARK = 'rgba(255, 255, 255, 0.12)'
export const COLOR_RATING_BG_DARK = 'rgba(30, 31, 36, 0.96)'
export const COLOR_RATING_TEXT_DARK = '#e0e0e0'
