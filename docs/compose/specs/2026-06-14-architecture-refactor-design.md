# Architecture Refactoring & Modernization Spec

> **Date:** 2026-06-14 (Beijing Time)
> **Status:** Draft
> **Scope:** Dependency updates, Pinia migration, composable/component extraction, content script splitting, @vueuse/core adoption

---

## [S1] Problem Analysis

### S1.1 — Large Monolithic Files

Two files carry >80% of content script logic without clear module boundaries:

| File | Lines | Problem |
|------|-------|---------|
| `src/entrypoints/content.ts` | 1026 | DB init, routing, rating observer, NeoDB push, toast, theme — all in one |
| `src/entrypoints/content/handlers/douban.ts` | 1243 | Page scanning, save sync, platform linking, NeoDB push, toast — all in one |

This makes it impossible to test or reason about individual concerns independently.

### S1.2 — No State Management Layer

Zero Pinia stores. Three composables (`useToast`, `useTheme`, `useConfirmDialog`) all use **module-level `ref()`/`reactive()` singletons** with no devtools traceability, no action naming, and no cross-component isolation.

### S1.3 — Duplicated Business Logic

- **Stats computation**: `OverviewTab.vue` and `DashboardPage.vue` both compute `movie/tv/music` counts independently, iterating over records with identical `if/else` chains
- **Theme management**: `useTheme.ts` + Popup `App.vue` both implement `readThemeSync()` and `chrome.storage.onChanged` — two competing implementations
- **Platform labels/colors**: `OverviewTab.vue` inlines `platformLabels`, `platformHues`, `platformColor()` which should be shared

### S1.4 — Overdue Component Extraction

The 601-line `OverviewTab.vue` embeds CalendarHeatmap, WeeklyStats, PlatformDistribution, StatCards as inline template code — none extractable for testing, reuse, or lazy loading.

### S1.5 — @vueuse/core Unused

`@vueuse/core ^14.3.0` is a declared dependency but never imported. Common browser patterns (localStorage, matchMedia, event listeners) are hand-rolled.

### S1.6 — Outdated Dependencies

`vue-router ^4.6.4` → `^5.1.0` (latest stable, requires pinia). Other deps with available patches/minors.

### S1.7 — Dead Dependency

`@crxjs/vite-plugin` in `devDependencies` is unused — WXT handles its own bundling.

---

## [S2] Design Principles

### P1. No Data Structure Changes
Zero changes to `StoreRecord`, `UrlIdentity`, `AppSettings`, `AdultAvId`, `PtIdCacheEntry`, or IndexedDB schema (DB_VERSION stays at 9).

### P2. No Page Judgment Logic Changes
Content handler page-scanning logic (Douban "watched" detection, IMDb parsing, NeoDB matching) stays 100% identical — only file boundaries and import paths change.

### P3. Event-Driven Architecture Preserved
All `chrome.runtime.sendMessage` patterns, `safeSendMessage`, and `chrome.storage.onChanged` listeners remain intact.

### P4. Minimal Public API Surface
Every extraction (composable, component, store) exposes only what consuming code needs — no speculative exports.

---

## [S3] Dependency Update Plan (Latest Stable)

**Beijing time 2026-06-14 19:45 CST — all versions verified via `npm view`**

### Upgrade (no breaking changes):

| Package | Current → Target | Type |
|---------|-----------------|------|
| `vue` | `^3.5.34` → `^3.5.38` | patch |
| `reka-ui` | `^2.9.7` → `^2.9.10` | patch |
| `tailwindcss` | `^4.3.0` → `^4.3.1` | patch |
| `vite` | `^8.0.13` → `^8.0.16` | patch |
| `vue-tsc` | `^3.3.1` → `^3.3.5` | patch |
| `tailwind-merge` | `^3.3.1` → `^3.6.0` | minor |
| `gsap` | `^3.13.0` → `^3.15.0` | minor |
| `@tailwindcss/vite` | `^4.3.0` → `^4.3.1` | patch |
| `@types/chrome` | `^0.1.42` → `^0.1.43` | patch |
| `@types/node` | `^25.9.1` → `^25.9.3` | patch |
| `sharp` | `^0.34.2` → `^0.35.1` | minor |
| `tsx` | `^4.22.3` → `^4.22.4` | patch |
| `rimraf` | `^6.1.3` → `^6.1.3` | same |

### Upgrade (with migration):

| Package | Current → Target | Migration Required |
|---------|-----------------|-------------------|
| `vue-router` | `^4.6.4` → `^5.1.0` | Add pinia peer dep; API backward-compatible per official changelog |

### Add:

| Package | Version | Reason |
|---------|---------|--------|
| `pinia` | `^3.0.4` | vue-router 5 peer dep + state management |

### Remove:

| Package | Reason |
|---------|--------|
| `@crxjs/vite-plugin` | Unused — WXT manages its own bundling |

### Keep (already latest):

`@vueuse/core ^14.3.0`, `class-variance-authority ^0.7.1`, `clsx ^2.1.1`, `jszip ^3.10.1`, `lucide-vue-next ^1.0.0`, `vue-sonner ^2.0.9`, `@playwright/test ^1.60.0`, `@vitejs/plugin-vue ^6.0.7`, `typescript ^6.0.3`, `wxt ^0.20.26`, `@wxt-dev/module-vue ^1.0.3`

---

## [S4] Pinia Stores Architecture

### S4.1 — useThemeStore

**Replaces:** `composables/useTheme.ts` + Popup `App.vue` theme logic

```ts
// stores/theme.ts
export const useThemeStore = defineStore('theme', () => {
  const theme = ref<ThemeMode>('auto')
  const fontSize = ref<FontSize>('default')
  const density = ref<Density>('default')

  function applyTheme(mode: ThemeMode) { /* existing logic */ }
  function applyFontSize(size: FontSize) { /* existing logic */ }
  function applyDensity(d: Density) { /* existing logic */ }

  return { theme, fontSize, density, applyTheme, applyFontSize, applyDensity }
})
```

**Consumed by:** Options `App.vue`, `AppearanceTab.vue`, Popup `App.vue`

### S4.2 — useAppStore

**Replaces:** `provide('loadData', ...)` in Popup App.vue + per-component loading state

```ts
// stores/app.ts
export const useAppStore = defineStore('app', () => {
  const loading = ref(false)
  const error = ref<string | null>(null)
  const records = ref<StoreRecord[]>([])
  const adultAvItems = ref<AdultAvId[]>([])
  const appVersion = ref('')

  async function loadAllData() { /* message passing */ }

  return { loading, error, records, adultAvItems, appVersion, loadAllData }
})
```

**Consumed by:** `OverviewTab.vue`, `DashboardPage.vue`, `SettingsTab.vue`

### S4.3 — useConfirmStore

**Replaces:** `entrypoints/popup/useConfirmDialog.ts` (module-level reactive singleton)

```ts
// stores/confirm.ts
export const useConfirmStore = defineStore('confirm', () => {
  const state = reactive<ConfirmDialogState>({ ... })
  function show(config: Omit<ConfirmDialogState, 'open' | 'loading'>) { ... }
  async function confirm() { ... }

  return { state, show, confirm }
})
```

**Consumed by:** `ConfirmDialog.vue`, any page that triggers confirmations

---

## [S5] Composable Extraction

### S5.1 — useStats (new)

**Extracted from:** `OverviewTab.vue` and `DashboardPage.vue`

```ts
// composables/useStats.ts
export function useStats(records: Ref<StoreRecord[]>, adultAvItems: Ref<AdultAvId[]>) {
  const stats = computed(() => {
    let movie = 0, tv = 0, music = 0
    for (const r of records.value) { /* same logic */ }
    return { total: records.value.length, movie, tv, music }
  })

  const platformStats = computed(() => { /* platform distribution logic */ })

  return { stats, platformStats }
}
```

### S5.2 — usePlatformMeta (new)

**Extracted from:** `OverviewTab.vue` inline maps

```ts
// composables/usePlatformMeta.ts
export const PLATFORM_LABELS: Record<string, string> = { ... }
export const PLATFORM_HUES: Record<string, number> = { ... }

export function usePlatformColor(hue: number) {
  return { bar, chipBg, chipText, chipBorder, icon }
}
```

### S5.3 — useRecordLoader (new)

**Extracted from:** `OverviewTab.vue` and `DashboardPage.vue` data-loading

```ts
// composables/useRecordLoader.ts
export function useRecordLoader() {
  const loading = ref(false)
  const error = ref<string | null>(null)
  const dataReady = ref(false)

  async function load() {
    // safeSendMessage(GET_ALL_RECORDS) + safeSendMessage(ADULT_AV_GET_ALL)
  }

  return { loading, error, dataReady, records, javRecords, load, loadData }
}
```

### S5.4 — @vueuse/core adapters (new)

Replace hand-rolled browser APIs:

| Current | @vueuse/core replacement |
|---------|--------------------------|
| `localStorage.getItem` + `JSON.parse` | `useStorage(key, default)` |
| `window.matchMedia('...')` + `addEventListener` | `useMediaQuery(query)` |
| `window.addEventListener('...')` + `removeEventListener` | `useEventListener(target, event, handler)` |
| `onMounted`/`onUnmounted` cleanup | `useEventListener` handles auto-cleanup |

---

## [S6] Component Extraction

### S6.1 — HeatmapCalendar

**Source:** `OverviewTab.vue` ~80 lines of template + ~60 lines of computed

```vue
<!-- components/HeatmapCalendar.vue -->
<script setup lang="ts">
defineProps<{ weeks: [...]; monthLabels: [...]; maxDaily: number }>()
</script>
```

### S6.2 — WeeklyStats

**Source:** `OverviewTab.vue` ~200 lines of template + ~80 lines of computed

```vue
<!-- components/WeeklyStats.vue -->
<script setup lang="ts">
defineProps<{ days: [...]; total: number; avgDaily: number; peakDay: string }>()
</script>
```

### S6.3 — StatCard

**Source:** Both `OverviewTab.vue` and `DashboardPage.vue` repeated 4× each

```vue
<!-- components/StatCard.vue -->
<script setup lang="ts">
defineProps<{ icon: Component; label: string; value: number; loading?: boolean }>()
</script>
```

### S6.4 — PlatformDistribution

**Source:** `OverviewTab.vue` ~120 lines of template + ~40 lines of computed

```vue
<!-- components/PlatformDistribution.vue -->
<script setup lang="ts">
defineProps<{ platformStats: PlatformStat[]; maxCount: number; stats: Stats }>()
</script>
```

---

## [S7] Content Script Refactoring

### S7.1 — Split douban.ts

**Current:** `handlers/douban.ts` (1243 lines) — page scanning, save sync, cross-platform linking, NeoDB push, toast

**Target files:**

| New File | Responsibility | Lines Moved |
|----------|---------------|-------------|
| `handlers/douban-scanner.ts` | `scanDoubanPageStatus()`, `extractCommentFromPage()`, `extractCrossPlatformLinks()` | ~120 |
| `handlers/douban-sync.ts` | `syncToLocalStorage()`, `getLocalRecord()`, notification cache | ~300 |
| `handlers/douban-neodb.ts` | `injectNeoDBPushButtons()`, `pushToNeoDB()`, `performNeoDBPush()` | ~450 |
| `handlers/douban-toast.ts` | `showPageToast()` | ~150 |
| `handlers/douban.ts` | `handleDoubanDetailPage()` entry point + imports | ~100 |

### S7.2 — Split content.ts

**Current:** `content.ts` (1026 lines) — DB init, routing, rating observer, NeoDB push, theme, toast

**Target:**

| Current Function | New Home |
|-----------------|----------|
| `fullInit()` | stays in `content.ts` |
| `startRatingObserver()` | `content/observers/rating.ts` |
| `observeThemeChanges()` | merge into `useTheme` composable |
| `showToast()` | `content/utils/toast.ts` (already exists via FloatingToast) |

---

## [S8] Spec Constraints Lock

The following WILL NOT change:

| Area | Locked |
|------|--------|
| IndexedDB schema | DB_VERSION = 9, all store names, key format `type::providerId` |
| `StoreRecord`, `UrlIdentity`, `AppSettings`, `AdultAvId` types | unchanged |
| `safeSendMessage` signature | unchanged |
| Message type strings | `DB_GET`, `DB_PUT`, etc. all unchanged |
| Content handler page-logic | `scanDoubanPageStatus`, `scanIMDbPageStatus`, etc. unchanged |
| Router dispatch logic | `ROUTES` table and `dispatchRoute` unchanged |
| CSS variables & design tokens | `typography.css`, `design-tokens.css` unchanged |
| WXT config & entrypoints | `content.ts` matches array, `background.ts`, `popup/`, `options/` entrypoints unchanged |

---

## [S9] Spec Self-Review

- [x] **Placeholder scan:** No TBD, TODO, or incomplete sections
- [x] **Internal consistency:** All sections reference each other coherently; store names match existing conventions
- [x] **Scope check:** Single refactoring effort — no new features, no data changes, no UI behavior changes. All tasks are pure structural improvements
- [x] **Ambiguity check:** Every extraction has named source and clear boundary. "Don't change page logic" is explicit in S8