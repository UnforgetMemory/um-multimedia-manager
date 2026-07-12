# i18n System Audit

## Overview

UMM has **two independent i18n systems**:

| System | Location | Engine | Consumers | Locales |
|--------|----------|--------|-----------|---------|
| **vue-i18n** | `src/shared/locales/` + `src/shared/plugins/i18n.ts` | `vue-i18n` v9+ (Composition API, `useI18n()`, `$t()`) | Popup (`src/entrypoints/popup/`), Options page (`src/entrypoints/options/`) | `en-US`, `zh-CN`, `zh-TW` |
| **Custom `t()`** | `src/entrypoints/content/i18n/` | Plain string lookup + `{{param}}` replace | All content script modules (handlers, enhancers, UI panels, utils) | `en-US`, `zh-CN`, `zh-HK`, `zh-TW` |

Locale sync between the two is handled via `chrome.storage.onChanged`:
- **vue-i18n → custom**: `useLocaleSync.ts` (Vue composable, listens for `chrome.storage` changes → updates `locale.value`)
- **custom → vue-i18n**: `initI18n()` in `content/i18n/index.ts` reads `chrome.storage.local` key `language` on init, then `startLocaleSync()` listens for changes

## System Architecture

### vue-i18n (SPA)

```
src/shared/locales/en.ts        ─┐
src/shared/locales/zh-CN.ts     ─┤──→ indexed by src/shared/locales/index.ts → messages
src/shared/locales/zh-TW.ts     ─┘
                                       ↓
                              src/shared/plugins/i18n.ts
                              createI18n({ legacy: false, locale, fallbackLocale: 'zh-CN', messages })
                                       ↓
                              src/entrypoints/popup/main.ts  → app.use(i18n)
                              src/entrypoints/options/main.ts → app.use(i18n)
```

Keys use dot-delimited namespaced format: `nav.overview`, `common.save`, `stats.movie`.

### Custom `t()` (Content Script)

```
src/entrypoints/content/i18n/locales.ts  ─── single file with all locales inline
src/entrypoints/content/i18n/index.ts    ─── `t(key, params?)` + `initI18n()` + `setLocale()` + `startLocaleSync()`

Usage: import { t } from '../i18n'
       t('Added Msg', { count: 5 })
```

Keys use short natural-language format: `'Close'`, `'Save'`, `'Added Msg'`.

## Key Overlap Analysis

### Exact Key Name Overlap

The following keys have **identical names** in both systems, with the same semantic meaning:

| Key | vue-i18n value (en) | Custom t() value (en) | Conflict? |
|-----|---------------------|----------------------|-----------|
| `platform.douban` | `'Douban'` | `'Douban'` | ✅ Same (harmless) |
| `platform.imdb` | `'IMDb'` | `'IMDb'` | ✅ Same (harmless) |
| `platform.tmdb` | `'TMDB'` | `'TMDB'` | ✅ Same (harmless) |

These three keys share the exact same name AND the same value. They are defined in both systems independently but never cross-imported, so there is no runtime conflict. However, the duplication means changing a platform name requires updating **two** files.

### Conceptual Overlap (Different Key Names, Same Meaning)

| Concept | vue-i18n key | Custom t() key |
|---------|-------------|----------------|
| Save action | `common.save` | `'Save'` |
| Close action | `common.close` | `'Close'` |
| Rating label | `common.rating` | `'Rating'` |
| Status label | `common.status` | `'Status'` |

These are translationally equivalent but use different key naming conventions and are consumed separately. They do not share definitions — each system has its own literal translation.

## Translation Completeness

### vue-i18n (`src/shared/locales/`)

- **Total keys**: 125
- **`en-US`**: 100% complete (primary language, 125 keys)
- **`zh-CN`**: 100% complete (125 keys)
- **`zh-TW`**: 100% complete (125 keys)

### Custom t() (`src/entrypoints/content/i18n/locales.ts`)

- **Total keys**: varies by locale
- **`en-US`**: 77 keys
- **`zh-CN`**: 77 keys
- **`zh-HK`**: 89 keys (includes extra `status.wish`, `status.doing`, `search.aria_wish`, `search.aria_doing`)
- **`zh-TW`**: 89 keys (same extras as zh-HK)

**Gap**: The `status.wish`, `status.wish_music`, `status.doing`, `status.doing_music`, `search.aria_wish`, `search.aria_doing` keys exist in `zh-HK` and `zh-TW` but are **missing** from `en-US` and `zh-CN` in the custom system. If a user with `en-US` locale encounters wish/doing states, they will see the raw key (e.g. `status.wish`) due to the fallback — not ideal.

### vue-i18n `zh-HK` gap

The vue-i18n system does NOT include a `zh-HK` locale, while the custom system does. Since both systems write locale choice to the same `chrome.storage.local` key (`language`), it's possible for the custom system to set `'zh-HK'` (valid for content scripts) but for vue-i18n to receive an unrecognized locale. The vue-i18n `createI18n` config does **not** explicitly set `fallbackLocale` — it falls back to `'zh-CN'` (the `locale` default), which handles this safely but silently.

## Shadow DOM Isolation Constraint

Content script UIs (Douban overlay panels) use **Shadow DOM** (`overlay.attachShadow({ mode: 'open' })`). The `mountUmmOverlay` function creates a vanilla `createApp(RootCmp)` without any Vue plugin setup:

```ts
// src/content/douban/overlay/mount-app.ts
const app = options.createApp(shadow, ctx)
app.mount(container)
```

None of the ~20 content script page configs pass vue-i18n to the app:

```ts
// Example from src/content/douban/pages/detail/config.ts
createApp: (RootCmp, data) => createApp(RootCmp, { detailData: data }),
```

**No content script Vue component imports `useI18n`**. Components in `src/content/douban/pages/` use either:
1. Raw JS strings (label text, static ARIA labels)
2. The custom `t()` function from `@/entrypoints/content/i18n` (in handlers, utils, UI panels)

This is correct: vue-i18n is a **plugin installed on a Vue app instance**. Shadow DOM apps created ad-hoc in content scripts do not have the vue-i18n plugin installed, so `$t()` / `useI18n()` would throw at runtime. The custom `t()` function is a pure function that works anywhere without Vue plugin dependency.

## Consolidation Feasibility Assessment

### Option A: Merge both systems into vue-i18n (NOT feasible ❌)

**Why not:**
1. **Shadow DOM isolation**: Vue apps in shadow DOM are created via bare `createApp()` without vue-i18n plugin. Adding vue-i18n to every shadow DOM app would require plumbing it through ~20 `config.ts` files and `mount-app.ts`.
2. **Code size** in content scripts: Bundling vue-i18n into content scripts would bloat the content script bundle. vue-i18n is ~7 KB gzipped — unnecessary for the handful of translation lookups used in content script handlers.
3. **Pure-function vs plugin**: The custom `t()` is a pure function callable from any TS module (handlers, utils, observers). vue-i18n's `t()` requires a Vue component context (`useI18n()`) or the global i18n instance — neither is ergonomic inside platform handlers like `imdb.ts`, `javdb.ts`, `sehuatang.ts`.
4. **zh-HK locale**: The custom system supports `zh-HK` with extra keys for `wish`/`doing` states. vue-i18n only has `zh-TW`. Merging would need to either add `zh-HK` to vue-i18n or drop it from the custom system.

### Option B: Merge both systems into the custom `t()` (NOT feasible ❌)

**Why not:**
1. **vue-i18n is a framework requirement**: The popup and options pages use `vue-i18n` per Vue 3 patterns. Migrating those to a custom `t()` function means losing vue-i18n features: `$t()` in templates, locale hot-swapping, pluralization, and `<i18n-t>` components.
2. **Template interpolation**: The popup/options heavily use `{{ t('key') }}` in Vue templates. Switching to a custom import would break the declarative template pattern.
3. **Shared components**: `HeatmapCalendar.vue`, `PlatformDistribution.vue`, `PlatformSearchForm.vue` in `src/shared/` use `vue-i18n` and are consumed by the options page. These would need to be refactored if vue-i18n were removed.

### Option C: Keep both systems, reduce key duplication (RECOMMENDED ✅)

**Keep the two-system architecture** but address the pain points:

1. **Eliminate exact key overlap**: Remove `platform.douban`, `platform.imdb`, `platform.tmdb` from the custom system's `locales.ts`. Content script code that resolves platform names should use the vue-i18n key style or a utility that bridges both systems. These three keys are the only exact duplicates — low-hanging fruit.

2. **Add missing `en-US` and `zh-CN` keys** to the custom system: `status.wish`, `status.wish_music`, `status.doing`, `status.doing_music`, `search.aria_wish`, `search.aria_doing` are present in `zh-HK`/`zh-TW` but missing from `en-US`/`zh-CN`.

3. **Document the cross-system sync**: The `chrome.storage.onChanged` listener in both directions is already in place but not documented anywhere. Keep this as the sync mechanism.

4. **No shared key file**: Because the two systems target fundamentally different rendering environments (Vue SPA vs Shadow DOM + pure TS), a shared key registry would add coupling without meaningful savings.

## Summary

| Aspect | verdict |
|--------|---------|
| Single system merge | ❌ Not feasible (Shadow DOM + platform constraints) |
| Key overlap severity | 🟢 Low — only 3 exact duplicates (platform names) |
| Conceptual key overlap | 🟡 Medium — 4 pairs, but no runtime conflict |
| Translation completeness (vue-i18n) | 🟢 100% across 3 locales |
| Translation completeness (custom t()) | 🟡 `en-US`/`zh-CN` missing 6 keys present in `zh-HK`/`zh-TW` |
| Shadow DOM isolation | 🟢 Handled correctly — no violation |
| Locale sync | 🟢 Working via `chrome.storage.onChanged` |
| **Recommendation** | Keep two systems, deduplicate 3 platform keys, backfill missing keys |
