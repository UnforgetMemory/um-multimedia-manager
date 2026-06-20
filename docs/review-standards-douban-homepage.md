# Standards Review: Douban Homepage Vue Migration

**Commit**: `8ec3f58` (feat(douban-homepage): refactor to modular package with CSS class system)
**Files reviewed**: 15 new files in `src/entrypoints/douban-homepage.content/` + modified `global.ts` and `router.ts`

---

## 1. 📛 DEAD CODE — `UmmHomepage.vue` (hard violation)
**File**: `src/entrypoints/douban-homepage.content/components/UmmHomepage.vue`
**Standard**: AGENTS.md — "No dead code artifacts"

`UmmHomepage.vue` is never imported by any file (`grep` confirms zero references). It's a sibling alternative to `App.vue` (the actual component mounted by `index.ts`). Both define nearly identical template layouts. Delete it.

---

## 2. 📛 DEAD CSS — `HOMEPAGE_BADGE_STYLES` in `global.ts` (hard violation)
**File**: `src/entrypoints/content/styles/global.ts` lines 210-243
**Standard**: AGENTS.md — "No dead code artifacts"

The `HOMEPAGE_BADGE_STYLES` template literal defines `.umm-homepage-badge` classes. These were consumed by the deleted `douban-homepage.ts` enhancer. The new Vue components use `.umm-badge` classes from their own `style.css` (Shadow DOM). The global styles are orphaned — no code references them.

---

## 3. 📛 ARCHITECTURE — Bypasses centralized router (hard violation)
**File**: `src/entrypoints/douban-homepage.content/index.ts`
**Standard**: AGENTS.md — "Content script dispatches via `router.ts` to per-platform handlers and enhancers"

The new code is a standalone WXT content script entrypoint with its own `defineContentScript({ matches: ['https://movie.douban.com/'] })`. This matches a URL that `router.ts` previously dispatched — and this commit removes that route from the router. The effect is the same, but the mechanism breaks the centralized dispatch pattern documented in AGENTS.md.

Instead of adding a new WXT entrypoint, the correct pattern would be to add a new handler function in `content/handlers/` or `content/enhancers/` and wire it through `router.ts`, consistent with every other handler in the project.

---

## 4. 📛 SECURITY — `innerHTML` in `UmmReviewsSection.vue` (medium)
**File**: `src/entrypoints/douban-homepage.content/components/UmmReviewsSection.vue` line 37
**Standard**: AGENTS.md / security hardening practice

`badge.innerHTML = \`${label}${ratingText}\`` — the `label` is either `'✅'` or `'⏳'` (safe), and `ratingText` comes from `Utils.formatRating10(userRating)` which returns controlled content. Risk is low but unnecessary: use `textContent` instead of `innerHTML` for known-plaintext content. Also: `dataset.ummRebuilt = 'true'` (line 13) — avoid `string` for boolean flags; consider a CSS class toggle instead.

---

## 5. 📛 FUNCTIONAL REGRESSION — No dark mode support (judgement call)
**Standard**: Previous `douban-homepage.ts` had full `THEME_VARS` light/dark system; `tsconfig.json` `strict: true`

The old enhancer had 40+ lines of theme CSS variables and media-query-driven dark mode. The new `style.css` has zero dark-mode styles. Shadow DOM isolates these components from the host page's theme, so the old approach of CSS variables won't work directly — but this is a regression for users who browse Douban in dark mode.

---

## 6. 📛 BADGE STALENESS — Watch semantics in `UmmReviewsSection.vue` (consider)
**File**: `UmmReviewsSection.vue` line 46
`watch(() => props.records, enhanceReviews, { deep: false })`

Without `deep: true`, this fires only when the `Map` reference changes (i.e., entire reload). If a single record's status/rating updates, `enhanceReviews` is not re-invoked — already-injected badges show stale data. The `dataset.ummRebuilt` guard prevents re-injection but doesn't update existing badges.

---

## Summary

| Severity | Count |
|----------|-------|
| Hard violation | 3 (dead UmmHomepage.vue, dead global styles, router bypass) |
| Medium | 1 (innerHTML) |
| Judgement call | 2 (dark mode, badge staleness) |
