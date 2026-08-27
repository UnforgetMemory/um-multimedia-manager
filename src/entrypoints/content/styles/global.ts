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
 */

import {
  COLOR_PRIMARY_START, COLOR_PRIMARY_END, COLOR_PRIMARY_SHADOW,
  COLOR_DONE_START, COLOR_DONE_END, COLOR_DONE_TEXT, COLOR_DONE_BORDER, COLOR_DONE_SHADOW,
  COLOR_WISH_START, COLOR_WISH_END, COLOR_WISH_TEXT, COLOR_WISH_BORDER, COLOR_WISH_SHADOW,
  COLOR_DOING_START, COLOR_DOING_END, COLOR_DOING_TEXT, COLOR_DOING_BORDER, COLOR_DOING_SHADOW,
  COLOR_NONE_START, COLOR_NONE_END, COLOR_NONE_TEXT, COLOR_NONE_BORDER, COLOR_NONE_SHADOW,
  COLOR_MINUS_END, COLOR_MINUS_SHADOW,
  COLOR_PLUS_END, COLOR_PLUS_SHADOW,
  COLOR_ORIGINAL_END, COLOR_ORIGINAL_SHADOW,
  COLOR_NEOGLOW_BASE, COLOR_NEOGLOW_BRIGHT, COLOR_NEOGLOW_SHADOW_1, COLOR_NEOGLOW_SHADOW_2, COLOR_NEOGLOW_SHADOW_3,
  COLOR_CHIP_SHADOW, COLOR_CHIP_SHADOW_HOVER, COLOR_CHIP_BORDER,
  COLOR_RATING_BG, COLOR_RATING_TEXT,
  COLOR_PRIMARY_START_DARK, COLOR_PRIMARY_SHADOW_DARK,
  COLOR_DONE_START_DARK, COLOR_DONE_TEXT_DARK, COLOR_DONE_BORDER_DARK, COLOR_DONE_SHADOW_DARK,
  COLOR_WISH_FILL_DARK, COLOR_WISH_INK_DARK, COLOR_WISH_BORDER_DARK,
  COLOR_WISH_SHADOW_DARK,
  COLOR_DOING_START_DARK, COLOR_DOING_TEXT_DARK, COLOR_DOING_BORDER_DARK, COLOR_DOING_SHADOW_DARK,
  COLOR_NONE_START_DARK, COLOR_NONE_TEXT_DARK, COLOR_NONE_BORDER_DARK, COLOR_NONE_SHADOW_DARK,
  COLOR_MINUS_SHADOW_DARK,
  COLOR_PLUS_SHADOW_DARK,
  COLOR_ORIGINAL_SHADOW_DARK,
  COLOR_NEOGLOW_BASE_DARK, COLOR_NEOGLOW_SHADOW_1_DARK, COLOR_NEOGLOW_SHADOW_2_DARK, COLOR_NEOGLOW_SHADOW_3_DARK,
  COLOR_RATING_BG_DARK, COLOR_RATING_TEXT_DARK,
} from './tokens'

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
const THEME_VARS = `
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
}
`

const THEME_VARS_DARK = `
html[data-umm-theme="dark"] {
  --usl-fill-primary: ${COLOR_PRIMARY_START_DARK};
  --usl-shadow-primary: 0 2px 4px ${COLOR_PRIMARY_SHADOW_DARK};
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
}
`

/**
 * Search badge styles
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
const LIST_STATUS_STYLES = `
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
 * NeoDB push button styles
 * CANONICAL: interest.css owns the Shadow DOM styling; this is the light-DOM twin,
 * values aligned with design-tokens (solid 700-tier fills x white ink, AA).
 */
const NEODB_BUTTON_STYLES = `
.umm-neodb-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  margin: 4px 8px 4px 0;
  font-size: 13px;
  font-weight: 700;
  border: 1px solid var(--usl-neodb-border, transparent);
  border-radius: 8px;
  background: var(--usl-fill-primary);
  color: var(--usl-ink-on-fill);
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
  background: var(--usl-neodb-minus);
  color: var(--usl-ink-neodb-minus);
  box-shadow: var(--usl-shadow-neodb-minus);
}
.umm-neodb-btn--plus {
  background: var(--usl-neodb-plus);
  color: var(--usl-ink-neodb-plus);
  box-shadow: var(--usl-shadow-neodb-plus);
}
.umm-neodb-btn--original {
  background: var(--usl-neodb-original);
  color: var(--usl-ink-neodb-original);
  box-shadow: var(--usl-shadow-neodb-original);
}
.umm-neodb-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}
.umm-neodb-synced .umm-neodb-watermark {
  animation: umm-neodb-glow 2s ease-in-out 3 alternate;
  animation-fill-mode: forwards;
  color: var(--usl-neodb-glow-base) !important;
  text-shadow:
    0 0 10px var(--usl-neodb-glow-s1),
    0 0 20px var(--usl-neodb-glow-s2),
    0 0 30px var(--usl-neodb-glow-s3) !important;
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
 * Dimmer styles (Mukaku and PT sites)
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
 * Homepage badge styles
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
  background: var(--usl-fill-done);
  color: var(--usl-ink-done);
  border: 1px solid var(--usl-border-done);
}
.umm-homepage-badge[data-status="none"] {
  background: var(--usl-fill-none);
  color: var(--usl-ink-none);
  border: 1px solid var(--usl-border-none);
}
.umm-homepage-badge[data-status="wish"] {
  background: var(--usl-fill-wish);
  color: var(--usl-ink-wish);
  border: 1px solid var(--usl-border-wish);
}
.umm-homepage-badge[data-status="doing"] {
  background: var(--usl-fill-doing);
  color: var(--usl-ink-doing);
  border: 1px solid var(--usl-border-doing);
}
`

/**
 * Shared UI component styles (for content/ui/*.ts panel/modal)
 */
const UI_COMPONENT_STYLES = `
.umm-panel {
  background: var(--umm-bg, #ffffff);
  border: 1px solid var(--umm-border, #e3e8f0);
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
}
.umm-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.7);
  z-index: 300;
  display: flex;
  justify-content: center;
  align-items: center;
}
.umm-panel-title {
  margin: 0;
  color: var(--umm-link, #3a55ec);
  text-align: center;
}
.umm-input {
  background: var(--umm-bg-secondary, #f7f9fc);
  border: 1px solid var(--umm-border, #e3e8f0);
  color: var(--umm-text-primary, #151a23);
  padding: 10px;
  border-radius: 6px;
  outline: none;
  width: 100%;
  box-sizing: border-box;
}
.umm-input:focus {
  border-color: var(--umm-link, #3a55ec);
}
.umm-btn {
  padding: 8px 16px;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  font-weight: bold;
}
.umm-btn--primary {
  background: var(--umm-link, #3a55ec);
  color: var(--umm-bg, #ffffff);
}
.umm-btn--secondary {
  background: var(--umm-bg-secondary, #f7f9fc);
  color: var(--umm-text-secondary, #4d5870);
}
.umm-label-text {
  font-size: 0.9rem;
  color: var(--umm-text-muted, #94a0b5);
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
`

/**
 * Focus-visible styles (keyboard navigation)
 */
const FOCUS_VISIBLE_STYLES = `
:focus-visible {
  outline: 2px solid var(--umm-link, #3a55ec);
  outline-offset: 2px;
  border-radius: 4px;
}

.umm-dl-trigger:focus-visible,
.umm-pill-btn:focus-visible,
.umm-island-nav-link:focus-visible,
.umm-search-submit:focus-visible,
.umm-island-submit:focus-visible,
.umm-page-link:focus-visible,
.umm-page-go:focus-visible,
button:focus-visible,
a:focus-visible,
input:focus-visible,
select:focus-visible {
  outline: 2px solid var(--umm-link, #3a55ec);
  outline-offset: 2px;
}
`

/**
 * Global scrollbar styles
 */
const SCROLLBAR_STYLES = `
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: var(--umm-border, rgba(0, 0, 0, 0.1));
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--umm-border-hover, rgba(0, 0, 0, 0.2));
}

* {
  scrollbar-width: thin;
  scrollbar-color: var(--umm-border, rgba(0, 0, 0, 0.1)) transparent;
}
`

/**
 * Review-page status badge styles
 * Ink declared via semantic vars — no rule-order reliance
 */
const REVIEWS_BADGE_STYLES = `
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
