# Popup UI Redesign + Options Page — Design Spec

> **Anchors:** [S1] Problem · [S2] Architecture · [S3] Popup Dashboard · [S4] Options Page · [S5] Responsive System · [S6] Typography · [S7] Spacing · [S8] Tab Lazy Loading · [S9] Performance · [S10] File Map

## [S1] Problem

Current popup (600×500 fixed) mixes dashboard overview with control panel functions (WebDAV config, NeoDB config, import/export, rating management, debug settings) in 5 flat pages. This causes:

- Popup too heavy for quick-glance usage
- Fixed size incompatible with 2K/4K/5K displays
- No typography hierarchy — all text same visual weight
- Low-frequency operations (config, sync) consume prime popup real estate
- No breathing room on large screens

## [S2] Architecture

Split into two entrypoints:

1. **Popup** → Read-only dashboard: stats + recent records + CTA to open Options Page
2. **Options Page** → Independent `chrome.runtime.getURL('options.html')` page with multi-layer tab system

Popup communicates with Options Page via `chrome.runtime.sendMessage` (existing message bus). Options Page reads the same `appearance` theme setting as popup.

## [S3] Popup Dashboard

Single-page scrollable layout. No tab navigation.

**Sections:**
1. Header: brand name + version badge
2. Hero Stats: 4 stat cards in 2×2 grid (movie/tv/music/linked count), Display font weight
3. Recent Records: last 5 records as compact list items (platform icon + type + ID + rating)
4. CTA Button: "管理面板 →" opens Options Page in new tab
5. Footer: total records count + version

**Constraints:**
- Width: responsive max-width from 320px (sm) to 800px (3xl), centered
- Height: natural content height, no fixed height
- Zero interactive forms — read-only
- One action: open Options Page

## [S4] Options Page

Independent Chrome extension page (`options.html`). Full browser tab, not a popup.

### Tab Architecture

**Primary Tabs (一级):**
| Tab | Route | Content |
|-----|-------|---------|
| 概览 | `/overview` | Stats dashboard + platform distribution (migrated from RecordsPage + PlatformsPage) |
| 评分管理 | `/rating` | Rating form + query (migrated from RatingsPage) |
| 关联查询 | `/linked` | Cross-platform link query (migrated from LinkedPage) |
| 数据同步 | `/sync` | WebDAV + Import/Export (migrated from SettingsPage sync section) |
| 设置 | `/settings` | NeoDB config + Debug settings (migrated from SettingsPage config section) |

**Secondary Tabs (二级) — only inside 数据同步:**
| Tab | Content |
|-----|---------|
| WebDAV | Server config + test connection |
| 导入/导出 | Export JSON + Import JSON |
| 坚果云 | Jianguoyun WebDAV config (future) |

### Layout

- **sm-md:** Single column, full width, tab bar at top
- **lg+:** Sidebar tab navigation (vertical) + content area
- **xl+:** Sidebar + content with generous padding

### Opening Mechanism

```typescript
// From popup or content script
window.open(chrome.runtime.getURL('options.html'), '_blank')
```

## [S5] Responsive System

### Breakpoints

| Name | Range | Use Case |
|------|-------|----------|
| `sm` | < 640px | Mobile / narrow popup |
| `md` | 640-1024px | Standard popup / small laptop |
| `lg` | 1024-1536px | Laptop / small desktop |
| `xl` | 1536-2560px | 2K monitor |
| `2xl` | 2560-3840px | 4K monitor |
| `3xl` | > 3840px | 5K+ monitor |

### Responsive Behavior

| Element | sm | md-lg | xl+ | 2xl+ | 3xl+ |
|---------|-----|-------|-----|------|------|
| Popup max-width | 100% | 480-560px | 640px | 720px | 800px |
| Options sidebar | hidden (top tabs) | hidden | visible | visible | visible |
| Card padding | 16px | 20px | 24px | 32px | 40px |
| Section gap | 24px | 32px | 40px | 48px | 56px |
| Page margin | 16px | 24px | 32px | 48px | 64px |
| Grid columns | 1 | 2 | 2-3 | 3-4 | 4 |

## [S6] Typography

### Scale

| Token | sm | md-lg | xl+ | 2xl+ | 3xl+ |
|-------|-----|-------|-----|------|------|
| `--font-display` | 2rem/700 | 2.5rem/700 | 3rem/700 | 3.5rem/700 | 4rem/700 |
| `--font-h1` | 1.25rem/600 | 1.5rem/600 | 1.75rem/600 | 2rem/600 | 2.25rem/600 |
| `--font-h2` | 1rem/600 | 1.125rem/600 | 1.25rem/600 | 1.5rem/600 | 1.5rem/600 |
| `--font-body` | 0.875rem/400 | 0.875rem/400 | 1rem/400 | 1.125rem/400 | 1.25rem/400 |
| `--font-caption` | 0.75rem/400 | 0.75rem/400 | 0.875rem/400 | 0.875rem/400 | 1rem/400 |

### Color Hierarchy

- **Primary text** (`foreground`): headings, key numbers, active states
- **Secondary text** (`muted-foreground`): body, labels, descriptions
- **Tertiary text** (`-muted-foreground/60`): captions, timestamps, hints
- **Accent** (`primary`): CTAs, active tabs, links
- **Muted** (`muted`): backgrounds, borders, separators

## [S7] Spacing

### Scale (Tailwind-based)

Base unit: 4px. Scale: 1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 56, 64.

### Usage by Context

| Context | sm | md-lg | xl+ | 2xl+ | 3xl+ |
|---------|-----|-------|-----|------|------|
| Card internal padding | p-4 | p-5 | p-6 | p-8 | p-10 |
| Between cards | gap-4 | gap-6 | gap-8 | gap-10 | gap-12 |
| Section margin | mb-6 | mb-8 | mb-10 | mb-12 | mb-14 |
| Page horizontal padding | px-4 | px-6 | px-8 | px-12 | px-16 |
| Tab item padding | px-3 py-2 | px-4 py-2.5 | px-5 py-3 | px-6 py-3 | px-8 py-4 |

## [S8] Tab Lazy Loading

### Strategy

Use `defineAsyncComponent` with Vue's `<Suspense>` for each tab component:

```typescript
const OverviewTab = defineAsyncComponent(() => import('./tabs/OverviewTab.vue'))
const RatingTab = defineAsyncComponent(() => import('./tabs/RatingTab.vue'))
```

### Rules

1. Tab component loads ONCE on first visit, stays in memory after
2. Loading state shown via `<Suspense>` fallback
3. Error boundary per tab — one tab failure doesn't affect others
4. Data fetching happens inside each tab's `onMounted`, not eagerly in App.vue
5. Tab preloading: optional, only for immediately adjacent tabs

## [S9] Performance

### Popup

- Minimal bundle: only DashboardPage + shared utils
- No form components, no Select/Input/Dialog imports
- Estimated: < 30KB gzipped (vs current ~50KB)

### Options Page

- Tab code-split via dynamic import
- Initial load: only tab bar + active tab content
- Shared components (Card, Button, Input) pre-bundled
- Data fetching: per-tab, not global

### Tailwind CSS

- Use `@tailwindcss/vite` plugin (already configured)
- Purge unused classes via WXT's production build
- CSS variables for responsive typography (not media queries per class)

## [S10] File Map

### New Files

| File | Responsibility |
|------|---------------|
| `src/entrypoints/options.html` | Options page HTML shell |
| `src/entrypoints/options/main.ts` | Vue app bootstrap |
| `src/entrypoints/options/App.vue` | Tab container + responsive layout |
| `src/entrypoints/options/router.ts` | Tab routes |
| `src/entrypoints/options/tabs/OverviewTab.vue` | Stats + platform distribution |
| `src/entrypoints/options/tabs/RatingTab.vue` | Rating management |
| `src/entrypoints/options/tabs/LinkedTab.vue` | Cross-platform link query |
| `src/entrypoints/options/tabs/SyncTab.vue` | Data sync (with sub-tabs) |
| `src/entrypoints/options/tabs/sync/WebDAVTab.vue` | WebDAV config |
| `src/entrypoints/options/tabs/sync/ImportExportTab.vue` | Import/export |
| `src/entrypoints/options/tabs/sync/JianguoyunTab.vue` | Jianguoyun config |
| `src/entrypoints/options/tabs/SettingsTab.vue` | NeoDB + debug settings |
| `src/entrypoints/popup/pages/DashboardPage.vue` | New popup dashboard |
| `src/styles/typography.css` | CSS variables for type scale |

### Modified Files

| File | Change |
|------|--------|
| `wxt.config.ts` | Add options page entrypoint |
| `src/entrypoints/popup/App.vue` | Rewrite to dashboard layout |
| `src/entrypoints/popup/router.ts` | Single route to DashboardPage |
| `tailwind.config.ts` | Extended breakpoints + CSS variables |

### Removed Files

| File | Reason |
|------|--------|
| `src/entrypoints/popup/pages/RecordsPage.vue` | Merged into OverviewTab |
| `src/entrypoints/popup/pages/PlatformsPage.vue` | Merged into OverviewTab |
| `src/entrypoints/popup/pages/RatingsPage.vue` | Moved to RatingTab |
| `src/entrypoints/popup/pages/LinkedPage.vue` | Moved to LinkedTab |
| `src/entrypoints/popup/pages/SettingsPage.vue` | Split into SyncTab + SettingsTab |
