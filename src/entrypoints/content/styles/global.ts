/**
 * Global style injection (light-DOM layer, semantic-var single source).
 *
 * Architecture (ADR-021 Wave-E):
 *   THEME_VARS       - :root semantic role sheet (light values, interpolated from Tier-3 tokens.ts)
 *   THEME_VARS_DARK  - html[data-umm-theme="dark"] role flips (the ONLY dark rules)
 *   Component blocks consume var(--usl-*) only — no literals, no theme branches.
 *
 * data-umm-theme is kept live by startThemeAttrSync() — overlay or not.
 * All pairings measured WCAG >= 4.5 (ADR-019/020/021).
 *
 * 拆分（聚合式，2026-09-25）：组件样式块迁至 ./badge-styles 与 ./component-styles；本文件保留主题变量表 + ALL_STYLES 组合器 + 注入函数（组合顺序不变）。
 */

import {
  COLOR_PRIMARY_START,
  COLOR_PRIMARY_END,
  COLOR_PRIMARY_SHADOW,
  COLOR_DONE_START,
  COLOR_DONE_END,
  COLOR_DONE_TEXT,
  COLOR_DONE_BORDER,
  COLOR_DONE_SHADOW,
  COLOR_WISH_START,
  COLOR_WISH_END,
  COLOR_WISH_TEXT,
  COLOR_WISH_BORDER,
  COLOR_WISH_SHADOW,
  COLOR_DOING_START,
  COLOR_DOING_END,
  COLOR_DOING_TEXT,
  COLOR_DOING_BORDER,
  COLOR_DOING_SHADOW,
  COLOR_NONE_START,
  COLOR_NONE_END,
  COLOR_NONE_TEXT,
  COLOR_NONE_BORDER,
  COLOR_NONE_SHADOW,
  COLOR_MINUS_END,
  COLOR_MINUS_SHADOW,
  COLOR_PLUS_END,
  COLOR_PLUS_SHADOW,
  COLOR_ORIGINAL_END,
  COLOR_ORIGINAL_SHADOW,
  COLOR_NEOGLOW_BASE,
  COLOR_NEOGLOW_SHADOW_1,
  COLOR_NEOGLOW_SHADOW_2,
  COLOR_NEOGLOW_SHADOW_3,
  COLOR_RATING_BG,
  COLOR_RATING_TEXT,
  COLOR_PRIMARY_START_DARK,
  COLOR_PRIMARY_SHADOW_DARK,
  COLOR_DONE_START_DARK,
  COLOR_DONE_TEXT_DARK,
  COLOR_DONE_BORDER_DARK,
  COLOR_DONE_SHADOW_DARK,
  COLOR_WISH_FILL_DARK,
  COLOR_WISH_INK_DARK,
  COLOR_WISH_BORDER_DARK,
  COLOR_WISH_SHADOW_DARK,
  COLOR_DOING_START_DARK,
  COLOR_DOING_TEXT_DARK,
  COLOR_DOING_BORDER_DARK,
  COLOR_DOING_SHADOW_DARK,
  COLOR_NONE_START_DARK,
  COLOR_NONE_TEXT_DARK,
  COLOR_NONE_BORDER_DARK,
  COLOR_NONE_SHADOW_DARK,
  COLOR_MINUS_SHADOW_DARK,
  COLOR_PLUS_SHADOW_DARK,
  COLOR_ORIGINAL_SHADOW_DARK,
  COLOR_NEOGLOW_BASE_DARK,
  COLOR_NEOGLOW_SHADOW_1_DARK,
  COLOR_NEOGLOW_SHADOW_2_DARK,
  COLOR_NEOGLOW_SHADOW_3_DARK,
  COLOR_RATING_BG_DARK,
  COLOR_RATING_TEXT_DARK,
  COLOR_OVERLAY_SURFACE,
  COLOR_OVERLAY_SURFACE_RAISED,
  COLOR_OVERLAY_SURFACE_HOVER,
  COLOR_OVERLAY_BORDER,
  COLOR_OVERLAY_BORDER_STRONG,
  COLOR_OVERLAY_TEXT_PRIMARY,
  COLOR_OVERLAY_TEXT_SECONDARY,
  COLOR_OVERLAY_TEXT_MUTED,
  COLOR_OVERLAY_ACCENT,
  COLOR_OVERLAY_SURFACE_DARK,
  COLOR_OVERLAY_SURFACE_RAISED_DARK,
  COLOR_OVERLAY_SURFACE_HOVER_DARK,
  COLOR_OVERLAY_BORDER_DARK,
  COLOR_OVERLAY_BORDER_STRONG_DARK,
  COLOR_OVERLAY_TEXT_PRIMARY_DARK,
  COLOR_OVERLAY_TEXT_SECONDARY_DARK,
  COLOR_OVERLAY_TEXT_MUTED_DARK,
  COLOR_OVERLAY_ACCENT_DARK,
  COLOR_STATUS_TEXT_DONE,
  COLOR_STATUS_TEXT_NONE,
  COLOR_STATUS_TEXT_DONE_DARK,
  COLOR_STATUS_TEXT_NONE_DARK,
} from './tokens'

import {
  SEARCH_BADGE_STYLES,
  STATUS_CHIP_STYLES,
  LIST_STATUS_STYLES,
  REVIEWS_BADGE_STYLES,
} from './badge-styles'
import {
  NEODB_BUTTON_STYLES,
  DIMMER_STYLES,
  HOMEPAGE_BADGE_STYLES,
  FOCUS_VISIBLE_STYLES,
  SCROLLBAR_STYLES,
  UI_COMPONENT_STYLES,
} from './component-styles'

/** 既有消费者（sehuatang/styles.ts、global-styles-tokens.spec.ts）经本文件取用。 */
export { UI_COMPONENT_STYLES } from './component-styles'

/* Watermark glow vars — decorative, follows theme */
const GLOW_VARS = `
html {
  --usl-neodb-glow-base: ${COLOR_NEOGLOW_BASE};
  --usl-neodb-glow-s1: ${COLOR_NEOGLOW_SHADOW_1};
  --usl-neodb-glow-s2: ${COLOR_NEOGLOW_SHADOW_2};
  --usl-neodb-glow-s3: ${COLOR_NEOGLOW_SHADOW_3};
}
html[data-umm-theme="dark"] {
  --usl-neodb-glow-base: ${COLOR_NEOGLOW_BASE_DARK};
  --usl-neodb-glow-s1: ${COLOR_NEOGLOW_SHADOW_1_DARK};
  --usl-neodb-glow-s2: ${COLOR_NEOGLOW_SHADOW_2_DARK};
  --usl-neodb-glow-s3: ${COLOR_NEOGLOW_SHADOW_3_DARK};
}
`

/* ============================================================
   Semantic role sheet — single source; components reference --usl-* only
   ============================================================ */
export const THEME_VARS = `
html {
  /* Default ink on colored fills */
  --usl-ink-on-fill: #ffffff;
  /* Primary (brand gradient) */
  --usl-fill-primary: linear-gradient(180deg, ${COLOR_PRIMARY_START} 0%, ${COLOR_PRIMARY_END} 100%);
  --usl-shadow-primary: 0 2px 4px ${COLOR_PRIMARY_SHADOW};
  /* Wish (amber x deep-brown ink) */
  --usl-fill-wish: linear-gradient(180deg, ${COLOR_WISH_START}, ${COLOR_WISH_END});
  --usl-ink-wish: ${COLOR_WISH_TEXT};
  --usl-border-wish: ${COLOR_WISH_BORDER};
  --usl-shadow-wish: 0 2px 4px ${COLOR_WISH_SHADOW};
  /* Doing (blue) */
  --usl-fill-doing: linear-gradient(180deg, ${COLOR_DOING_START}, ${COLOR_DOING_END});
  --usl-ink-doing: ${COLOR_DOING_TEXT};
  --usl-border-doing: ${COLOR_DOING_BORDER};
  --usl-shadow-doing: 0 2px 4px ${COLOR_DOING_SHADOW};
  /* Done (green) */
  --usl-fill-done: linear-gradient(180deg, ${COLOR_DONE_START}, ${COLOR_DONE_END});
  --usl-ink-done: ${COLOR_DONE_TEXT};
  --usl-border-done: ${COLOR_DONE_BORDER};
  --usl-shadow-done: 0 2px 4px ${COLOR_DONE_SHADOW};
  /* None (red) */
  --usl-fill-none: linear-gradient(180deg, ${COLOR_NONE_START}, ${COLOR_NONE_END});
  --usl-ink-none: ${COLOR_NONE_TEXT};
  --usl-border-none: ${COLOR_NONE_BORDER};
  --usl-shadow-none: 0 2px 4px ${COLOR_NONE_SHADOW};
  /* Rating chip */
  --usl-rating-bg: ${COLOR_RATING_BG};
  --usl-rating-ink: ${COLOR_RATING_TEXT};
  /* NeoDB buttons: solid 700-tier fills x white ink (AA >= 5.02) */
  --usl-neodb-minus: ${COLOR_MINUS_END};
  --usl-neodb-plus: ${COLOR_PLUS_END};
  --usl-neodb-original: ${COLOR_ORIGINAL_END};
  --usl-neodb-open: #7c3aed;
  --usl-ink-neodb-minus: #ffffff;
  --usl-ink-neodb-plus: #ffffff;
  --usl-ink-neodb-original: #ffffff;
  --usl-ink-neodb-open: #ffffff;
  --usl-neodb-border: transparent;
  --usl-neodb-open-hover-shadow: 0 4px 8px rgba(109,40,217,0.4);
  --usl-shadow-neodb-minus: 0 2px 4px ${COLOR_MINUS_SHADOW};
  --usl-shadow-neodb-plus: 0 2px 4px ${COLOR_PLUS_SHADOW};
  --usl-shadow-neodb-original: 0 2px 4px ${COLOR_ORIGINAL_SHADOW};
  /* Overlay surfaces (light-DOM overlay shells: sehuatang etc.) */
  --usl-surface: ${COLOR_OVERLAY_SURFACE};
  --usl-surface-raised: ${COLOR_OVERLAY_SURFACE_RAISED};
  --usl-surface-hover: ${COLOR_OVERLAY_SURFACE_HOVER};
  --usl-border: ${COLOR_OVERLAY_BORDER};
  --usl-border-strong: ${COLOR_OVERLAY_BORDER_STRONG};
  --usl-text-primary: ${COLOR_OVERLAY_TEXT_PRIMARY};
  --usl-text-secondary: ${COLOR_OVERLAY_TEXT_SECONDARY};
  --usl-text-muted: ${COLOR_OVERLAY_TEXT_MUTED};
  --usl-accent: ${COLOR_OVERLAY_ACCENT};
  /* Status small-text tiers on overlay surfaces (M3 D2) */
  --usl-text-done: ${COLOR_STATUS_TEXT_DONE};
  --usl-text-none: ${COLOR_STATUS_TEXT_NONE};
}
`

export const THEME_VARS_DARK = `
html[data-umm-theme="dark"] {
  --usl-fill-primary: ${COLOR_PRIMARY_START_DARK};  --usl-shadow-primary: 0 2px 4px ${COLOR_PRIMARY_SHADOW_DARK};
  --usl-fill-wish: ${COLOR_WISH_FILL_DARK};
  --usl-ink-wish: ${COLOR_WISH_INK_DARK};
  --usl-border-wish: ${COLOR_WISH_BORDER_DARK};
  --usl-shadow-wish: 0 2px 4px ${COLOR_WISH_SHADOW_DARK};
  --usl-fill-doing: ${COLOR_DOING_START_DARK};
  --usl-ink-doing: ${COLOR_DOING_TEXT_DARK};
  --usl-border-doing: ${COLOR_DOING_BORDER_DARK};
  --usl-shadow-doing: 0 2px 4px ${COLOR_DOING_SHADOW_DARK};
  --usl-fill-done: ${COLOR_DONE_START_DARK};
  --usl-ink-done: ${COLOR_DONE_TEXT_DARK};
  --usl-border-done: ${COLOR_DONE_BORDER_DARK};
  --usl-shadow-done: 0 2px 4px ${COLOR_DONE_SHADOW_DARK};
  --usl-fill-none: ${COLOR_NONE_START_DARK};
  --usl-ink-none: ${COLOR_NONE_TEXT_DARK};
  --usl-border-none: ${COLOR_NONE_BORDER_DARK};
  --usl-shadow-none: 0 2px 4px ${COLOR_NONE_SHADOW_DARK};
  --usl-rating-bg: ${COLOR_RATING_BG_DARK};
  --usl-rating-ink: ${COLOR_RATING_TEXT_DARK};
  /* Dark NeoDB = GitHub Primer convention: white ink x desaturated fills
     (amber=attention-emphasis #9e6a03, green=#238636, Radix indigo9/violet9)
     +1px light border. Measured 4.68/4.64/5.21/5.39. No ink text in dark. */
  --usl-shadow-neodb-minus: 0 2px 4px ${COLOR_MINUS_SHADOW_DARK};
  --usl-shadow-neodb-plus: 0 2px 4px ${COLOR_PLUS_SHADOW_DARK};
  --usl-shadow-neodb-original: 0 2px 4px ${COLOR_ORIGINAL_SHADOW_DARK};
  --usl-neodb-minus: #9e6a03;
  --usl-neodb-plus: #238636;
  --usl-neodb-original: #3e63dd;
  --usl-neodb-open: #6e56cf;
  --usl-ink-neodb-minus: #ffffff;
  --usl-ink-neodb-plus: #ffffff;
  --usl-ink-neodb-original: #ffffff;
  --usl-ink-neodb-open: #ffffff;
  --usl-neodb-border: rgba(240, 246, 252, 0.12);
  --usl-neodb-open-hover-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  /* Overlay surfaces — dark flips */
  --usl-surface: ${COLOR_OVERLAY_SURFACE_DARK};
  --usl-surface-raised: ${COLOR_OVERLAY_SURFACE_RAISED_DARK};
  --usl-surface-hover: ${COLOR_OVERLAY_SURFACE_HOVER_DARK};
  --usl-border: ${COLOR_OVERLAY_BORDER_DARK};
  --usl-border-strong: ${COLOR_OVERLAY_BORDER_STRONG_DARK};
  --usl-text-primary: ${COLOR_OVERLAY_TEXT_PRIMARY_DARK};
  --usl-text-secondary: ${COLOR_OVERLAY_TEXT_SECONDARY_DARK};
  --usl-text-muted: ${COLOR_OVERLAY_TEXT_MUTED_DARK};
  --usl-accent: ${COLOR_OVERLAY_ACCENT_DARK};
  --usl-text-done: ${COLOR_STATUS_TEXT_DONE_DARK};
  --usl-text-none: ${COLOR_STATUS_TEXT_NONE_DARK};
}
`

/**
 * All styles (semantic var sheets MUST come first)
 */
const ALL_STYLES = `
${THEME_VARS}
${GLOW_VARS}
${SEARCH_BADGE_STYLES}
${STATUS_CHIP_STYLES}
${LIST_STATUS_STYLES}
${NEODB_BUTTON_STYLES}
${DIMMER_STYLES}
${HOMEPAGE_BADGE_STYLES}
${UI_COMPONENT_STYLES}
${FOCUS_VISIBLE_STYLES}
${SCROLLBAR_STYLES}
${REVIEWS_BADGE_STYLES}
`

/**
 * Dark theme = var flips only. Zero component duplication, zero order reliance.
 */
const ALL_STYLES_DARK = `
${THEME_VARS_DARK}
`

/**
 * Inject global styles
 */
export function injectGlobalStyles(): void {
  // Check whether already injected
  if (document.getElementById('umm-global-styles')) {
    return
  }

  const styleElement = document.createElement('style')
  styleElement.id = 'umm-global-styles'
  styleElement.textContent = ALL_STYLES
  document.head.appendChild(styleElement)

  // Dark theme flips semantic vars only — no duplicated rules
  const darkStyleElement = document.createElement('style')
  darkStyleElement.id = 'umm-global-styles-dark'
  darkStyleElement.textContent = ALL_STYLES_DARK
  document.head.appendChild(darkStyleElement)

  console.log('[UMM] Global styles injected successfully')
}

