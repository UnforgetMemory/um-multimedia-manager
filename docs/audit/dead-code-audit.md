# Dead Code Audit — Legacy Content Script Handlers

**Date:** 2026-07-12
**Auditor:** dead-code-auditor (team umm-wave1-audit)
**Scope:** `src/entrypoints/content/` — legacy injection system

---

## Context

This project has **two content injection systems** running concurrently:

1. **Legacy:** `src/entrypoints/content.ts` → `src/entrypoints/content/router.ts` → handlers + enhancers
2. **New:** `src/entrypoints/douban-early.content/index.ts` + `src/entrypoints/douban-main.content/index.ts` → `src/content/douban/` (Vue 3 overlay apps for 29 Douban page types)

Both systems inject into **the same Douban pages** (`movie.douban.com`, `music.douban.com`, `book.douban.com`, `search.douban.com`, `www.douban.com`). The new system provides Vue overlay UIs; the legacy system provides background tasks (theme sync, DB sync, NeoDB push, doulist replacement).

**Non-Douban handlers** (IMDb, NeoDB, Mukaku, Sehuatang, JavDB, PT sites) are served **only** by the legacy system — no replacement exists.

---

## Summary Table

| File | Status | Import Trace | Recommendation |
|------|--------|-------------|----------------|
| **handlers/douban.ts** | ACTIVE (transitional) | `router.ts` → `handleDoubanDetailPage` | KEEP — provides theme sync, DB sync, NeoDB push, doulist replacement; runs alongside new Vue overlay |
| **handlers/douban-scanner.ts** | ACTIVE (transitional) | `handlers/douban.ts` → `scanDoubanPageStatus`; also `handlers/douban-neodb.ts` | KEEP — shared scanner for douban handler chain |
| **handlers/douban-sync.ts** | ACTIVE (transitional) | `handlers/douban.ts` → `getLocalRecord`, `syncToLocalStorage` | KEEP — barrel re-export; backs entire douban handler chain |
| **handlers/douban-sync/index.ts** | ACTIVE (transitional) | Re-exported by `handlers/douban-sync.ts` | KEEP — public API barrel |
| **handlers/douban-sync/sync-db.ts** | ACTIVE (transitional) | `douban-sync/index.ts` → `syncToLocalStorage`, `getLocalRecord` | KEEP — IndexedDB sync logic |
| **handlers/douban-sync/sync-neodb.ts** | ACTIVE (transitional) | `douban-sync/index.ts` → `syncNeoDBRecord` | KEEP — NeoDB push/pull from douban sync |
| **handlers/douban-sync/sync-cross-platform.ts** | ACTIVE (transitional) | `douban-sync/index.ts` → `checkCrossPlatformRecords` | KEEP — IMDb/TMDB linking |
| **handlers/douban-neodb.ts** | ACTIVE (transitional) | `handlers/douban.ts` → `injectNeoDBPushButtons` | KEEP — NeoDB push buttons (duplicated by `content/neodb-push.ts` — see notes) |
| **handlers/douban-toast.ts** | ACTIVE (transitional) | `handlers/douban-neodb.ts` → `showPageToast`, `showNotification` | KEEP — page-toast util for douban-neodb |
| **handlers/imdb.ts** | ACTIVE | `router.ts` → `handleIMDbDetailPage` | KEEP — only IMDb handler; no replacement |
| **handlers/neodb.ts** | ACTIVE | `router.ts` → `handleNeoDBDetailPage` | KEEP — only NeoDB handler; no replacement |
| **handlers/mukaku.ts** | ACTIVE | `router.ts` → `handleMukakuDetailPage`, `handleMukakuListPage`, `cleanupMukaku` | KEEP — only Mukaku handler |
| **handlers/sehuatang.ts** | ACTIVE | `router.ts` → `handleSehuatangListPage` | KEEP — only Sehuatang handler |
| **handlers/javdb.ts** | ACTIVE | `router.ts` → `handleJavDBPage` | KEEP — only JavDB handler |
| **handlers/pt-detail.ts** | ACTIVE | `router.ts` → `handlePTDetailPage` | KEEP — PT detail page ID cache |
| **enhancers/douban-search.ts** | ACTIVE | `router.ts` → `startSearchEnhancer` | KEEP — douban search badge injection |
| **enhancers/douban-search-bar.ts** | **🔴 CONFIRMED_DEAD** | **No imports found anywhere in `src/`** | **🗑️ DELETE** |
| **enhancers/pt/index.ts** | ACTIVE | `router.ts` → `PTDimmer` | KEEP — barrel export |
| **enhancers/pt/dimmer/index.ts** | ACTIVE | `enhancers/pt/index.ts` → `PTDimmer` class | KEEP — main PT dimmer logic |
| **enhancers/pt/dimmer/mteam.ts** | ACTIVE | `dimmer/index.ts` → `MTeamHandler` | KEEP — M-Team SPA dimmer |
| **enhancers/pt/dimmer/nexusphp.ts** | ACTIVE | `dimmer/index.ts` → `NexusPHPHandler` | KEEP — NexusPHP sites dimmer |
| **enhancers/pt/dimmer/cache.ts** | ACTIVE | `mteam.ts` → `getMTeamSets`, `applyCacheFallback` | KEEP — ID cache for dimmer |
| **enhancers/pt/config/index.ts** | ACTIVE | `dimmer/index.ts` → `getListPageConfig`, `getSiteConfig` | KEEP — site config resolver |
| **enhancers/pt/config/sites.ts** | ACTIVE | `config/index.ts` → `SITE_CONFIGS` | KEEP — PT site definitions |
| **enhancers/pt/scanner/index.ts** | ACTIVE | `nexusphp.ts` → `scanPage` | KEEP — background page scanner |
| **enhancers/pt/scanner/queue.ts** | ACTIVE | `scanner/index.ts` | KEEP — scan request queue |
| **enhancers/pt/scanner/semaphore.ts** | ACTIVE | `scanner/index.ts` | KEEP — concurrency control |
| **enhancers/pt/types.ts** | ACTIVE | `dimmer/index.ts`, `mteam.ts` | KEEP — shared PT types |
| **enhancers/pt/utils.ts** | ACTIVE | `dimmer/index.ts`, via `../utils` | KEEP — `dimElement` + `throttle` wrapper |
| **neodb-push.ts** | ACTIVE | `content.ts` → `injectNeoDBPushButtons` | KEEP — primary NeoDB injector (called by content.ts, overridden by douban handler) |
| **observers/rating.ts** | ACTIVE | `content.ts` → `startRatingObserver`; `handlers/douban.ts` → `setNeoDBInjector` | KEEP — rating change observer |
| **i18n/index.ts** | ACTIVE | `content.ts` → `initI18n`, `startLocaleSync`; most handlers → `t()` | KEEP — i18n infrastructure |
| **i18n/locales.ts** | ACTIVE | `i18n/index.ts` → `locales` | KEEP — locale data |
| **ui/doulist-replace.ts** | ACTIVE (transitional) | `handlers/douban.ts` → `initDoulistReplacement` | KEEP — doulist modal replacement |
| **ui/manual-add-panel.ts** | ACTIVE | `handlers/sehuatang.ts` → `showManualAddPanel` | KEEP — Sehuatang manual add panel |
| **ui/check-viewed-panel.ts** | ACTIVE | `handlers/sehuatang.ts` → `showCheckViewedPanel` | KEEP — Sehuatang check-viewed panel |
| **utils/dom.ts** | ACTIVE | `imdb.ts`, `neodb.ts`, `mukaku.ts`, `douban-search.ts` → `createStatusChip`, `waitForElement`, `escapeHtml` | KEEP — shared DOM utilities |
| **utils/toast.ts** | ACTIVE | `content.ts` → `FloatingToast`; 6+ handlers → `FloatingToast` | KEEP — notification system |
| **styles/global.ts** | ACTIVE | `content.ts` → `injectGlobalStyles` | KEEP — global CSS injection |
| **styles/tokens.ts** | ACTIVE | `styles/global.ts` → color/gradient tokens | KEEP — design tokens |

---

## Detailed Findings

### 1. `enhancers/douban-search-bar.ts` — CONFIRMED DEAD

A complete grep of `src/` for `douban-search-bar` returned **zero results**. This file exports:
- `injectSearchBarStyles()` — never called
- `createUmmSearchBar()` — never called
- `enhanceDetailPageSearch()` — never called
- `enhanceSearchPageSearch()` — never called

It was presumably intended to replace Douban's native search bar with a UMM-styled version, but was never wired into the router or any other module.

**Action: DELETE.** No risk — zero references.

---

### 2. Douban Handler Chain — ACTIVE but TRANSITIONAL

The entire douban handler sub-tree (`handlers/douban.ts` → `douban-scanner.ts`, `douban-sync.ts`, `douban-neodb.ts`, `douban-toast.ts`, `ui/doulist-replace.ts`) is **still active** in the router table. It provides:

| Function | Provided by | Also provided by new system? |
|----------|------------|------------------------------|
| Theme sync (`data-umm-theme` on `<html>`) | `handlers/douban.ts` | Possibly via `css-composer.ts` |
| Page status scanning (watched/wish/doing) | `handlers/douban-scanner.ts` | New system reads record via `loadRecord()` |
| IndexedDB sync on page change | `handlers/douban-sync.ts` | Not confirmed |
| NeoDB push buttons | `handlers/douban-neodb.ts` | New detail overlay may provide NeoDB actions |
| Doulist replacement modal | `ui/doulist-replace.ts` | Not in new system |

**Status: KEEP** — these files are all transitively reachable from `router.ts`. They should be consolidated into the new system when the douban detail page migration is complete. Do NOT delete yet.

---

### 3. Duplicate NeoDB Push Implementations

There are **two separate** NeoDB push button implementations:

| Implementation | File | Called by |
|----------------|------|-----------|
| Primary | `neodb-push.ts` | `content.ts` → `fullInit()` → `setNeoDBInjector()` |
| Handler | `handlers/douban-neodb.ts` | `router.ts` → `handlers/douban.ts` → overrides the above via `setNeoDBInjector()` |

The router handler's `handleDoubanDetailPage()` calls `setNeoDBInjector(...)` which **overrides** the injector set by `content.ts`'s `fullInit()`. This means `neodb-push.ts`'s `injectNeoDBPushButtons` is **never actually used** — the handler version takes priority.

Both implementations have nearly identical logic (push buttons, rating adjustment, linked ID sync). This is a maintenance burden and a refactoring opportunity.

---

### 4. All Non-Douban Handlers — Fully Active

The router has dedicated routes for IMDb, NeoDB, Mukaku, Sehuatang, JavDB, and PT sites, and **no replacement system exists** for any of them. All are cleanly ACTIVE with straightforward import chains.

---

## Recommendations

| Priority | Action | Files | Effort |
|----------|--------|-------|--------|
| **P0** | Delete dead code | `enhancers/douban-search-bar.ts` | Quick |
| **P1** | Merge duplicate NeoDB push implementations | `neodb-push.ts` + `handlers/douban-neodb.ts` | Medium |
| **P2** | Migrate douban handler chain into new douban system | All `handlers/douban*.ts`, `handlers/douban-sync/`, `ui/doulist-replace.ts`, `handlers/douban-toast.ts` | Large |
| **P3** | Remove `handlers/douban.ts` route from router once migration complete | `router.ts` (1 route entry) | Quick |

### Risk Notes

- **P1 (merge NeoDB push):** Requires careful testing — both implementations are slightly different (e.g., `neodb-push.ts` supports Shadow DOM overlay, while `handlers/douban-neodb.ts` inserts into the native DOM). The merged version must handle both cases.
- **P2 (douban migration):** Should only proceed after confirming the new Vue overlay system covers all legacy functionality (theme sync, DB auto-save, doulist replacement). Currently the old handler runs in parallel without conflicts — migration can be deferred.
- **P0 (delete search-bar):** Zero risk — grep confirmed no imports in the entire `src/` directory.
