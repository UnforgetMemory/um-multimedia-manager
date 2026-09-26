/**
 * Global style injection (light-DOM layer, semantic-var single source).
 *
 * Architecture (ADR-021 Wave-E):
 *   THEME_VARS       - :root semantic role sheet (light values, interpolated from Tier-3 tokens.ts)
 *   THEME_VARS_DARK  - html[data-umm-theme="dark"] role flips (the ONLY dark rules)
 *   Component blocks consume var(--umm-*) only — no literals, no theme branches.
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
} from './tokens';

import { STATUS_CHIP_STYLES, LIST_STATUS_STYLES, REVIEWS_BADGE_STYLES } from './badge-styles';
import {
  NEODB_BUTTON_STYLES,
  DIMMER_STYLES,
  HOMEPAGE_BADGE_STYLES,
  FOCUS_VISIBLE_STYLES,
  SCROLLBAR_STYLES,
  UI_COMPONENT_STYLES,
} from './component-styles';

/** 既有消费者（sehuatang/styles.ts、global-styles-tokens.spec.ts）经本文件取用。 */
export { UI_COMPONENT_STYLES } from './component-styles';

/* Watermark glow vars — decorative, follows theme */
const GLOW_VARS = `
html {
  --umm-neodb-glow-base: ${COLOR_NEOGLOW_BASE};
  --umm-neodb-glow-s1: ${COLOR_NEOGLOW_SHADOW_1};
  --umm-neodb-glow-s2: ${COLOR_NEOGLOW_SHADOW_2};
  --umm-neodb-glow-s3: ${COLOR_NEOGLOW_SHADOW_3};
}
html[data-umm-theme="dark"] {
  --umm-neodb-glow-base: ${COLOR_NEOGLOW_BASE_DARK};
  --umm-neodb-glow-s1: ${COLOR_NEOGLOW_SHADOW_1_DARK};
  --umm-neodb-glow-s2: ${COLOR_NEOGLOW_SHADOW_2_DARK};
  --umm-neodb-glow-s3: ${COLOR_NEOGLOW_SHADOW_3_DARK};
}
`;

/* ============================================================
   Semantic role sheet — single source; components reference --umm-* only
   ============================================================ */
export const THEME_VARS = `
html {
  /* Default ink on colored fills */
  --umm-ink-on-fill: #ffffff;
  /* Primary (brand gradient) */
  --umm-fill-primary: linear-gradient(180deg, ${COLOR_PRIMARY_START} 0%, ${COLOR_PRIMARY_END} 100%);
  --umm-shadow-primary: 0 2px 4px ${COLOR_PRIMARY_SHADOW};
  /* Wish (amber x deep-brown ink) */
  --umm-fill-wish: linear-gradient(180deg, ${COLOR_WISH_START}, ${COLOR_WISH_END});
  --umm-ink-wish: ${COLOR_WISH_TEXT};
  --umm-border-wish: ${COLOR_WISH_BORDER};
  --umm-shadow-wish: 0 2px 4px ${COLOR_WISH_SHADOW};
  /* Doing (blue) */
  --umm-fill-doing: linear-gradient(180deg, ${COLOR_DOING_START}, ${COLOR_DOING_END});
  --umm-ink-doing: ${COLOR_DOING_TEXT};
  --umm-border-doing: ${COLOR_DOING_BORDER};
  --umm-shadow-doing: 0 2px 4px ${COLOR_DOING_SHADOW};
  /* Done (green) */
  --umm-fill-done: linear-gradient(180deg, ${COLOR_DONE_START}, ${COLOR_DONE_END});
  --umm-ink-done: ${COLOR_DONE_TEXT};
  --umm-border-done: ${COLOR_DONE_BORDER};
  --umm-shadow-done: 0 2px 4px ${COLOR_DONE_SHADOW};
  /* None (red) */
  --umm-fill-none: linear-gradient(180deg, ${COLOR_NONE_START}, ${COLOR_NONE_END});
  --umm-ink-none: ${COLOR_NONE_TEXT};
  --umm-border-none: ${COLOR_NONE_BORDER};
  --umm-shadow-none: 0 2px 4px ${COLOR_NONE_SHADOW};
  /* Rating chip */
  --umm-rating-bg: ${COLOR_RATING_BG};
  --umm-rating-ink: ${COLOR_RATING_TEXT};
  /* NeoDB buttons: solid 700-tier fills x white ink (AA >= 5.02) */
  --umm-neodb-minus: ${COLOR_MINUS_END};
  --umm-neodb-plus: ${COLOR_PLUS_END};
  --umm-neodb-original: ${COLOR_ORIGINAL_END};
  --umm-neodb-open: #7c3aed;
  --umm-ink-neodb-minus: #ffffff;
  --umm-ink-neodb-plus: #ffffff;
  --umm-ink-neodb-original: #ffffff;
  --umm-ink-neodb-open: #ffffff;
  --umm-neodb-border: transparent;
  --umm-neodb-open-hover-shadow: 0 4px 8px rgba(109,40,217,0.4);
  --umm-shadow-neodb-minus: 0 2px 4px ${COLOR_MINUS_SHADOW};
  --umm-shadow-neodb-plus: 0 2px 4px ${COLOR_PLUS_SHADOW};
  --umm-shadow-neodb-original: 0 2px 4px ${COLOR_ORIGINAL_SHADOW};
  /* Overlay surfaces (light-DOM overlay shells: sehuatang etc.) */
  --umm-surface: ${COLOR_OVERLAY_SURFACE};
  --umm-surface-raised: ${COLOR_OVERLAY_SURFACE_RAISED};
  --umm-surface-hover: ${COLOR_OVERLAY_SURFACE_HOVER};
  --umm-overlay-border: ${COLOR_OVERLAY_BORDER};
  --umm-border-strong: ${COLOR_OVERLAY_BORDER_STRONG};
  --umm-overlay-text-primary: ${COLOR_OVERLAY_TEXT_PRIMARY};
  --umm-overlay-text-secondary: ${COLOR_OVERLAY_TEXT_SECONDARY};
  --umm-overlay-text-muted: ${COLOR_OVERLAY_TEXT_MUTED};
  --umm-accent: ${COLOR_OVERLAY_ACCENT};
  /* Status small-text tiers on overlay surfaces (M3 D2) */
  --umm-text-done: ${COLOR_STATUS_TEXT_DONE};
  --umm-text-none: ${COLOR_STATUS_TEXT_NONE};
}
`;

export const THEME_VARS_DARK = `
html[data-umm-theme="dark"] {
  --umm-fill-primary: ${COLOR_PRIMARY_START_DARK};  --umm-shadow-primary: 0 2px 4px ${COLOR_PRIMARY_SHADOW_DARK};
  --umm-fill-wish: ${COLOR_WISH_FILL_DARK};
  --umm-ink-wish: ${COLOR_WISH_INK_DARK};
  --umm-border-wish: ${COLOR_WISH_BORDER_DARK};
  --umm-shadow-wish: 0 2px 4px ${COLOR_WISH_SHADOW_DARK};
  --umm-fill-doing: ${COLOR_DOING_START_DARK};
  --umm-ink-doing: ${COLOR_DOING_TEXT_DARK};
  --umm-border-doing: ${COLOR_DOING_BORDER_DARK};
  --umm-shadow-doing: 0 2px 4px ${COLOR_DOING_SHADOW_DARK};
  --umm-fill-done: ${COLOR_DONE_START_DARK};
  --umm-ink-done: ${COLOR_DONE_TEXT_DARK};
  --umm-border-done: ${COLOR_DONE_BORDER_DARK};
  --umm-shadow-done: 0 2px 4px ${COLOR_DONE_SHADOW_DARK};
  --umm-fill-none: ${COLOR_NONE_START_DARK};
  --umm-ink-none: ${COLOR_NONE_TEXT_DARK};
  --umm-border-none: ${COLOR_NONE_BORDER_DARK};
  --umm-shadow-none: 0 2px 4px ${COLOR_NONE_SHADOW_DARK};
  --umm-rating-bg: ${COLOR_RATING_BG_DARK};
  --umm-rating-ink: ${COLOR_RATING_TEXT_DARK};
  /* Dark NeoDB = GitHub Primer convention: white ink x desaturated fills
     (amber=attention-emphasis #9e6a03, green=#238636, Radix indigo9/violet9)
     +1px light border. Measured 4.68/4.64/5.21/5.39. No ink text in dark. */
  --umm-shadow-neodb-minus: 0 2px 4px ${COLOR_MINUS_SHADOW_DARK};
  --umm-shadow-neodb-plus: 0 2px 4px ${COLOR_PLUS_SHADOW_DARK};
  --umm-shadow-neodb-original: 0 2px 4px ${COLOR_ORIGINAL_SHADOW_DARK};
  --umm-neodb-minus: #9e6a03;
  --umm-neodb-plus: #238636;
  --umm-neodb-original: #3e63dd;
  --umm-neodb-open: #6e56cf;
  --umm-ink-neodb-minus: #ffffff;
  --umm-ink-neodb-plus: #ffffff;
  --umm-ink-neodb-original: #ffffff;
  --umm-ink-neodb-open: #ffffff;
  --umm-neodb-border: rgba(240, 246, 252, 0.12);
  --umm-neodb-open-hover-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  /* Overlay surfaces — dark flips */
  --umm-surface: ${COLOR_OVERLAY_SURFACE_DARK};
  --umm-surface-raised: ${COLOR_OVERLAY_SURFACE_RAISED_DARK};
  --umm-surface-hover: ${COLOR_OVERLAY_SURFACE_HOVER_DARK};
  --umm-overlay-border: ${COLOR_OVERLAY_BORDER_DARK};
  --umm-border-strong: ${COLOR_OVERLAY_BORDER_STRONG_DARK};
  --umm-overlay-text-primary: ${COLOR_OVERLAY_TEXT_PRIMARY_DARK};
  --umm-overlay-text-secondary: ${COLOR_OVERLAY_TEXT_SECONDARY_DARK};
  --umm-overlay-text-muted: ${COLOR_OVERLAY_TEXT_MUTED_DARK};
  --umm-accent: ${COLOR_OVERLAY_ACCENT_DARK};
  --umm-text-done: ${COLOR_STATUS_TEXT_DONE_DARK};
  --umm-text-none: ${COLOR_STATUS_TEXT_NONE_DARK};
}
`;

/**
 * Reduced-motion guard for the WHOLE legacy light-DOM surface (P-E 波次，2026-09-26).
 *
 * 审计缺口：此前全组合表只有霓虹水印一处 `prefers-reduced-motion`（component-styles
 * 的 umm-neodb-glow），doulist 面板 / sehuatang 菜单 / overlay / toast / youtube /
 * bilibili 等注入样式全部无保护。本表作为 ALL_STYLES 组合层的**统一一条**规则覆盖
 * 所有经 injectGlobalStyles 注入的页面。
 *
 * 作用域纪律（ADR-026 D7）：锚点是「元素自身的 umm- 标记」——`[class*="umm-"]`
 * 与 `[data-umm-]` 属性选择器，绝不引入裸 `*`（scope:check 会拦）。
 * `!important` 是刻意保留的：ui/*.ts 大量用元素内联 `style.cssText` 写过渡，
 * 内联声明只有 !important 能压过。
 */
export const REDUCED_MOTION_STYLES = `
@media (prefers-reduced-motion: reduce) {
  [class*="umm-"],
  [class*="umm-"]::before,
  [class*="umm-"]::after,
  [data-umm-],
  [data-umm-]::before,
  [data-umm-]::after {
    animation: none !important;
    transition: none !important;
  }
}
`;

/**
 * All styles (semantic var sheets MUST come first)
 */
const ALL_STYLES = `
${THEME_VARS}
${GLOW_VARS}
${STATUS_CHIP_STYLES}
${LIST_STATUS_STYLES}
${NEODB_BUTTON_STYLES}
${DIMMER_STYLES}
${HOMEPAGE_BADGE_STYLES}
${UI_COMPONENT_STYLES}
${FOCUS_VISIBLE_STYLES}
${SCROLLBAR_STYLES}
${REVIEWS_BADGE_STYLES}
${REDUCED_MOTION_STYLES}
`;

/**
 * Dark theme = var flips only. Zero component duplication, zero order reliance.
 */
const ALL_STYLES_DARK = `
${THEME_VARS_DARK}
`;

/* ============================================================
   按需子集 API（X5 包体波）——仅「选择逻辑」，不改任何块内容
   ============================================================ */

/** 可独立注入的样式块标识（与 ALL_STYLES 模板拼装顺序一一对应）。 */
export type GlobalStyleBlock =
  | 'theme-vars'
  | 'glow-vars'
  | 'status-chip'
  | 'list-status'
  | 'neodb-button'
  | 'dimmer'
  | 'homepage-badge'
  | 'ui-component'
  | 'focus-visible'
  | 'scrollbar'
  | 'reviews-badge'
  | 'reduced-motion';

/** 全量块顺序（语义变量表必须最前，与 ALL_STYLES 拼装顺序一致）。 */
export const ALL_GLOBAL_STYLE_BLOCKS: readonly GlobalStyleBlock[] = [
  'theme-vars',
  'glow-vars',
  'status-chip',
  'list-status',
  'neodb-button',
  'dimmer',
  'homepage-badge',
  'ui-component',
  'focus-visible',
  'scrollbar',
  'reviews-badge',
  'reduced-motion',
];

const GLOBAL_STYLE_BLOCK_SOURCES: Record<GlobalStyleBlock, string> = {
  'theme-vars': THEME_VARS,
  'glow-vars': GLOW_VARS,
  'status-chip': STATUS_CHIP_STYLES,
  'list-status': LIST_STATUS_STYLES,
  'neodb-button': NEODB_BUTTON_STYLES,
  dimmer: DIMMER_STYLES,
  'homepage-badge': HOMEPAGE_BADGE_STYLES,
  'ui-component': UI_COMPONENT_STYLES,
  'focus-visible': FOCUS_VISIBLE_STYLES,
  scrollbar: SCROLLBAR_STYLES,
  'reviews-badge': REVIEWS_BADGE_STYLES,
  'reduced-motion': REDUCED_MOTION_STYLES,
};

/**
 * 组合按需样式文本。
 *
 * - `blocks === undefined` → 恒等于历史全量 ALL_STYLES（向后兼容）。
 * - `blocks === []`        → 空串（该站点确认零消费，跳过注入）。
 * - 非空子集：自动前置 'theme-vars'（多数块经 var(--umm-*) 消费它）；
 *   含 'neodb-button' 时自动补 'glow-vars'（水印辉光变量）。
 *   输出顺序恒按 ALL_GLOBAL_STYLE_BLOCKS 规范序，与全量注入的层叠语义一致。
 */
export function composeGlobalStyles(blocks?: readonly GlobalStyleBlock[]): string {
  if (!blocks) return ALL_STYLES;
  const requested = new Set(blocks);
  if (requested.size === 0) return '';
  requested.add('theme-vars');
  // reduced-motion 守卫任何子集都必须带上（P-E 波次统一规则，不可按需省略）
  requested.add('reduced-motion');
  if (requested.has('neodb-button')) requested.add('glow-vars');
  return ALL_GLOBAL_STYLE_BLOCKS.filter((b) => requested.has(b))
    .map((b) => GLOBAL_STYLE_BLOCK_SOURCES[b])
    .join('\n');
}

/**
 * Inject global styles
 *
 * @param blocks - 可选按需子集；缺省 = 全量（既有调用方零改动）。
 *                 显式空数组 = 该站点零消费，跳过注入（含暗色翻表）。
 */
export function injectGlobalStyles(blocks?: readonly GlobalStyleBlock[]): void {
  // Check whether already injected
  if (document.getElementById('umm-global-styles')) {
    return;
  }

  const css = composeGlobalStyles(blocks);
  if (css === '') {
    console.log('[UMM] Global styles skipped (empty subset)');
    return;
  }

  const styleElement = document.createElement('style');
  styleElement.id = 'umm-global-styles';
  styleElement.textContent = css;
  document.head.appendChild(styleElement);

  // Dark theme flips semantic vars only — no duplicated rules
  const darkStyleElement = document.createElement('style');
  darkStyleElement.id = 'umm-global-styles-dark';
  darkStyleElement.textContent = ALL_STYLES_DARK;
  document.head.appendChild(darkStyleElement);

  console.log('[UMM] Global styles injected successfully');
}
