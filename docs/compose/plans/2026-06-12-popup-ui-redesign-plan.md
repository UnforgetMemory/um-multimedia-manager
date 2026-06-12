# Popup UI Redesign + Options Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify popup to read-only dashboard, move control panel to independent options.html page, add multi-breakpoint responsive design with typography hierarchy.

**Architecture:** Popup becomes a minimal stats dashboard with CTA to options page. Options page is a full Chrome extension page with multi-layer tab navigation. Each tab lazy-loaded via `defineAsyncComponent`. Tailwind CSS v4 with CSS custom properties for responsive typography.

**Tech Stack:** Vue 3 Composition API, vue-router 4, Tailwind CSS v4, WXT Manifest V3, shadcn/vue (reka-ui)

**Spec:** `docs/compose/specs/2026-06-12-popup-ui-redesign-design.md`

---

## File Map

### New Files
| File | Responsibility |
|------|---------------|
| `src/entrypoints/options.html` | Options page HTML shell |
| `src/entrypoints/options/main.ts` | Vue app bootstrap |
| `src/entrypoints/options/App.vue` | Tab container + responsive layout |
| `src/entrypoints/options/router.ts` | Tab routes with lazy loading |
| `src/entrypoints/options/tabs/OverviewTab.vue` | Stats + platform distribution |
| `src/entrypoints/options/tabs/RatingTab.vue` | Rating management (migrated) |
| `src/entrypoints/options/tabs/LinkedTab.vue` | Cross-platform link query (migrated) |
| `src/entrypoints/options/tabs/SyncTab.vue` | Data sync parent (with sub-tabs) |
| `src/entrypoints/options/tabs/sync/WebDAVTab.vue` | WebDAV config |
| `src/entrypoints/options/tabs/sync/ImportExportTab.vue` | Import/export |
| `src/entrypoints/options/tabs/SettingsTab.vue` | NeoDB + debug settings |
| `src/entrypoints/popup/pages/DashboardPage.vue` | New popup dashboard |
| `src/styles/typography.css` | CSS variables for type scale |

### Modified Files
| File | Change |
|------|--------|
| `wxt.config.ts` | Add options page to manifest |
| `src/entrypoints/popup/App.vue` | Rewrite to dashboard layout |
| `src/entrypoints/popup/router.ts` | Single route |
| `src/entrypoints/popup/main.ts` | Import typography CSS |

### Removed Files
| File | Reason |
|------|--------|
| `src/entrypoints/popup/pages/RecordsPage.vue` | Merged into OverviewTab |
| `src/entrypoints/popup/pages/PlatformsPage.vue` | Merged into OverviewTab |
| `src/entrypoints/popup/pages/RatingsPage.vue` | Moved to RatingTab |
| `src/entrypoints/popup/pages/LinkedPage.vue` | Moved to LinkedTab |
| `src/entrypoints/popup/pages/SettingsPage.vue` | Split into SyncTab + SettingsTab |

---

## Task 1: Typography CSS + Responsive Tokens

**Covers:** [S6], [S7]

**Files:**
- Create: `src/styles/typography.css`

- [ ] **Step 1: Create typography CSS with responsive custom properties**

Create `src/styles/typography.css`:

```css
/* Typography Scale — responsive via clamp() */
:root {
  /* Display: hero numbers */
  --font-display-size: clamp(2rem, 1.5rem + 1.5vw, 4rem);
  --font-display-weight: 700;
  --font-display-line-height: 1.1;

  /* Heading 1: page titles */
  --font-h1-size: clamp(1.25rem, 1rem + 0.75vw, 2.25rem);
  --font-h1-weight: 600;
  --font-h1-line-height: 1.3;

  /* Heading 2: section titles */
  --font-h2-size: clamp(1rem, 0.875rem + 0.375vw, 1.5rem);
  --font-h2-weight: 600;
  --font-h2-line-height: 1.4;

  /* Body: paragraphs, labels */
  --font-body-size: clamp(0.875rem, 0.75rem + 0.375vw, 1.25rem);
  --font-body-weight: 400;
  --font-body-line-height: 1.6;

  /* Caption: hints, timestamps */
  --font-caption-size: clamp(0.75rem, 0.625rem + 0.375vw, 1rem);
  --font-caption-weight: 400;
  --font-caption-line-height: 1.5;

  /* Spacing scale */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-14: 56px;
  --space-16: 64px;

  /* Card padding responsive */
  --card-padding: clamp(16px, 12px + 1vw, 40px);

  /* Section gap responsive */
  --section-gap: clamp(24px, 16px + 1.5vw, 56px);

  /* Page margin responsive */
  --page-margin: clamp(16px, 12px + 1.5vw, 64px);

  /* Popup max-width responsive */
  --popup-max-width: clamp(320px, 280px + 8vw, 800px);
}

/* Font utility classes */
.font-display {
  font-size: var(--font-display-size);
  font-weight: var(--font-display-weight);
  line-height: var(--font-display-line-height);
}

.font-h1 {
  font-size: var(--font-h1-size);
  font-weight: var(--font-h1-weight);
  line-height: var(--font-h1-line-height);
}

.font-h2 {
  font-size: var(--font-h2-size);
  font-weight: var(--font-h2-weight);
  line-height: var(--font-h2-line-height);
}

.font-body {
  font-size: var(--font-body-size);
  font-weight: var(--font-body-weight);
  line-height: var(--font-body-line-height);
}

.font-caption {
  font-size: var(--font-caption-size);
  font-weight: var(--font-caption-weight);
  line-height: var(--font-caption-line-height);
}

/* Color hierarchy */
.text-primary-content { color: hsl(var(--foreground)); }
.text-secondary-content { color: hsl(var(--muted-foreground)); }
.text-tertiary-content { color: hsl(var(--muted-foreground) / 0.6); }
```

- [ ] **Step 2: Import in popup main.ts**

In `src/entrypoints/popup/main.ts`, add at top:

```typescript
import '@/styles/typography.css'
```

- [ ] **Step 3: Commit**

```bash
git add src/styles/typography.css src/entrypoints/popup/main.ts
git commit -m "feat(styles): add responsive typography scale and spacing tokens"
```

---

## Task 2: WXT Config — Options Page

**Covers:** [S2], [S10]

**Files:**
- Modify: `wxt.config.ts`

- [ ] **Step 1: Add options page to WXT manifest**

In `wxt.config.ts`, add inside `manifest`:

```typescript
options_ui: {
  page: 'options.html',
  open_in_tab: true,
},
```

- [ ] **Step 2: Commit**

```bash
git add wxt.config.ts
git commit -m "feat(wxt): add options page entrypoint to manifest"
```

---

## Task 3: Options Page Shell

**Covers:** [S4], [S8], [S9]

**Files:**
- Create: `src/entrypoints/options.html`
- Create: `src/entrypoints/options/main.ts`
- Create: `src/entrypoints/options/App.vue`
- Create: `src/entrypoints/options/router.ts`

- [ ] **Step 1: Create options.html**

Create `src/entrypoints/options.html`:

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>UMM 管理面板</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="./main.ts"></script>
</body>
</html>
```

- [ ] **Step 2: Create options/main.ts**

Create `src/entrypoints/options/main.ts`:

```typescript
import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import '@/styles/typography.css'
import '../style.css'

const app = createApp(App)
app.use(router)
app.mount('#app')
```

- [ ] **Step 3: Create options/router.ts with lazy-loaded tabs**

Create `src/entrypoints/options/router.ts`:

```typescript
import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      redirect: '/overview',
    },
    {
      path: '/overview',
      name: 'overview',
      component: () => import('./tabs/OverviewTab.vue'),
    },
    {
      path: '/rating',
      name: 'rating',
      component: () => import('./tabs/RatingTab.vue'),
    },
    {
      path: '/linked',
      name: 'linked',
      component: () => import('./tabs/LinkedTab.vue'),
    },
    {
      path: '/sync',
      name: 'sync',
      component: () => import('./tabs/SyncTab.vue'),
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('./tabs/SettingsTab.vue'),
    },
  ],
})

export default router
```

- [ ] **Step 4: Create options/App.vue with tab layout**

Create `src/entrypoints/options/App.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useRouter, useRoute, RouterView } from 'vue-router'
import { Button } from '@/components/ui/button'
import { Database, Star, Link, RefreshCw, Settings } from 'lucide-vue-next'

const router = useRouter()
const route = useRoute()

const tabs = [
  { id: 'overview', label: '概览', icon: Database, route: '/overview' },
  { id: 'rating', label: '评分管理', icon: Star, route: '/rating' },
  { id: 'linked', label: '关联查询', icon: Link, route: '/linked' },
  { id: 'sync', label: '数据同步', icon: RefreshCw, route: '/sync' },
  { id: 'settings', label: '设置', icon: Settings, route: '/settings' },
] as const

const currentTab = computed(() => {
  const name = route.name as string
  return tabs.find(t => t.id === name)?.id || 'overview'
})

function navigateTo(path: string) {
  router.push(path)
}
</script>

<template>
  <div class="min-h-screen bg-background text-foreground">
    <!-- Header -->
    <header class="border-b border-border px-[var(--page-margin)] py-4">
      <div class="max-w-screen-2xl mx-auto flex items-center justify-between">
        <h1 class="font-h1 tracking-tight">UMM 管理面板</h1>
        <span class="font-caption text-secondary-content">v{{ chrome.runtime.getManifest().version }}</span>
      </div>
    </header>

    <div class="max-w-screen-2xl mx-auto flex">
      <!-- Tab Navigation -->
      <nav class="w-48 shrink-0 border-r border-border p-[var(--space-4)] hidden lg:block">
        <div class="space-y-1">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            @click="navigateTo(tab.route)"
            :class="[
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
              currentTab === tab.id
                ? 'bg-primary text-primary-foreground'
                : 'text-secondary-content hover:bg-muted hover:text-primary-content'
            ]"
          >
            <component :is="tab.icon" class="h-4 w-4" />
            {{ tab.label }}
          </button>
        </div>
      </nav>

      <!-- Mobile Tab Bar -->
      <nav class="lg:hidden fixed bottom-0 left-0 right-0 border-t border-border bg-background z-50 px-[var(--page-margin)]">
        <div class="flex justify-around py-2">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            @click="navigateTo(tab.route)"
            :class="[
              'flex flex-col items-center gap-1 px-2 py-1 text-xs font-medium transition-colors',
              currentTab === tab.id
                ? 'text-primary'
                : 'text-secondary-content'
            ]"
          >
            <component :is="tab.icon" class="h-4 w-4" />
            {{ tab.label }}
          </button>
        </div>
      </nav>

      <!-- Content -->
      <main class="flex-1 p-[var(--card-padding)] pb-20 lg:pb-[var(--card-padding)]">
        <RouterView v-slot="{ Component }">
          <Suspense>
            <component :is="Component" />
            <template #fallback>
              <div class="flex items-center justify-center py-20">
                <div class="text-secondary-content font-body">加载中...</div>
              </div>
            </template>
          </Suspense>
        </RouterView>
      </main>
    </div>
  </div>
</template>
```

- [ ] **Step 5: Create placeholder tab components**

Create minimal placeholder files so the router works:

```bash
mkdir -p src/entrypoints/options/tabs/sync
```

For each tab, create a minimal placeholder. Example for `OverviewTab.vue`:

```vue
<script setup lang="ts">
</script>
<template>
  <div class="font-h2">概览</div>
</template>
```

Repeat for: `RatingTab.vue`, `LinkedTab.vue`, `SyncTab.vue`, `SettingsTab.vue`, `sync/WebDAVTab.vue`, `sync/ImportExportTab.vue`

- [ ] **Step 6: Run type-check**

```bash
npm run type-check
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/entrypoints/options.html src/entrypoints/options/ src/entrypoints/options/tabs/
git commit -m "feat(options): add options page shell with tab navigation"
```

---

## Task 4: Migrate OverviewTab

**Covers:** [S3], [S4]

**Files:**
- Create: `src/entrypoints/options/tabs/OverviewTab.vue` (replace placeholder)

- [ ] **Step 1: Create OverviewTab combining RecordsPage + PlatformsPage**

Create `src/entrypoints/options/tabs/OverviewTab.vue` with content migrated from `RecordsPage.vue` and `PlatformsPage.vue`, using responsive typography classes. Keep the existing Card/Badge components. Add `font-display` to stat numbers, `font-h1` to title, `font-caption` to descriptions.

Key changes from original:
- Stats grid: `grid-cols-2 md:grid-cols-4` (responsive columns)
- Platform list: stays as-is, wrapped in responsive container
- Add `class="font-display"` to stat numbers
- Add `class="font-h1"` to page title
- Add `class="font-caption"` to descriptions

- [ ] **Step 2: Run type-check**

```bash
npm run type-check
```

- [ ] **Step 3: Commit**

```bash
git add src/entrypoints/options/tabs/OverviewTab.vue
git commit -m "feat(options): migrate overview tab with responsive typography"
```

---

## Task 5: Migrate RatingTab

**Covers:** [S4]

**Files:**
- Create: `src/entrypoints/options/tabs/RatingTab.vue` (replace placeholder)

- [ ] **Step 1: Migrate RatingsPage.vue content to RatingTab.vue**

Copy the full content from `src/entrypoints/popup/pages/RatingsPage.vue` into `src/entrypoints/options/tabs/RatingTab.vue`. Apply responsive typography classes. Remove the Card wrapper (the App.vue already provides layout).

- [ ] **Step 2: Run type-check**

```bash
npm run type-check
```

- [ ] **Step 3: Commit**

```bash
git add src/entrypoints/options/tabs/RatingTab.vue
git commit -m "feat(options): migrate rating tab"
```

---

## Task 6: Migrate LinkedTab

**Covers:** [S4]

**Files:**
- Create: `src/entrypoints/options/tabs/LinkedTab.vue` (replace placeholder)

- [ ] **Step 1: Migrate LinkedPage.vue content to LinkedTab.vue**

Copy the full content from `src/entrypoints/popup/pages/LinkedPage.vue` into `src/entrypoints/options/tabs/LinkedTab.vue`. Apply responsive typography.

- [ ] **Step 2: Run type-check**

```bash
npm run type-check
```

- [ ] **Step 3: Commit**

```bash
git add src/entrypoints/options/tabs/LinkedTab.vue
git commit -m "feat(options): migrate linked tab"
```

---

## Task 7: Migrate SyncTab + Sub-tabs

**Covers:** [S4], [S8]

**Files:**
- Create: `src/entrypoints/options/tabs/SyncTab.vue` (replace placeholder)
- Create: `src/entrypoints/options/tabs/sync/WebDAVTab.vue` (replace placeholder)
- Create: `src/entrypoints/options/tabs/sync/ImportExportTab.vue` (replace placeholder)

- [ ] **Step 1: Create SyncTab with secondary tabs**

Create `src/entrypoints/options/tabs/SyncTab.vue` with a secondary tab bar (WebDAV / 导入导出). Use `defineAsyncComponent` for sub-tab lazy loading.

```vue
<script setup lang="ts">
import { ref, defineAsyncComponent } from 'vue'

const activeSubTab = ref('webdav')

const WebDAVTab = defineAsyncComponent(() => import('./sync/WebDAVTab.vue'))
const ImportExportTab = defineAsyncComponent(() => import('./sync/ImportExportTab.vue'))

const subTabs = [
  { id: 'webdav', label: 'WebDAV' },
  { id: 'import-export', label: '导入/导出' },
]
</script>

<template>
  <div>
    <h2 class="font-h1 mb-[var(--section-gap)]">数据同步</h2>

    <!-- Secondary Tab Bar -->
    <div class="flex gap-2 mb-6 border-b border-border pb-2">
      <button
        v-for="tab in subTabs"
        :key="tab.id"
        @click="activeSubTab = tab.id"
        :class="[
          'px-4 py-2 text-sm font-medium rounded-t-md transition-colors',
          activeSubTab === tab.id
            ? 'bg-primary text-primary-foreground'
            : 'text-secondary-content hover:bg-muted'
        ]"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- Sub-tab Content -->
    <Suspense>
      <WebDAVTab v-if="activeSubTab === 'webdav'" />
      <ImportExportTab v-else-if="activeSubTab === 'import-export'" />
      <template #fallback>
        <div class="py-8 text-center text-secondary-content font-body">加载中...</div>
      </template>
    </Suspense>
  </div>
</template>
```

- [ ] **Step 2: Migrate WebDAV section from SettingsPage to WebDAVTab**

Extract the WebDAV config section (lines 513-619 of SettingsPage.vue) into `sync/WebDAVTab.vue`. Add responsive typography.

- [ ] **Step 3: Migrate Import/Export section to ImportExportTab**

Extract the import/export section (lines 565-619 of SettingsPage.vue, plus `exportData`/`triggerImport`/`executeImport` logic) into `sync/ImportExportTab.vue`.

- [ ] **Step 4: Run type-check**

```bash
npm run type-check
```

- [ ] **Step 5: Commit**

```bash
git add src/entrypoints/options/tabs/SyncTab.vue src/entrypoints/options/tabs/sync/
git commit -m "feat(options): migrate sync tab with sub-tabs and lazy loading"
```

---

## Task 8: Migrate SettingsTab

**Covers:** [S4]

**Files:**
- Create: `src/entrypoints/options/tabs/SettingsTab.vue` (replace placeholder)

- [ ] **Step 1: Migrate NeoDB + Debug sections from SettingsPage to SettingsTab**

Extract NeoDB config (lines 623-669) and debug settings (lines 672-719) from SettingsPage.vue into `SettingsTab.vue`. Apply responsive typography.

- [ ] **Step 2: Run type-check**

```bash
npm run type-check
```

- [ ] **Step 3: Commit**

```bash
git add src/entrypoints/options/tabs/SettingsTab.vue
git commit -m "feat(options): migrate settings tab"
```

---

## Task 9: Popup Dashboard

**Covers:** [S3]

**Files:**
- Create: `src/entrypoints/popup/pages/DashboardPage.vue`
- Modify: `src/entrypoints/popup/App.vue`
- Modify: `src/entrypoints/popup/router.ts`

- [ ] **Step 1: Create DashboardPage.vue**

Create `src/entrypoints/popup/pages/DashboardPage.vue`:

```vue
<script setup lang="ts">
import { inject, computed, ref, onMounted, type Ref } from 'vue'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Settings } from 'lucide-vue-next'

const stats = inject<Ref<{ total: number; movie: number; tv: number; music: number }>>('stats', ref({ total: 0, movie: 0, tv: 0, music: 0 }))
const records = inject<Ref<Array<{ type: string; provider: string; providerId: string; rating: number }>>>('records', ref([]))
const loading = inject<boolean>('loading', false)
const loadData = inject<() => Promise<void>>('loadData', async () => {})

const recentRecords = computed(() => {
  return records.value.slice(0, 5)
})

function getPlatformLabel(provider: string): string {
  const labels: Record<string, string> = { douban: '豆瓣', imdb: 'IMDb', neodb: 'NeoDB', tmdb: 'TMDB' }
  return labels[provider] || provider
}

function openOptionsPage() {
  window.open(chrome.runtime.getURL('options.html'), '_blank')
}

onMounted(() => {
  loadData()
})
</script>

<template>
  <div class="min-h-screen bg-background">
    <div class="mx-auto px-[var(--page-margin)] py-6" style="max-width: var(--popup-max-width)">
      <!-- Header -->
      <div class="flex items-center justify-between mb-8">
        <h1 class="font-h1 tracking-tight">UMM</h1>
        <span class="font-caption text-secondary-content">v{{ chrome.runtime.getManifest().version }}</span>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="py-12 text-center text-secondary-content font-body">
        加载中...
      </div>

      <template v-else>
        <!-- Hero Stats -->
        <div class="grid grid-cols-2 gap-4 mb-[var(--section-gap)]">
          <div class="rounded-xl border border-border p-[var(--card-padding)] text-center">
            <div class="font-display text-primary-content">{{ stats.movie }}</div>
            <div class="font-caption text-secondary-content mt-1">电影</div>
          </div>
          <div class="rounded-xl border border-border p-[var(--card-padding)] text-center">
            <div class="font-display text-primary-content">{{ stats.tv }}</div>
            <div class="font-caption text-secondary-content mt-1">剧集</div>
          </div>
          <div class="rounded-xl border border-border p-[var(--card-padding)] text-center">
            <div class="font-display text-primary-content">{{ stats.music }}</div>
            <div class="font-caption text-secondary-content mt-1">音乐</div>
          </div>
          <div class="rounded-xl border border-border p-[var(--card-padding)] text-center">
            <div class="font-display text-primary-content">{{ records.length }}</div>
            <div class="font-caption text-secondary-content mt-1">已关联</div>
          </div>
        </div>

        <!-- Recent Records -->
        <div v-if="recentRecords.length > 0" class="mb-[var(--section-gap)]">
          <h2 class="font-h2 text-primary-content mb-4">最近记录</h2>
          <div class="space-y-2">
            <div
              v-for="(record, i) in recentRecords"
              :key="i"
              class="flex items-center justify-between rounded-lg border border-border px-4 py-3"
            >
              <div class="flex items-center gap-3">
                <Badge variant="outline" class="text-xs">{{ getPlatformLabel(record.provider) }}</Badge>
                <span class="font-body text-primary-content">{{ record.type }}</span>
                <span class="font-mono text-secondary-content text-xs">{{ record.providerId }}</span>
              </div>
              <span v-if="record.rating" class="font-caption text-primary">
                ★ {{ record.rating }}
              </span>
            </div>
          </div>
        </div>

        <!-- CTA -->
        <Button @click="openOptionsPage" class="w-full" size="lg">
          <Settings class="mr-2 h-4 w-4" />
          管理面板
        </Button>
      </template>

      <!-- Footer -->
      <div class="mt-8 pt-4 border-t border-border text-center">
        <span class="font-caption text-tertiary-content">
          {{ records.length }} 条记录 · v{{ chrome.runtime.getManifest().version }}
        </span>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Simplify popup/App.vue**

Replace `src/entrypoints/popup/App.vue` with a minimal shell that only provides data loading and inject context. Remove all tab navigation, theme toggle, confirm dialog — those belong in options page.

- [ ] **Step 3: Simplify popup/router.ts**

Replace with single route:

```typescript
import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/:pathMatch(.*)*', name: 'dashboard', component: () => import('./pages/DashboardPage.vue') },
  ],
})

export default router
```

- [ ] **Step 4: Remove old page files**

```bash
rm src/entrypoints/popup/pages/RecordsPage.vue
rm src/entrypoints/popup/pages/PlatformsPage.vue
rm src/entrypoints/popup/pages/RatingsPage.vue
rm src/entrypoints/popup/pages/LinkedPage.vue
rm src/entrypoints/popup/pages/SettingsPage.vue
```

- [ ] **Step 5: Run type-check**

```bash
npm run type-check
```

- [ ] **Step 6: Commit**

```bash
git add src/entrypoints/popup/
git commit -m "feat(popup): simplify to read-only dashboard with CTA to options page"
```

---

## Task 10: Build Verification + Final Type-Check

**Covers:** [S9]

- [ ] **Step 1: Full type-check**

```bash
npm run type-check
```

Expected: PASS

- [ ] **Step 2: Full build**

```bash
npm run build
```

Expected: PASS

- [ ] **Step 3: Verify manifest includes options_page**

Check `dist/chrome-mv3/manifest.json` contains `options_ui` with `open_in_tab: true`.

- [ ] **Step 4: Verify options.html exists in output**

```bash
ls dist/chrome-mv3/options.html
```

Expected: file exists

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit --signoff -m "chore: verify build passes for popup redesign

Type-check and production build both pass.
Options page HTML included in manifest.
Assisted-by: MiMo v2.5 via MiMoCode"
```
