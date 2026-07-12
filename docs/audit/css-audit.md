# CSS / Token Duplication Audit

Generated: 2026-07-12  
Scope: All 4 token systems + 36 Shadow DOM CSS files + 2 global-injection TS files

---

## 1. Token System Overview

| System | File | Scope | Mechanism |
|--------|------|-------|-----------|
| **A. Tailwind @theme** | `src/shared/styles/style.css` | Popup/Options SPA | Tailwind v4 `@theme` block + `@layer base` |
| **B. Shadow DOM tokens** | `src/content/douban/styles/design-tokens.css` | Content script overlays | `:host` CSS custom properties, `?raw` imported |
| **C. JS template constants** | `src/entrypoints/content/styles/tokens.ts` | Global injection & Shadow DOM | Named TS exports, interpolated into template strings |
| **D. Global injection** | `src/entrypoints/content/styles/global.ts` | Document `<head>` injection | `injectGlobalStyles()` — fully inline CSS strings |

---

## 2. Token Value Comparison

### 2a. Shared `--umm-*` Tokens

| Token | style.css (A) Light | design-tokens.css (B) Light | Match? |
|-------|-------------------|---------------------------|--------|
| `--umm-color-surface` | `hsl(0 0% 100%)` | `hsl(0 0% 100%)` | ✅ |
| `--umm-color-surface-secondary` | `hsl(240 5% 96%)` | `hsl(210 17% 98%)` | ❌ |
| `--umm-color-text-primary` | `hsl(240 10% 3.9%)` | `hsl(0 0% 10%)` | ❌ |
| `--umm-color-text-secondary` | `hsl(240 3.8% 46.1%)` | `hsl(0 0% 40%)` | ❌ |
| `--umm-color-status-unknown` | `hsl(220 9% 46%)` | `hsl(220 9% 46%)` | ✅ |
| `--umm-color-status-unwatched` | `hsl(215 16% 47%)` | `hsl(220 9% 46%)` | ❌ |
| `--umm-color-status-watched` | `hsl(217 91% 60%)` | `hsl(155 73% 25%)` | ❌ |
| `--umm-color-status-done` | `hsl(160 84% 39%)` | `hsl(155 73% 25%)` | ❌ |

| Token | style.css (A) Dark | design-tokens.css (B) Dark | Match? |
|-------|-------------------|---------------------------|--------|
| `--umm-color-surface` | `hsl(240 5% 15%)` | `hsl(230 10% 13%)` | ❌ |
| `--umm-color-text-primary` | `hsl(0 0% 98%)` | `hsl(0 0% 88%)` | ❌ |
| `--umm-color-status-done` | `hsl(160 84% 49%)` | `hsl(143 51% 36%)` | ❌ |

### 2b. Spacing Scale Divergence

Both systems declare `--umm-space-*` but use different units:

| Token | style.css (A) | design-tokens.css (B) | Equivalent at 16px? |
|-------|--------------|---------------------|-------------------|
| `--umm-space-0-5` | `0.125rem` | `2px` | ✅ (2px) |
| `--umm-space-1` | `0.25rem` | `4px` | ✅ (4px) |
| `--umm-space-2` | `0.5rem` | `8px` | ✅ (8px) |
| `--umm-space-3` | `0.75rem` | `12px` | ✅ (12px) |
| `--umm-space-4` | `1rem` | `16px` | ✅ (16px) |
| `--umm-space-5` | `1.25rem` | `20px` | ✅ (20px) |
| `--umm-space-6` | `1.5rem` | `24px` | ✅ (24px) |
| `--umm-space-8` | `2rem` | `32px` | ✅ (32px) |
| `--umm-space-10` | `2.5rem` | `40px` | ✅ (40px) |
| `--umm-space-12` | `3rem` | `48px` | ✅ (48px) |
| `--umm-space-16` | `4rem` | `64px` | ✅ (64px) |
| `--umm-space-20` | `5rem` | `80px` | ✅ (80px) |

Values are equivalent at 16px base, but `em` vs `px` could diverge if user changes font-size.

### 2c. Status Badge Colors (System B vs System C/D)

| Variant | design-tokens.css (B) Light | tokens.ts (C) / global.ts (D) Light | Match? |
|---------|---------------------------|--------------------------------------|--------|
| Done light bg | Defined via `--umm-color-status-done: hsl(155 73% 25%)` | `rgba(17, 111, 70, 0.96)` → `rgba(11, 83, 53, 0.98)` | N/A (different format) |
| None light bg | `--umm-color-status-unknown: hsl(220 9% 46%)` | `rgba(164, 43, 60, 0.96)` → `rgba(126, 28, 48, 0.98)` | N/A (different semantics) |
| Primary blue | Not defined | `#1757d6` → `#0d47b8` | Only in C/D |

System C/D uses **gradient** colors (start/end pairs), while System B uses **solid** HSL colors. These serve different visual purposes — C/D is for badge/chip gradients, B is for general text/surface.

---

## 3. CSS Rule Duplication Analysis

### 3a. 🔴 HIGH: Scrollbar Styles (6+ copies)

**"::-webkit-scrollbar" patterns found in:**

| File | Lines | Notes |
|------|-------|-------|
| `style.css` | 513-527 | Global popup/options (6px width) |
| `base.css` | 20-35 | Shadow DOM (`:host` scoped) (6px) |
| `global.ts` (SCROLLBAR_STYLES) | 419-442 | Global injection (6px) |
| `homepage.css` | 23-37 | 4px height variant |
| `book-homepage.css` | 263-276 | Duplicate of music-homepage.css |
| `music-homepage.css` | 216-228 | Duplicate of book-homepage.css |

**Estimate: 4 unique copies of `::-webkit-scrollbar` could be consolidated into 1 shared file.**

### 3b. 🔴 HIGH: `.umm-status` Badge (3 copies + dark variants)

| File | Lines | Scope |
|------|-------|-------|
| `base.css` | 112-189 | Shadow DOM (`:host` scoped) |
| `global.ts` (REVIEWS_BADGE_STYLES) | 449-505 | Global injection |

The base.css `.umm-status` uses hardcoded hex colors (`#22c55e`, `#ef4444`, etc.) for both light and dark. global.ts REVIEWS_BADGE_STYLES duplicates the same CSS class name with identical light-theme values but different dark-theme values (uses `COLOR_*_DARK` tokens vs hardcoded `#15803d` etc.).

### 3c. 🔴 HIGH: Pagination Components (8+ copies)

Each file defines its own `.umm-paginator` or equivalent with near-identical structure:

| File | Class Prefix | Lines | Est. Overlap |
|------|-------------|-------|-------------|
| `search.css` | `.umm-page-link` | 274-368 | ~70% |
| `paginator.css` | `.umm-paginator-btn` | 1-58 | ~80% |
| `user-media.css` | `.umm-umedia-page` | 241-275 | ~75% |
| `user-reviews.css` | `.umm-reviews-page` | 212-242 | ~75% |
| `doulists.css` | `.umm-doulist-page` | 416-446 | ~75% |
| `doulist-detail.css` | `.umm-dlist-page-btn` | 326-365 | ~60% |
| `book-reviews.css` | `.umm-reviews-page` | 163-193 | ~75% |
| `celebrities.css` | `.umm-celebrities-page` | 163-193 | ~75% |
| `user-celebrities.css` | `(none)` | — | N/A |

All share: `display: inline-flex; align-items: center; justify-content: center; min-width: 28px; height: 28px; padding: 0 7px; border-radius: 6px; font-size: var(--umm-font-xs, 0.75rem); font-weight: 500; color: var(--umm-text-secondary); ... --active` variant.

**Estimate: 80%+ of paginator CSS (8× ~30 lines = ~240 lines) could be consolidated into 1 shared file.**

### 3d. 🟡 MEDIUM: NeoDB Button Styles (2 copies)

| File | Lines | Scope |
|------|-------|-------|
| `interest.css` | 434-543 | Shadow DOM |
| `global.ts` (NEODB_BUTTON_STYLES) | 166-238 | Global injection |

The Shadow DOM version uses hardcoded colors (`#d97706`, `#16a34a`, etc.). The global version uses tokens.ts constants. The values are identical but the maintenance burden is double — any color change must be applied in both places and verified for consistency.

### 3e. 🟡 MEDIUM: `.umm-hero` Layout (3 copies across profile pages)

| File | Lines | Est. Overlap |
|------|-------|-------------|
| `user-profile.css` | 25-64 | ~80% |
| `book-profile.css` | 64-108 | ~80% |
| `movie-profile.css` | 20-49 | ~70% |

All three share the identical `.umm-hero { display: flex; gap: 24px; align-items: center; margin-bottom: 32px; }` pattern with `.umm-hero-avatar`, `.umm-hero-body`, `.umm-hero-name`.

### 3f. 🟡 MEDIUM: Title Bar with Left Stripe (7+ copies)

Pattern: `display: flex; align-items: baseline; gap: var(--umm-space-sm, 12px); margin-bottom: var(--umm-space-lg, 24px); padding-left: var(--umm-space-sm, 10px); border-left: 3px solid var(--X-accent);`

| File | Class |
|------|-------|
| `user-media.css` | `.umm-umedia-titlebar` |
| `user-reviews.css` | `.umm-reviews-titlebar` |
| `book-reviews.css` | `.umm-reviews-titlebar` |
| `book-collect.css` | `.umm-bc-titlebar` |
| `book-authors.css` | `.umm-authors-titlebar` |
| `celebrities/user-celebrities.css` | `.umm-celebrities-titlebar` |
| `game-collect.css` | `.umm-gc-titlebar` |

**Estimate: 7 copies × ~15 lines = ~105 lines of near-identical CSS.**

### 3g. 🟡 MEDIUM: `.umm-empty` / Empty State (8+ copies)

| File | Class | Lines |
|------|-------|-------|
| `user-profile.css` | `.umm-empty` | 283-291 |
| `book-profile.css` | `.umm-empty` | 520-528 |
| `authors.css` | `.umm-empty` | 95-102 |
| `book-reviews.css` | `.umm-empty` | 196-203 |
| `user-reviews.css` | `.umm-empty` | 245-252 |
| `doulists.css` | `.umm-doulists-empty` | 405-412 |
| `search.css` | `.umm-search-empty` | 267-271 |
| `user-media.css` | `.umm-umedia-empty` | 278-295 |

Each is ~6-10 lines with the pattern `display: flex; align-items: center; justify-content: center; padding: var(--umm-space-2xl, ...) var(--umm-space-xl, ...); font-size: var(--umm-font-base, ...); color: var(--umm-text-muted); text-align: center;`

### 3h. 🟢 LOW: `.umm-rec-item` / `.umm-rec-cover` Recommendation Card (4+ copies)

| File | Lines | Notes |
|------|-------|-------|
| `detail.css` | 195-205 | Movie detail |
| `homepage.css` | 443-469 | Main homepage |
| `personage.css` | 344-381 | Personage page |
| `music-homepage.css` | 74-107 | Music homepage |

Now using CSS variables, so minor differences exist. Still ~75% overlap.

### 3i. 🟢 LOW: Media Chip Colors (2 copies, identical)

| File | Lines |
|------|-------|
| `search.css` | 190-213 |
| `albums.css` | 139-161 |

Both define `.umm-chip-cd`, `.umm-chip-dvd`, `.umm-chip-vinyl` etc. with **identical** hex values and dark variants.

### 3j. Breakpoints Analysis

**breakpoints.css** (`src/content/douban/styles/`) — 12-level responsive system for Shadow DOM pages. Uses named `--umm-*` CSS variables.

**style.css** (`src/shared/styles/`) — 12 Tailwind breakpoints as `--breakpoint-*` variables.

These are **different systems** for different purposes:
- style.css breakpoints set Tailwind's responsive prefixes (`sm:`, `md:`, etc.)
- breakpoints.css provides Shadow DOM font/spacing/card variables at each viewport width

**Verdict: Not truly duplicated, but the lack of a single source of truth means adding a breakpoint requires updating both files.**

---

## 4. Overall Overlap Percentages

| Category | Est. Duplicate Lines | % of 36 CSS Files |
|----------|-------------------|-------------------|
| Scrollbar styles | ~80 lines across 6 files | 17% |
| Pagination | ~240 lines across 8 files | 22% |
| Status badges | ~150 lines across 2 files + global.ts | 6% |
| User bar | ~200 lines across 5 files | 14% |
| Title bars (stripe) | ~105 lines across 7 files | 19% |
| Empty states | ~70 lines across 8 files | 22% |
| NeoDB buttons | ~120 lines across 2 files | 6% |
| Recommendation cards | ~120 lines across 4 files | 11% |
| Hero sections | ~80 lines across 3 files | 8% |
| Media chip colors | ~50 lines across 2 files | 6% |

**Estimated total duplicated CSS: ~1,215 lines out of ~4,500 total CSS lines = ~27% duplication.**

---

## 5. Token Overlap: style.css vs design-tokens.css

### Shared token names (same name, potentially different value):

| Token Name | style.css Light | design-tokens.css Light | Match? |
|------------|----------------|------------------------|--------|
| `--umm-color-surface` | `hsl(0 0% 100%)` | `hsl(0 0% 100%)` | ✅ |
| `--umm-color-surface-secondary` | `hsl(240 5% 96%)` | `hsl(210 17% 98%)` | ❌ |
| `--umm-color-surface-elevated` | `hsl(0 0% 100%)` | `hsl(0 0% 100%)` | ✅ |
| `--umm-color-text-primary` | `hsl(240 10% 3.9%)` | `hsl(0 0% 10%)` | ❌ |
| `--umm-color-text-secondary` | `hsl(240 3.8% 46.1%)` | `hsl(0 0% 40%)` | ❌ |
| `--umm-color-text-tertiary` | `hsl(240 3.8% 46.1% / 0.6)` | n/a | N/A |
| `--umm-color-status-unknown` | `hsl(220 9% 46%)` | `hsl(220 9% 46%)` | ✅ |
| `--umm-color-status-unwatched` | `hsl(215 16% 47%)` | `hsl(220 9% 46%)` | ❌ |
| `--umm-color-status-watched` | `hsl(217 91% 60%)` | `hsl(155 73% 25%)` | ❌ |
| `--umm-color-status-done` | `hsl(160 84% 39%)` | `hsl(155 73% 25%)` | ❌ |
| `--umm-space-0` | `0` | `0` | ✅ |
| `--umm-space-1` | `0.25rem` | `4px` | ✅ (equiv) |
| `--umm-space-2` | `0.5rem` | `8px` | ✅ (equiv) |
| `--umm-space-3` | `0.75rem` | `12px` | ✅ (equiv) |
| `--umm-space-4` | `1rem` | `16px` | ✅ (equiv) |

**Token overlap: ~14 shared token names, ~5 have different values. ~36% mismatch rate on shared names.**

### Tokens unique to each system:

**style.css only (no equivalent in design-tokens.css):**
- All shadcn/vue base tokens (`--background`, `--foreground`, `--primary`, etc.)
- Layer/section/interactive system (20+ tokens)
- Typography system (21 tokens)
- Badge gradient colors (14 tokens)
- Bar chart colors (4 tokens)
- Animations & keyframes (5 tokens)
- Layout tokens (`--popup-max-width`, `--page-margin`, etc.)
- State colors (`--color-state-success`, etc.)

**design-tokens.css only (no equivalent in style.css):**
- Dynamic Island tokens (11 tokens)
- Rating gold tiers (3 tokens)
- Aspect ratio tokens (3 tokens)
- Radius tokens (5 tokens)
- Shadow tokens (4 tokens)
- Z-index scale (8 tokens)
- Link colors (2 tokens)

---

## 6. Consolidation Recommendations

### P0 — High Effort, High Impact

| # | Recommendation | Effort | Est. Savings | Risk |
|---|---------------|--------|-------------|------|
| 1 | **Create `src/shared/styles/scrollbar.css`** — single source with `--umm-*` variable overrides | 2h | −80 lines, 6→1 files | Low |
| 2 | **Create shared `paginator.css`** — single Shadow DOM paginator with accent color prop | 4h | −240 lines, 8→1 files | Medium |
| 3 | **Create shared `empty-state.css`** — single `.umm-empty` utility class | 1h | −70 lines, 8→1 files | Low |

### P1 — Medium Effort, Medium Impact

| # | Recommendation | Effort | Est. Savings | Risk |
|---|---------------|--------|-------------|------|
| 4 | **Create shared `title-bar.css`** — single left-stripe title bar pattern | 2h | −105 lines, 7→1 files | Low |
| 5 | **Create shared `user-bar.css`** — single user bar pattern with `--umm-ub-accent` | 3h | −200 lines, 5→1 files | Medium |
| 6 | **Extract `umm-status-*` into a single shared source** — currently in base.css + global.ts with different dark values | 3h | −150 lines | Medium |

### P2 — Lower Priority

| # | Recommendation | Effort | Est. Savings | Risk |
|---|---------------|--------|-------------|------|
| 7 | **Unify `--umm-color-text-*` and `--umm-color-status-*` values** between style.css and design-tokens.css | 2h | Fix 36% token mismatch | Low |
| 8 | **Consolidate `.umm-hero` into a shared pattern** | 2h | −80 lines, 3→1 files | Low |
| 9 | **Consolidate `.umm-rec-item` card pattern** | 2h | −120 lines, 4→1 files | Low |
| 10 | **Single source for media chip colors** | 1h | −50 lines, 2→1 files | Low |

### P3 — Nice to Have

| # | Recommendation | Effort | Est. Savings | Risk |
|---|---------------|--------|-------------|------|
| 11 | **Single source for NeoDB button styles** — consolidate interest.css and global.ts | 4h | −120 lines | Medium |
| 12 | **Align style.css and breakpoints.css breakpoint systems** | 2h | Documentation only | Low |

---

## 7. Specific Duplicate Rules Found

### Exact duplicate: Scrollbar (book-homepage.css ⇔ music-homepage.css)

```css
/* book-homepage.css:263-276 — IDENTICAL to music-homepage.css:216-228 */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: var(--umm-bg-secondary, #f8f9fa); }
::-webkit-scrollbar-thumb { background: var(--umm-border, #e5e7eb); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--umm-text-muted, #9ca3af); }
```

### Exact duplicate: Media chip colors (albums.css ⇔ search.css)

```css
/* albums.css:139-149 — IDENTICAL to search.css:190-200 */
.umm-chip-cd       { background: #546e7a; }
.umm-chip-dvd      { background: #7b1fa2; }
/* ... 11 more variants */
```

### Near-duplicate: `.umm-rec-item` pattern (homepage.css:443-453 vs detail.css:200-205)

Both define:
```css
.umm-rec-item { display: flex; flex-direction: column; gap: 6px; border-radius: var(--umm-card-radius, 8px); overflow: hidden; }
.umm-rec-item:hover { transform: translateY(-2px); }
```

### Near-duplicate: `.umm-empty` pattern (7+ files)

```css
.umm-empty { display: flex; align-items: center; justify-content: center; padding: var(--umm-space-2xl, ...) var(--umm-space-xl, ...); font-size: var(--umm-font-base, ...); color: var(--umm-text-muted); }
```

---

## 8. Shared Pattern Extraction Opportunities

### Pattern 1: Card Grid Component
Used by user-profile, book-profile, movie-profile, user-media — same `.umm-dash-grid` + `.umm-dash-card` + `.umm-dash-card-cover` + `.umm-dash-card-title` structure with minor variations. Could be extracted into a shared CSS component file.

### Pattern 2: Pagination Component
All 8+ paginator implementations follow the same template — button/ellipsis/active states with `--X-accent` for coloring. Perfect extraction candidate.

### Pattern 3: Filter/Option Bar
Used by search, user-media, book-collect — all have the same pill-button group pattern with `--active` state.

### Pattern 4: NeoDB Button
Currently in `interest.css` (Shadow DOM) and `global.ts` (global injection). The Shadow DOM version is the canonical source; global.ts duplicates it with token.ts values. Verification: the colors match, but any change requires updating 2 files.

---

## 9. Quick Wins

1. **Deduplicate scrollbar**: Copy `base.css` `:host::-webkit-scrollbar` → 1 shared file, import where needed
2. **Deduplicate media chip colors**: Import from `search.css` into `albums.css`
3. **Deduplicate `.umm-empty`**: Extract to a shared utility class
4. **Fix `--umm-color-text-primary` mismatch**: Decide whether style.css (hsl(240 10% 3.9%) → dark) or design-tokens.css (hsl(0 0% 10%) → lighter) is correct, align the other

---

## 10. Summary

- **36 CSS files analyzed**, ~4,500 CSS lines total
- **~27% duplication** (~1,215 lines) across scrollbars, paginators, status badges, user bars, title bars, empty states, and card patterns
- **~36% token mismatch** between style.css and design-tokens.css for shared `--umm-*` token names
- **12 consolidation opportunities** identified (3 high-impact, 3 medium, 3 low, 3 nice-to-have)
- **Quick wins**: scrollbar dedup (~2h), media chip colors (~1h), empty state (~1h), token alignment (~2h)
