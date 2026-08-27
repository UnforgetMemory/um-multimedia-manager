/**
 * UMM Design Tokens — Content Script Colors (Layer 3)
 *
 * ADR-018: values are DERIVED from src/shared/styles/tokens.static.css
 * (the single source of truth). This file exists because global-injected
 * styles are JS template strings in scopes where CSS variables don't exist.
 * scripts/check-design-tokens.cjs (npm run ds:check) verifies this file
 * stays aligned with the static palette — run it after any color change.
 *
 * Semantic map (unified across all layers, ADR-018 D3):
 *   done/watch = green · wish = amber · doing/watched = blue · none = red
 *   primary = brand indigo-blue · minus = amber · plus = green
 *   original = indigo · open = violet
 *
 * Usage: import and interpolate into style templates.
 */

// ==================== Primary — brand indigo-blue ====================
export const COLOR_PRIMARY_START = '#4f6ef7' // static brand-500
export const COLOR_PRIMARY_END = '#3a55ec' // static brand-600
export const COLOR_PRIMARY_SHADOW = 'rgba(58, 85, 236, 0.3)'
export const COLOR_PRIMARY_START_DARK = '#3a55ec' // static brand-600 (AA with white)
export const COLOR_PRIMARY_SHADOW_DARK = 'rgba(126, 155, 249, 0.3)'

// ==================== Success Green (Done) ====================
export const COLOR_DONE_START = 'rgba(4, 120, 87, 0.97)' // static green-700 (AA: pairs with near-white text)
export const COLOR_DONE_END = 'rgba(6, 95, 70, 0.98)' // static green-800
export const COLOR_DONE_TEXT = '#ecfdf5' // static green-50
export const COLOR_DONE_BORDER = 'rgba(167, 243, 208, 0.28)' // green-200 alpha
export const COLOR_DONE_SHADOW = 'rgba(4, 120, 87, 0.3)'
export const COLOR_DONE_START_DARK = 'rgba(4, 120, 87, 0.96)' // static green-700 (AA compliance)
export const COLOR_DONE_TEXT_DARK = '#ecfdf5'
export const COLOR_DONE_BORDER_DARK = 'rgba(110, 231, 183, 0.24)'
export const COLOR_DONE_SHADOW_DARK = 'rgba(5, 150, 105, 0.35)'

// ==================== Wish Amber (semantic: wish = amber) ====================
export const COLOR_WISH_START = '#fbbf24' // static amber-400 (pairs with deep text)
export const COLOR_WISH_END = '#f59e0b' // static amber-500
export const COLOR_WISH_TEXT = '#451a03' // amber-950 — M3 on-color rule: amber never carries white (ADR-019 D2)
export const COLOR_WISH_BORDER = 'rgba(253, 230, 138, 0.3)' // amber-200 alpha
export const COLOR_WISH_SHADOW = 'rgba(217, 119, 6, 0.3)'
export const COLOR_WISH_FILL_DARK = 'rgba(187, 128, 9, 0.32)' // static wish-fill-dark
export const COLOR_WISH_INK_DARK = '#f5c211' // static wish-ink-dark
export const COLOR_WISH_BORDER_DARK = 'rgba(210, 153, 34, 0.45)' // static wish-border-dark
export const COLOR_WISH_SHADOW_DARK = 'rgba(217, 119, 6, 0.35)'

// ==================== Doing Blue ====================
export const COLOR_DOING_START = '#2563eb' // static blue-600 (AA with white)
export const COLOR_DOING_END = '#1d4ed8' // static blue-700
export const COLOR_DOING_TEXT = '#eff6ff' // static blue-50
export const COLOR_DOING_BORDER = 'rgba(191, 219, 254, 0.26)' // blue-200 alpha
export const COLOR_DOING_SHADOW = 'rgba(37, 99, 235, 0.3)'
export const COLOR_DOING_START_DARK = '#2563eb' // static blue-600 (AA)
export const COLOR_DOING_TEXT_DARK = '#eff6ff'
export const COLOR_DOING_BORDER_DARK = 'rgba(147, 197, 253, 0.24)'
export const COLOR_DOING_SHADOW_DARK = 'rgba(59, 130, 246, 0.35)'

// ==================== Danger Red (None) ====================
export const COLOR_NONE_START = 'rgba(185, 28, 28, 0.96)' // static red-700 (AA)
export const COLOR_NONE_END = 'rgba(153, 27, 27, 0.98)' // static red-800
export const COLOR_NONE_TEXT = '#fef2f2' // static red-50
export const COLOR_NONE_BORDER = 'rgba(254, 202, 202, 0.26)' // red-200 alpha
export const COLOR_NONE_SHADOW = 'rgba(185, 28, 28, 0.3)'
export const COLOR_NONE_START_DARK = 'rgba(185, 28, 28, 0.96)' // static red-700
export const COLOR_NONE_TEXT_DARK = '#fef2f2'
export const COLOR_NONE_BORDER_DARK = 'rgba(252, 165, 165, 0.24)'
export const COLOR_NONE_SHADOW_DARK = 'rgba(220, 38, 38, 0.35)'

// ==================== Warning Amber (Minus) — aligned with design-tokens.css ====================
export const COLOR_MINUS_START = '#d97706' // static amber-600
export const COLOR_MINUS_END = '#b45309' // static amber-700
export const COLOR_MINUS_SHADOW = 'rgba(180, 83, 9, 0.3)'
export const COLOR_MINUS_START_DARK = '#b45309' // static amber-700
export const COLOR_MINUS_SHADOW_DARK = 'rgba(146, 64, 14, 0.4)'

// ==================== Success Button (Plus) — aligned with design-tokens.css ====================
export const COLOR_PLUS_START = '#059669' // static green-600
export const COLOR_PLUS_END = '#047857' // static green-700
export const COLOR_PLUS_SHADOW = 'rgba(4, 120, 87, 0.3)'
export const COLOR_PLUS_START_DARK = '#047857' // static green-700
export const COLOR_PLUS_SHADOW_DARK = 'rgba(6, 95, 70, 0.4)'

// ==================== Info Button (Original) — aligned with design-tokens.css ====================
export const COLOR_ORIGINAL_START = '#4f46e5' // static indigo-600 (AA with white)
export const COLOR_ORIGINAL_END = '#4338ca' // static indigo-700
export const COLOR_ORIGINAL_SHADOW = 'rgba(79, 70, 229, 0.3)'
export const COLOR_ORIGINAL_START_DARK = '#4f46e5' // static indigo-600
export const COLOR_ORIGINAL_SHADOW_DARK = 'rgba(79, 70, 229, 0.4)'

// ==================== NeoDB Glow (emerald) ====================
export const COLOR_NEOGLOW_BASE = 'rgba(16, 185, 129, 0.35)' // static green-500
export const COLOR_NEOGLOW_BRIGHT = 'rgba(52, 211, 153, 0.45)' // static green-400
export const COLOR_NEOGLOW_SHADOW_1 = 'rgba(16, 185, 129, 0.4)'
export const COLOR_NEOGLOW_SHADOW_2 = 'rgba(16, 185, 129, 0.25)'
export const COLOR_NEOGLOW_SHADOW_3 = 'rgba(16, 185, 129, 0.15)'
export const COLOR_NEOGLOW_BASE_DARK = 'rgba(16, 185, 129, 0.25)'
export const COLOR_NEOGLOW_SHADOW_1_DARK = 'rgba(16, 185, 129, 0.3)'
export const COLOR_NEOGLOW_SHADOW_2_DARK = 'rgba(16, 185, 129, 0.2)'
export const COLOR_NEOGLOW_SHADOW_3_DARK = 'rgba(16, 185, 129, 0.1)'

// ==================== Neutral ====================
export const COLOR_CHIP_SHADOW = 'rgba(15, 23, 42, 0.16)'
export const COLOR_CHIP_SHADOW_HOVER = 'rgba(15, 23, 42, 0.28)'
export const COLOR_CHIP_BORDER = 'rgba(33, 38, 45, 0.18)'
export const COLOR_RATING_BG = 'rgba(255, 255, 255, 0.96)'
export const COLOR_RATING_TEXT = '#10141b' // static neutral-950
export const COLOR_SURFACE_DARK = '#1c1c1e' // vibrancy-0 (options/popup page + overlay shell)
export const COLOR_SURFACE_LIGHT = '#f7f9fc' // neutral-50
export const COLOR_ACCENT_APPLE = '#0a84ff' // Radix/Apple interactive highlight
export const COLOR_RATING_BG_DARK = 'rgba(38, 45, 59, 0.96)' // static neutral-800
export const COLOR_RATING_TEXT_DARK = '#fbfcfe' // static neutral-25
