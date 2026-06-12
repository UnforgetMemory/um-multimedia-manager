# Options Page Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a unified design system for the Options Page with theme management, 12-level responsive breakpoints, 7-level typography, appearance settings, and skeleton loading.

**Architecture:** CSS custom properties for tokens, `useTheme` composable for state management, `AppearanceTab` for user settings, skeleton components for loading states. All settings persisted to `chrome.storage.local`.

**Tech Stack:** Vue 3 Composition API, Tailwind CSS v4, shadcn/vue, chrome.storage API

**Spec:** `docs/compose/specs/2026-06-12-options-page-design-system.md`

---

## File Map

### New Files
| File | Responsibility |
|------|---------------|
| `src/composables/useTheme.ts` | Theme/font/density state management |
| `src/entrypoints/options/tabs/AppearanceTab.vue` | Appearance settings UI |
| `src/styles/design-tokens.css` | Centralized breakpoints + spacing tokens |

### Modified Files
| File | Change |
|------|--------|
| `src/entrypoints/options/App.vue` | Theme init, 12-level responsive, UMManager name |
| `src/entrypoints/options/router.ts` | Add `/appearance` route |
| `src/styles/typography.css` | Extended 7-level typography + 3-level brightness |
| `src/entrypoints/popup/pages/DashboardPage.vue` | UMManager name |
| `src/entrypoints/popup/index.html` | UMManager title |
| `wxt.config.ts` | Manifest name |

---

## Task 1: Design Tokens CSS

**Covers:** [S4], [S5]

**Files:**
- Create: `src/styles/design-tokens.css`

- [ ] **Step 1: Create design-tokens.css with 12-level breakpoints and spacing**

Create `src/styles/design-tokens.css`:

```css
/* 12-Level Responsive Breakpoints */
:root {
  --bp-xs: 0px;
  --bp-sm: 320px;
  --bp-md: 375px;
  --bp-lg: 480px;
  --bp-xl: 640px;
  --bp-2xl: 768px;
  --bp-3xl: 1024px;
  --bp-4xl: 1280px;
  --bp-5xl: 1536px;
  --bp-6xl: 1920px;
  --bp-7xl: 2560px;
  --bp-8xl: 3200px;

  /* Spacing Scale (4px base) */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;
  --space-20: 80px;

  /* Responsive page margins */
  --page-margin: clamp(16px, 12px + 1vw, 64px);
  --card-padding: clamp(12px, 8px + 0.8vw, 40px);
  --section-gap: clamp(16px, 12px + 1vw, 56px);

  /* Font scale multiplier */
  --font-scale: 1;
}

/* Density modes */
.density-compact { --font-scale: 0.9; --page-margin: clamp(12px, 8px + 0.5vw, 32px); --card-padding: clamp(8px, 6px + 0.4vw, 20px); --section-gap: clamp(12px, 8px + 0.5vw, 24px); }
.density-default { --font-scale: 1; }
.density-comfortable { --font-scale: 1.1; --page-margin: clamp(20px, 16px + 1.5vw, 80px); --card-padding: clamp(16px, 12px + 1vw, 48px); --section-gap: clamp(24px, 16px + 1.5vw, 64px); }

/* Font size scaling */
.font-compact { font-size: calc(var(--font-body-size) * 0.9); }
.font-default { font-size: var(--font-body-size); }
.font-comfortable { font-size: calc(var(--font-body-size) * 1.1); }
```

- [ ] **Step 2: Import in options main.ts**

In `src/entrypoints/options/main.ts`, add at top:

```typescript
import '@/styles/design-tokens.css'
```

- [ ] **Step 3: Commit**

```bash
git add src/styles/design-tokens.css src/entrypoints/options/main.ts
git commit -m "feat(design): add 12-level breakpoints and spacing tokens"
```

---

## Task 2: Extended Typography

**Covers:** [S3]

**Files:**
- Modify: `src/styles/typography.css`

- [ ] **Step 1: Extend typography.css with H3 level and 3-level brightness**

Add to `src/styles/typography.css` after existing variables:

```css
:root {
  /* Heading 3: subsection titles */
  --font-h3-size: clamp(0.875rem, 0.75rem + 0.375vw, 1.25rem);
  --font-h3-weight: 600;
  --font-h3-line-height: 1.4;

  /* Mono: code, IDs */
  --font-mono-size: clamp(0.75rem, 0.625rem + 0.375vw, 1rem);
  --font-mono-weight: 400;
  --font-mono-line-height: 1.5;
}

.font-h3 {
  font-size: var(--font-h3-size);
  font-weight: var(--font-h3-weight);
  line-height: var(--font-h3-line-height);
}

.font-mono {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
  font-size: var(--font-mono-size);
  font-weight: var(--font-mono-weight);
  line-height: var(--font-mono-line-height);
}

/* Brightness levels */
.text-primary-content { color: hsl(var(--foreground)); }
.text-secondary-content { color: hsl(var(--muted-foreground)); }
.text-tertiary-content { color: hsl(var(--muted-foreground) / 0.6); }
```

- [ ] **Step 2: Commit**

```bash
git add src/styles/typography.css
git commit -m "feat(typography): add H3, mono level and 3-level brightness"
```

---

## Task 3: Theme Composable

**Covers:** [S2], [S6]

**Files:**
- Create: `src/composables/useTheme.ts`

- [ ] **Step 1: Create useTheme composable**

Create `src/composables/useTheme.ts`:

```typescript
import { ref, onMounted, onUnmounted, watch } from 'vue'

export type ThemeMode = 'light' | 'dark' | 'auto'
export type FontSize = 'compact' | 'default' | 'comfortable'
export type Density = 'compact' | 'default' | 'comfortable'

const STORAGE_KEY = 'umm:appearance'

interface AppearanceState {
  theme: ThemeMode
  fontSize: FontSize
  density: Density
}

const theme = ref<ThemeMode>('auto')
const fontSize = ref<FontSize>('default')
const density = ref<Density>('default')
let mediaQuery: MediaQueryList | null = null
let mediaHandler: ((e: MediaQueryListEvent) => void) | null = null

function applyTheme(mode: ThemeMode) {
  const isDark = mode === 'dark' || (mode === 'auto' && mediaQuery?.matches)
  document.documentElement.classList.toggle('dark', isDark)
}

function applyFontSize(size: FontSize) {
  document.documentElement.classList.remove('font-compact', 'font-default', 'font-comfortable')
  document.documentElement.classList.add(`font-${size}`)
}

function applyDensity(d: Density) {
  document.documentElement.classList.remove('density-compact', 'density-default', 'density-comfortable')
  document.documentElement.classList.add(`density-${d}`)
}

function applyAll() {
  applyTheme(theme.value)
  applyFontSize(fontSize.value)
  applyDensity(density.value)
}

export function useTheme() {
  onMounted(() => {
    // Read from chrome.storage
    try {
      chrome.storage.local.get([STORAGE_KEY], (result: any) => {
        const saved = result[STORAGE_KEY] as AppearanceState | undefined
        if (saved) {
          theme.value = saved.theme || 'auto'
          fontSize.value = saved.fontSize || 'default'
          density.value = saved.density || 'default'
        }
        applyAll()
      })
    } catch {
      applyAll()
    }

    // Listen for system theme changes (auto mode)
    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    mediaHandler = () => { if (theme.value === 'auto') applyTheme('auto') }
    mediaQuery.addEventListener('change', mediaHandler)

    // Listen for storage changes from other contexts
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return
      if (changes[STORAGE_KEY]) {
        const saved = changes[STORAGE_KEY].newValue as AppearanceState
        if (saved) {
          theme.value = saved.theme || 'auto'
          fontSize.value = saved.fontSize || 'default'
          density.value = saved.density || 'default'
          applyAll()
        }
      }
    })
  })

  onUnmounted(() => {
    if (mediaQuery && mediaHandler) {
      mediaQuery.removeEventListener('change', mediaHandler)
    }
  })

  // Persist on change
  watch([theme, fontSize, density], () => {
    applyAll()
    try {
      chrome.storage.local.set({
        [STORAGE_KEY]: {
          theme: theme.value,
          fontSize: fontSize.value,
          density: density.value,
        },
      })
    } catch { /* silent */ }
  })

  return { theme, fontSize, density }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/composables/useTheme.ts
git commit -m "feat(theme): add useTheme composable with light/dark/auto"
```

---

## Task 4: AppearanceTab

**Covers:** [S6]

**Files:**
- Create: `src/entrypoints/options/tabs/AppearanceTab.vue`
- Modify: `src/entrypoints/options/router.ts`

- [ ] **Step 1: Create AppearanceTab.vue**

Create `src/entrypoints/options/tabs/AppearanceTab.vue`:

```vue
<script setup lang="ts">
import { useTheme } from '@/composables/useTheme'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Sun, Moon, Monitor } from 'lucide-vue-next'

const { theme, fontSize, density } = useTheme()

const themeOptions = [
  { value: 'light' as const, label: '浅色', icon: Sun },
  { value: 'dark' as const, label: '深色', icon: Moon },
  { value: 'auto' as const, label: '跟随系统', icon: Monitor },
]

const fontSizeOptions = [
  { value: 'compact' as const, label: '紧凑', desc: '更小的字体' },
  { value: 'default' as const, label: '标准', desc: '默认大小' },
  { value: 'comfortable' as const, label: '宽松', desc: '更大的字体' },
]

const densityOptions = [
  { value: 'compact' as const, label: '紧凑', desc: '更小的间距' },
  { value: 'default' as const, label: '标准', desc: '默认间距' },
  { value: 'comfortable' as const, label: '宽松', desc: '更大的间距' },
]
</script>

<template>
  <div class="space-y-6">
    <h2 class="font-h1 text-primary-content">外观设置</h2>

    <!-- Theme -->
    <Card>
      <CardHeader class="pb-3">
        <CardTitle class="font-h2 text-primary-content">主题</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="grid grid-cols-3 gap-3">
          <button
            v-for="opt in themeOptions"
            :key="opt.value"
            @click="theme = opt.value"
            :class="[
              'flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all',
              theme === opt.value
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            ]"
          >
            <component :is="opt.icon" class="w-5 h-5" :class="theme === opt.value ? 'text-primary' : 'text-muted-foreground'" />
            <span class="text-sm font-medium">{{ opt.label }}</span>
          </button>
        </div>
      </CardContent>
    </Card>

    <!-- Font Size -->
    <Card>
      <CardHeader class="pb-3">
        <CardTitle class="font-h2 text-primary-content">字体大小</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="grid grid-cols-3 gap-3">
          <button
            v-for="opt in fontSizeOptions"
            :key="opt.value"
            @click="fontSize = opt.value"
            :class="[
              'flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all text-center',
              fontSize === opt.value
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            ]"
          >
            <span class="text-sm font-medium">{{ opt.label }}</span>
            <span class="text-xs text-muted-foreground">{{ opt.desc }}</span>
          </button>
        </div>
      </CardContent>
    </Card>

    <!-- Density -->
    <Card>
      <CardHeader class="pb-3">
        <CardTitle class="font-h2 text-primary-content">间距密度</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="grid grid-cols-3 gap-3">
          <button
            v-for="opt in densityOptions"
            :key="opt.value"
            @click="density = opt.value"
            :class="[
              'flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all text-center',
              density === opt.value
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            ]"
          >
            <span class="text-sm font-medium">{{ opt.label }}</span>
            <span class="text-xs text-muted-foreground">{{ opt.desc }}</span>
          </button>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
```

- [ ] **Step 2: Add route to router.ts**

In `src/entrypoints/options/router.ts`, add route:

```typescript
{
  path: '/appearance',
  name: 'appearance',
  component: () => import('./tabs/AppearanceTab.vue'),
},
```

- [ ] **Step 3: Run type-check**

```bash
npm run type-check
```

- [ ] **Step 4: Commit**

```bash
git add src/entrypoints/options/tabs/AppearanceTab.vue src/entrypoints/options/router.ts
git commit -m "feat(appearance): add AppearanceTab with theme/font/density settings"
```

---

## Task 5: Options App.vue Redesign

**Covers:** [S2], [S5], [S8]

**Files:**
- Modify: `src/entrypoints/options/App.vue`

- [ ] **Step 1: Rewrite App.vue with theme init, 12-level responsive, UMManager name**

Replace `src/entrypoints/options/App.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useRouter, useRoute, RouterView } from 'vue-router'
import { useTheme } from '@/composables/useTheme'
import { Database, Star, Link, RefreshCw, Settings, Palette } from 'lucide-vue-next'

const router = useRouter()
const route = useRoute()

// Initialize theme system
useTheme()

const appVersion = computed(() => {
  try { return chrome.runtime.getManifest().version } catch { return '3.0.0' }
})

const tabs = [
  { id: 'overview', label: '概览', icon: Database, route: '/overview' },
  { id: 'rating', label: '评分管理', icon: Star, route: '/rating' },
  { id: 'linked', label: '关联查询', icon: Link, route: '/linked' },
  { id: 'sync', label: '数据同步', icon: RefreshCw, route: '/sync' },
  { id: 'appearance', label: '外观', icon: Palette, route: '/appearance' },
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
    <header class="border-b border-border" :style="{ padding: 'var(--space-4) var(--page-margin)' }">
      <div class="mx-auto flex items-center justify-between" style="max-width: 1440px;">
        <h1 class="font-h1 tracking-tight">UMManager</h1>
        <span class="font-caption text-secondary-content">v{{ appVersion }}</span>
      </div>
    </header>

    <div class="mx-auto flex" style="max-width: 1440px;">
      <!-- Sidebar (xl+) -->
      <nav class="w-60 shrink-0 border-r border-border hidden xl:block" :style="{ padding: 'var(--space-4)' }">
        <div class="space-y-1">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            @click="navigateTo(tab.route)"
            :class="[
              'w-full flex items-center gap-3 rounded-md font-medium transition-colors',
              currentTab === tab.id
                ? 'bg-primary text-primary-foreground'
                : 'text-secondary-content hover:bg-muted hover:text-primary-content'
            ]"
            :style="{ padding: 'var(--space-2) var(--space-3)', fontSize: 'var(--font-body-size)' }"
          >
            <component :is="tab.icon" class="h-4 w-4" />
            {{ tab.label }}
          </button>
        </div>
      </nav>

      <!-- Bottom nav (sm–lg) -->
      <nav class="xl:hidden fixed bottom-0 left-0 right-0 border-t border-border bg-background z-50" :style="{ padding: '0 var(--page-margin)' }">
        <div class="flex justify-around py-2">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            @click="navigateTo(tab.route)"
            :class="[
              'flex flex-col items-center gap-1 font-medium transition-colors',
              currentTab === tab.id ? 'text-primary' : 'text-secondary-content'
            ]"
            :style="{ padding: 'var(--space-1) var(--space-2)', fontSize: 'var(--font-caption-size)' }"
          >
            <component :is="tab.icon" class="h-4 w-4" />
            {{ tab.label }}
          </button>
        </div>
      </nav>

      <!-- Content -->
      <main class="flex-1 pb-20 xl:pb-0" :style="{ padding: 'var(--card-padding)' }">
        <RouterView v-slot="{ Component }">
          <Suspense>
            <component :is="Component" />
            <template #fallback>
              <div class="space-y-4 animate-pulse">
                <div class="h-8 bg-muted rounded w-1/3"></div>
                <div class="h-4 bg-muted rounded w-2/3"></div>
                <div class="h-48 bg-muted rounded"></div>
              </div>
            </template>
          </Suspense>
        </RouterView>
      </main>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Run type-check**

```bash
npm run type-check
```

- [ ] **Step 3: Commit**

```bash
git add src/entrypoints/options/App.vue
git commit -m "feat(options): redesign App.vue with theme, 12-level responsive, UMManager"
```

---

## Task 6: Skeleton Loading for Tab Content

**Covers:** [S7]

**Files:**
- Modify: All tab components in `src/entrypoints/options/tabs/`

- [ ] **Step 1: Add skeleton loading to OverviewTab.vue**

Replace the loading state in OverviewTab with skeleton:

```vue
<template>
  <div class="space-y-[var(--section-gap)]">
    <h2 class="font-h1 text-primary-content">记录概览</h2>

    <div v-if="!dataReady" class="space-y-4">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div v-for="i in 4" :key="i" class="h-24 bg-muted rounded-xl animate-pulse"></div>
      </div>
      <div class="h-32 bg-muted rounded-xl animate-pulse"></div>
    </div>

    <template v-else>
      <!-- existing content -->
    </template>
  </div>
</template>
```

- [ ] **Step 2: Apply same pattern to RatingTab, LinkedTab, SyncTab, SettingsTab**

For each tab, add `dataReady` ref and skeleton placeholder before actual content.

- [ ] **Step 3: Run type-check**

```bash
npm run type-check
```

- [ ] **Step 4: Commit**

```bash
git add src/entrypoints/options/tabs/
git commit -m "feat(options): add skeleton loading to all tab components"
```

---

## Task 7: UMManager Naming

**Covers:** [S8]

**Files:**
- Modify: `src/entrypoints/popup/pages/DashboardPage.vue`
- Modify: `src/entrypoints/popup/index.html`
- Modify: `wxt.config.ts`

- [ ] **Step 1: Update DashboardPage.vue header**

Change `UManager` → `UMManager` in DashboardPage.vue template.

- [ ] **Step 2: Update popup index.html title**

Change `<title>UMM Popup</title>` → `<title>UMManager</title>`.

- [ ] **Step 3: Update wxt.config.ts manifest name**

Change `name: 'UMM - 多媒体管理器'` → `name: 'UMManager - 多媒体管理器'`.

- [ ] **Step 4: Run type-check**

```bash
npm run type-check
```

- [ ] **Step 5: Commit**

```bash
git add src/entrypoints/popup/pages/DashboardPage.vue src/entrypoints/popup/index.html wxt.config.ts
git commit -m "feat: rename UMM to UMManager across all entrypoints"
```

---

## Task 8: Final Build Verification

**Covers:** [S2], [S3], [S4], [S5], [S6], [S7], [S8]

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

- [ ] **Step 3: Verify manifest**

```bash
cat dist/chrome-mv3/manifest.json | python3 -c "import json,sys; m=json.load(sys.stdin); print('name:', m.get('name')); print('version:', m.get('version')); print('options_ui:', m.get('options_ui',{}).get('open_in_tab'))"
```

Expected: `name: UMManager - 多媒体管理器`, `version: 3.0.0`, `open_in_tab: True`

- [ ] **Step 4: Verify CSS contains new tokens**

```bash
grep -c "font-h3\|font-mono\|text-tertiary\|density-compact\|font-compact" dist/chrome-mv3/assets/*.css
```

Expected: > 0

- [ ] **Step 5: Commit**

```bash
git add -A
git commit --signoff -m "chore: verify build passes for design system implementation

Type-check and production build both pass.
Options page includes theme management, 12-level responsive, and AppearanceTab.
Assisted-by: MiMo v2.5 via MiMoCode"
```
