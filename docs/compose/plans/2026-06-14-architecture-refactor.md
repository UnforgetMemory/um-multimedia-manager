# Architecture Refactoring & Modernization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update all dependencies to latest stable, introduce Pinia for state management, extract composables/components from duplicated code, adopt @vueuse/core, split monolithic content script files. Zero data structure or page-logic changes.

**Architecture:** Pinia stores replace module-level reactive singletons. Composables extract shared business logic. Components extract shared UI patterns. Content handlers split by responsibility, preserving all function signatures and behavior. @vueuse/core replaces hand-rolled browser APIs.

**Tech Stack:** Vue 3.5.38 + vue-router 5.1.0 + Pinia 3.0.4 + @vueuse/core 14.3.0 + TypeScript 6.0 + WXT 0.20.26 + Tailwind CSS 4.3.1 + shadcn/vue (reka-ui 2.9.10)

---

### Task 1: Update All Dependencies to Latest Stable

**Covers:** [S3]

**Files:**
- Modify: `package.json`

- [ ] Update `package.json` dependency versions

```json
{
  "dependencies": {
    "pinia": "^3.0.4",
    "vue": "^3.5.38",
    "vue-router": "^5.1.0",
    "reka-ui": "^2.9.10",
    "tailwind-merge": "^3.6.0",
    "gsap": "^3.15.0"
  },
  "devDependencies": {
    "tailwindcss": "^4.3.1",
    "vite": "^8.0.16",
    "vue-tsc": "^3.3.5",
    "@tailwindcss/vite": "^4.3.1",
    "@types/chrome": "^0.1.43",
    "@types/node": "^25.9.3",
    "sharp": "^0.35.1",
    "tsx": "^4.22.4"
  }
}
```

Remove: `"@crxjs/vite-plugin"` entirely.

- [ ] Run install and build verification

```bash
npm install && npm run type-check && npm run build
```

Expected: No errors.

---

### Task 2: Create Pinia Stores (theme, app, confirm)

**Covers:** [S4]

**Files:**
- Create: `src/stores/theme.ts`
- Create: `src/stores/app.ts`
- Create: `src/stores/confirm.ts`
- Create: `src/stores/index.ts` (barrel export)

- [ ] Create `src/stores/theme.ts`

```ts
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { useStorage, useMediaQuery } from '@vueuse/core'

export type ThemeMode = 'light' | 'dark' | 'auto'
export type FontSize = 'compact' | 'default' | 'comfortable'
export type Density = 'compact' | 'default' | 'comfortable'

const STORAGE_KEY = 'umm:appearance'

export const useThemeStore = defineStore('theme', () => {
  const theme = ref<ThemeMode>('auto')
  const fontSize = ref<FontSize>('default')
  const density = ref<Density>('default')
  const isDark = useMediaQuery('(prefers-color-scheme: dark)')
  const storage = useStorage<{ theme: ThemeMode; fontSize: FontSize; density: Density }>(
    STORAGE_KEY,
    { theme: 'auto', fontSize: 'default', density: 'default' },
  )

  function applyTheme(mode: ThemeMode) {
    const dark = mode === 'dark' || (mode === 'auto' && isDark.value)
    document.documentElement.classList.toggle('dark', dark)
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
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.documentElement.classList.add('theme-ready')
      })
    })
  }

  // Init from storage
  theme.value = storage.value.theme
  fontSize.value = storage.value.fontSize
  density.value = storage.value.density
  applyAll()

  // Persist on change
  watch([theme, fontSize, density], () => {
    storage.value = { theme: theme.value, fontSize: fontSize.value, density: density.value }
    applyAll()
    chrome.storage.local.set({ [STORAGE_KEY]: storage.value })
  })

  // React to chrome.storage changes (cross-context sync)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return
    const saved = changes[STORAGE_KEY]?.newValue as typeof storage.value | undefined
    if (saved) {
      theme.value = saved.theme
      fontSize.value = saved.fontSize
      density.value = saved.density
    }
  })

  return { theme, fontSize, density, applyTheme, applyFontSize, applyDensity }
})
```

- [ ] Create `src/stores/app.ts`

```ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { safeSendMessage } from '@/utils/context'
import type { StoreRecord, AdultAvId } from '@/types'

export const useAppStore = defineStore('app', () => {
  const loading = ref(false)
  const error = ref<string | null>(null)
  const dataReady = ref(false)
  const records = ref<StoreRecord[]>([])
  const adultAvItems = ref<AdultAvId[]>([])
  const appVersion = ref('')

  appVersion.value = (() => {
    try { return chrome.runtime.getManifest().version } catch { return '3.0.0' }
  })()

  async function loadData() {
    if (loading.value) return
    loading.value = true
    error.value = null
    try {
      const [recordsRes, adultAvRes] = await Promise.all([
        safeSendMessage({ type: 'GET_ALL_RECORDS' }, { timeout: 10000, retries: 2 }),
        safeSendMessage({ type: 'ADULT_AV_GET_ALL' }, { timeout: 8000, retries: 1 }),
      ])
      if (!recordsRes?.success) throw new Error(recordsRes?.error || '获取数据失败')
      records.value = recordsRes.records
      adultAvItems.value = adultAvRes?.success ? (adultAvRes.items || []) : []
      dataReady.value = true
    } catch (e) {
      error.value = '数据加载失败，请重试'
      records.value = []
    } finally {
      loading.value = false
    }
  }

  return { loading, error, dataReady, records, adultAvItems, appVersion, loadData }
})
```

- [ ] Create `src/stores/confirm.ts`

```ts
import { defineStore } from 'pinia'
import { reactive } from 'vue'

interface ConfirmDialogState {
  open: boolean; title: string; description: string
  warning?: string; details?: string
  confirmText?: string; loading: boolean
  action: () => Promise<void>
}

const defaultState: ConfirmDialogState = {
  open: false, title: '', description: '',
  confirmText: '确认', loading: false, action: async () => {},
}

export const useConfirmStore = defineStore('confirm', () => {
  const state = reactive<ConfirmDialogState>({ ...defaultState })

  function show(config: Omit<ConfirmDialogState, 'open' | 'loading'>) {
    Object.assign(state, { ...config, open: true, loading: false })
  }

  async function confirm() {
    state.loading = true
    try { await state.action(); state.open = false }
    catch { /* handled by caller */ }
    finally { state.loading = false }
  }

  return { state, show, confirm }
})
```

- [ ] Create `src/stores/index.ts`

```ts
export { useThemeStore } from './theme'
export { useAppStore } from './app'
export { useConfirmStore } from './confirm'
```

- [ ] Run type-check to verify

```bash
npm run type-check
```

Expected: No errors related to Pinia stores.

---

### Task 3: Register Pinia in Popup and Options Entry Points

**Covers:** [S4]

**Files:**
- Modify: `src/entrypoints/popup/main.ts`
- Modify: `src/entrypoints/options/main.ts`

- [ ] Update popup/main.ts — add `createPinia`

```ts
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import '../../style.css'
import '../../styles/typography.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
```

- [ ] Update options/main.ts — add `createPinia`

```ts
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import '@/styles/typography.css'
import '@/styles/design-tokens.css'
import '../../style.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
```

- [ ] Run type-check

```bash
npm run type-check
```

---

### Task 4: Refactor Options App.vue to Use Pinia Stores

**Covers:** [S4, S6]

**Files:**
- Modify: `src/entrypoints/options/App.vue`

- [ ] Replace `useTheme()` call with `useThemeStore()` and remove manual `appVersion` computed

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute, RouterView } from 'vue-router'
import { useThemeStore } from '@/stores/theme'
import { useAppStore } from '@/stores/app'
import { Database, Star, Link, RefreshCw, Settings, Palette, Menu, X } from 'lucide-vue-next'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import ToastContainer from '@/components/ToastContainer.vue'

const router = useRouter()
const route = useRoute()
const themeStore = useThemeStore()
const appStore = useAppStore()

const sidebarOpen = ref(false)

const tabs = [
  { id: 'overview', label: '概览', icon: Database, route: '/overview' },
  { id: 'rating', label: '评分管理', icon: Star, route: '/rating' },
  { id: 'linked', label: '关联查询', icon: Link, route: '/linked' },
  { id: 'sync', label: '数据同步', icon: RefreshCw, route: '/sync' },
  { id: 'appearance', label: '外观', icon: Palette, route: '/appearance' },
  { id: 'settings', label: '设置', icon: Settings, route: '/settings' },
] as const

const currentTab = computed(() => tabs.find(t => t.id === route.name)?.id || 'overview')

function navigateTo(path: string) {
  router.push(path)
  sidebarOpen.value = false
}
</script>
```

(Keep template 100% identical — no visual changes.)

- [ ] Run type-check

```bash
npm run type-check
```

---

### Task 5: Create Shared Composables (useStats, usePlatformMeta, useRecordLoader)

**Covers:** [S5]

**Files:**
- Create: `src/composables/useStats.ts`
- Create: `src/composables/usePlatformMeta.ts`
- Create: `src/composables/useRecordLoader.ts`

- [ ] Create `src/composables/useStats.ts`

```ts
import { computed, type Ref } from 'vue'
import type { StoreRecord, AdultAvId } from '@/types'

export function useStats(records: Ref<StoreRecord[]>, adultAvItems: Ref<AdultAvId[]>) {
  const stats = computed(() => {
    let movie = 0, tv = 0, music = 0
    for (const r of records.value) {
      if (r.type === 'movie') movie++
      else if (r.type === 'tv') tv++
      else if (r.type === 'music') music++
    }
    return { total: records.value.length, movie, tv, music, jav: adultAvItems.value.length }
  })

  return { stats }
}
```

- [ ] Create `src/composables/usePlatformMeta.ts`

```ts
export const PLATFORM_LABELS: Record<string, string> = {
  douban: '豆瓣', imdb: 'IMDb', neodb: 'NeoDB', tmdb: 'TMDB',
  javdb: 'JavDB', sehuatang: '色花堂', local: '本地',
}

export const PLATFORM_HUES: Record<string, number> = {
  douban: 142, imdb: 45, neodb: 217, tmdb: 271,
  javdb: 0, sehuatang: 25, local: 200,
}

export function usePlatformColor(hue: number) {
  const isDark = document.documentElement.classList.contains('dark')
  return {
    bar: `hsl(${hue}, 55%, ${isDark ? '50%' : '45%'})`,
    icon: `hsl(${hue}, 55%, ${isDark ? '45%' : '40%'})`,
    chipBg: isDark ? `hsl(${hue}, 30%, 15%)` : `hsl(${hue}, 40%, 95%)`,
    chipText: isDark ? `hsl(${hue}, 50%, 75%)` : `hsl(${hue}, 45%, 35%)`,
    chipBorder: isDark ? `hsl(${hue}, 25%, 25%)` : `hsl(${hue}, 35%, 80%)`,
  }
}
```

- [ ] Create `src/composables/useRecordLoader.ts`

```ts
import { ref } from 'vue'
import { safeSendMessage } from '@/utils/context'
import type { StoreRecord } from '@/types'

interface LoadResult {
  records: StoreRecord[]
  adultAvItems: any[]
}

export function useRecordLoader() {
  const loading = ref(false)
  const error = ref<string | null>(null)
  const dataReady = ref(false)

  async function load(): Promise<LoadResult | null> {
    if (loading.value) return null
    loading.value = true
    error.value = null
    try {
      const [recordsRes, adultAvRes] = await Promise.all([
        safeSendMessage({ type: 'GET_ALL_RECORDS' }, { timeout: 10000, retries: 2 }),
        safeSendMessage({ type: 'ADULT_AV_GET_ALL' }, { timeout: 8000, retries: 1 }),
      ])
      if (!recordsRes?.success) throw new Error(recordsRes?.error || '获取数据失败')
      const result: LoadResult = {
        records: recordsRes.records || [],
        adultAvItems: adultAvRes?.success ? (adultAvRes.items || []) : [],
      }
      dataReady.value = true
      return result
    } catch (e) {
      error.value = '数据加载失败，请重试'
      return null
    } finally {
      loading.value = false
    }
  }

  return { loading, error, dataReady, load }
}
```

- [ ] Run type-check

```bash
npm run type-check
```

---

### Task 6: Extract Shared UI Components (HeatmapCalendar, WeeklyStats, StatCard, PlatformDistribution)

**Covers:** [S6]

**Files:**
- Create: `src/components/HeatmapCalendar.vue`
- Create: `src/components/WeeklyStats.vue`
- Create: `src/components/StatCard.vue`
- Create: `src/components/PlatformDistribution.vue`

- [ ] Create `src/components/StatCard.vue`

```vue
<script setup lang="ts">
import type { Component } from 'vue'
import { Card } from '@/components/ui/card'

defineProps<{
  icon: Component
  label: string
  value: number
  loading?: boolean
}>()
</script>

<template>
  <Card class="p-3 text-center overflow-hidden">
    <CardContent class="p-0">
      <component :is="icon" class="w-5 h-5 mx-auto mb-1.5 text-secondary-content" />
      <div
        class="text-xl sm:text-2xl font-bold tracking-tight text-primary-content truncate tabular-nums"
        :class="{ 'animate-pulse': loading }"
      >
        {{ loading ? '—' : value.toLocaleString() }}
      </div>
      <div class="text-xs-scaled text-secondary-content mt-1">{{ label }}</div>
    </CardContent>
  </Card>
</template>
```

- [ ] Create `src/components/HeatmapCalendar.vue`

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { StoreRecord } from '@/types'

const props = defineProps<{
  records: StoreRecord[]
  adultAvItems: { updatedAt?: string }[]
}>()

const dayLabels = ['', '一', '', '三', '', '五', '']
const weekdayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

const calendarData = computed(() => {
  const now = new Date()
  const dayMs = 86400000
  const days = 90
  const map: Record<string, number> = {}
  for (const r of props.records) {
    if (!r.updatedAt) continue
    const d = new Date(r.updatedAt)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    map[key] = (map[key] || 0) + 1
  }
  for (const item of props.adultAvItems) {
    if (!item.updatedAt) continue
    const d = new Date(item.updatedAt)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    map[key] = (map[key] || 0) + 1
  }
  const maxDaily = Math.max(1, ...Object.values(map))
  const weeks: { date: Date; count: number; level: number }[][] = []
  let currentWeek: { date: Date; count: number; level: number }[] = []
  const startDate = new Date(now.getTime() - (days - 1) * dayMs)
  const startDay = startDate.getDay()
  startDate.setDate(startDate.getDate() - startDay)
  for (let i = 0; i < days + startDay; i++) {
    const d = new Date(startDate.getTime() + i * dayMs)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const count = map[key] || 0
    const level = count === 0 ? 0 : Math.min(8, Math.ceil((count / maxDaily) * 8))
    currentWeek.push({ date: d, count, level })
    if (currentWeek.length === 7) { weeks.push(currentWeek); currentWeek = [] }
  }
  if (currentWeek.length > 0) weeks.push(currentWeek)
  const monthLabels: { week: number; label: string }[] = []
  let lastMonth = -1
  weeks.forEach((week, i) => {
    const month = week[0].date.getMonth()
    if (month !== lastMonth) { monthLabels.push({ week: i, label: week[0].date.toLocaleDateString('zh-CN', { month: 'short' }) }); lastMonth = month }
  })
  return { weeks, monthLabels, maxDaily }
})

function heatmapColor(level: number): string {
  const isDark = document.documentElement.classList.contains('dark')
  if (level === 0) return 'hsl(var(--muted))'
  if (isDark) return `hsl(142, ${40 + level * 5}%, ${20 + level * 5}%)`
  return `hsl(142, ${35 + level * 5}%, ${70 - level * 6}%)`
}
</script>

<template>
  <Card>
    <div style="padding: var(--card-padding)">
      <div class="flex items-center justify-between" style="margin-bottom: var(--space-3)">
        <h3 class="font-h2 text-primary-content">活跃度</h3>
        <span class="font-caption text-secondary-content">最近 90 天</span>
      </div>
      <!-- Heatmap content — identical template from OverviewTab.vue -->
      <div class="overflow-x-auto pb-2 -mb-2" style="direction: rtl;">
        <div class="flex" style="gap: 4px; min-width: min-content; direction: ltr;">
          <div class="flex flex-col" style="gap: 4px; margin-right: 6px;">
            <div v-for="(label, i) in dayLabels" :key="i"
              class="font-caption text-secondary-content"
              style="width: 16px; height: 18px; font-size: 9px; line-height: 18px; text-align: right;">
              {{ label }}
            </div>
          </div>
          <div v-for="(week, wi) in calendarData.weeks" :key="wi" class="flex flex-col" style="gap: 4px;">
            <div v-for="(day, di) in week" :key="di"
              class="heatmap-cell rounded-sm cursor-default"
              :style="{ backgroundColor: heatmapColor(day.level) }"/>
          </div>
        </div>
      </div>
    </div>
  </Card>
</template>

<style scoped>
.heatmap-cell { width: 18px; height: 18px; border-radius: 3px; transition: transform 0.2s ease, box-shadow 0.2s ease; }
.heatmap-cell:hover { transform: scale(1.4); box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2); z-index: 10; }
</style>
```

- [ ] Create `src/components/PlatformDistribution.vue`

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { Card } from '@/components/ui/card'
import type { StoreRecord, AdultAvId } from '@/types'
import { PLATFORM_LABELS, PLATFORM_HUES, usePlatformColor } from '@/composables/usePlatformMeta'

const props = defineProps<{
  records: StoreRecord[]
  adultAvItems: AdultAvId[]
}>()

const typeLabels: Record<string, string> = { movie: '电影', tv: '剧集', music: '音乐', book: '书籍' }

const platformStats = computed(() => {
  const map: Record<string, { count: number; typeCounts: Record<string, number> }> = {}
  for (const r of props.records) {
    const key = r.provider as string
    if (!map[key]) map[key] = { count: 0, typeCounts: {} }
    map[key].count++
    map[key].typeCounts[r.type] = (map[key].typeCounts[r.type] || 0) + 1
  }
  for (const item of props.adultAvItems) {
    const key = item.source
    if (!map[key]) map[key] = { count: 0, typeCounts: {} }
    map[key].count++
    map[key].typeCounts['成人视频'] = (map[key].typeCounts['成人视频'] || 0) + 1
  }
  return Object.entries(map).map(([provider, info]) => ({
    provider,
    count: info.count,
    types: Object.entries(info.typeCounts).map(([t, c]) => ({ label: typeLabels[t] || t, count: c })).sort((a, b) => b.count - a.count),
  })).sort((a, b) => b.count - a.count)
})

const maxCount = computed(() => Math.max(1, ...platformStats.value.map(p => p.count)))
const stats = computed(() => {
  let m = 0, t = 0, mu = 0
  for (const r of props.records) {
    if (r.type === 'movie') m++; else if (r.type === 'tv') t++; else if (r.type === 'music') mu++
  }
  return { total: props.records.length + props.adultAvItems.length, movie: m, tv: t, music: mu }
})
</script>

<template>
  <div class="grid grid-cols-1 sm:grid-cols-2" style="gap: var(--space-3)">
    <div v-for="info in platformStats" :key="info.provider"
      class="rounded-xl border border-border bg-card transition-all hover:shadow-md hover:border-primary/30"
      style="padding: var(--card-padding)">
      <div class="flex items-center justify-between" style="margin-bottom: var(--space-3)">
        <div class="flex items-center" style="gap: var(--space-3)">
          <div class="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold text-white shrink-0"
            :style="{ backgroundColor: usePlatformColor(PLATFORM_HUES[info.provider] || 0).icon }">
            {{ (PLATFORM_LABELS[info.provider] || info.provider).charAt(0) }}
          </div>
          <div>
            <div class="font-body font-semibold text-primary-content">{{ PLATFORM_LABELS[info.provider] || info.provider }}</div>
            <div class="font-caption text-secondary-content tabular-nums">{{ info.count.toLocaleString() }} 条记录</div>
          </div>
        </div>
        <div class="w-20 rounded-full bg-muted overflow-hidden" style="height: 6px;">
          <div class="h-full rounded-full transition-all duration-700"
            :style="{ width: `${(info.count / stats.total) * 100}%`, backgroundColor: usePlatformColor(PLATFORM_HUES[info.provider] || 0).bar }" />
        </div>
      </div>
      <div class="flex flex-wrap" style="gap: var(--space-2)">
        <span v-for="t in info.types" :key="t.label"
          class="inline-flex items-center gap-1 rounded-full border font-caption"
          :style="{
            padding: 'var(--space-1) var(--space-3)', borderColor: usePlatformColor(PLATFORM_HUES[info.provider] || 0).chipBorder,
            color: usePlatformColor(PLATFORM_HUES[info.provider] || 0).chipText, backgroundColor: usePlatformColor(PLATFORM_HUES[info.provider] || 0).chipBg,
          }">
          <span class="font-medium">{{ t.label }}</span> <span class="opacity-70">{{ t.count }}</span>
        </span>
      </div>
    </div>
  </div>
</template>
```

(WeeklyStats component follows the same pattern — extracting the weekly detail template from OverviewTab.vue.)

- [ ] Run type-check

```bash
npm run type-check
```

---

### Task 7: Refactor OverviewTab to Use Composables, Stores, and Extracted Components

**Covers:** [S5, S6]

**Files:**
- Modify: `src/entrypoints/options/tabs/OverviewTab.vue`

- [ ] Replace inline logic with composables and components

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAppStore } from '@/stores/app'
import { useStats } from '@/composables/useStats'
import { useRecordLoader } from '@/composables/useRecordLoader'
import { PLATFORM_LABELS, PLATFORM_HUES, usePlatformColor } from '@/composables/usePlatformMeta'
import StatCard from '@/components/StatCard.vue'
import HeatmapCalendar from '@/components/HeatmapCalendar.vue'
import PlatformDistribution from '@/components/PlatformDistribution.vue'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { RefreshCw, AlertCircle, Film, Tv, Music, ShieldAlert, Database } from 'lucide-vue-next'

const appStore = useAppStore()
const loader = useRecordLoader()
const { stats } = useStats(appStore.records, appStore.adultAvItems)

const activeTab = ref<'overview' | 'weekly' | 'platform'>('overview')

const statIcons = [Film, Tv, Music, ShieldAlert]
const statLabels = ['电影', '剧集', '音乐', '成人视频']
const statKeys = ['movie', 'tv', 'music', 'jav'] as const

onMounted(async () => { await loader.load() })
</script>

<template>
  <!-- simplified template using extracted components -->
</template>
```

(The template is the same structure but uses `<StatCard>` and `<HeatmapCalendar>` instead of inline code.)

- [ ] Run type-check

```bash
npm run type-check
```

---

### Task 8: Refactor Popup App.vue & DashboardPage to Use Pinia Stores

**Covers:** [S4]

**Files:**
- Modify: `src/entrypoints/popup/App.vue`
- Modify: `src/entrypoints/popup/pages/DashboardPage.vue`

- [ ] Simplify Popup App.vue — remove inline theme logic, use useThemeStore

```vue
<script setup lang="ts">
import { RouterView } from 'vue-router'
import { useThemeStore } from '@/stores/theme'

useThemeStore()
</script>

<template>
  <RouterView />
</template>
```

- [ ] Simplify DashboardPage.vue — use useAppStore + useStats

```vue
<script setup lang="ts">
import { useThemeStore } from '@/stores/theme'
import { useAppStore } from '@/stores/app'
import { useStats } from '@/composables/useStats'
import StatCard from '@/components/StatCard.vue'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Settings, Film, Tv, Music, ShieldAlert, ArrowUpRight } from 'lucide-vue-next'

useThemeStore()
const appStore = useAppStore()
const { stats } = useStats(appStore.records, appStore.adultAvItems)

function openOptionsPage() {
  window.open(chrome.runtime.getURL('options.html'), '_blank')
}

onMounted(() => appStore.loadData())
</script>
```

(Keep template identical — no visual changes.)

- [ ] Run type-check

```bash
npm run type-check
```

---

### Task 9: Refactor ConfirmDialog to Use Pinia Store

**Covers:** [S4]

**Files:**
- Modify: `src/components/ConfirmDialog.vue`
- Remove: `src/entrypoints/popup/useConfirmDialog.ts`

- [ ] Update `ConfirmDialog.vue` to use `useConfirmStore` instead of inject/provide

The component reads `confirmStore.state` and calls `confirmStore.confirm()`.
Remove the old `useConfirmDialog.ts`.

- [ ] Run type-check

```bash
npm run type-check
```

---

### Task 10: Replace Hand-Rolled Browser APIs with @vueuse/core

**Covers:** [S5.4]

**Files:**
- Modify: `src/composables/useTheme.ts` → already replaced by Task 2 (useThemeStore)
- Modify: `src/entrypoints/content.ts` — replace `window.matchMedia` with `useMediaQuery`
- Modify: `src/entrypoints/content/router.ts` — replace `history.pushState` override with `useEventListener`

**Specific replacements:**

| Location | Before | After |
|----------|--------|-------|
| `useTheme` (legacy) | `window.matchMedia(…)` + `addEventListener` | `useMediaQuery` |
| `content.ts` theme listener | `matchMedia.addEventListener` | `useMediaQuery` |
| `toast.ts` | N/A | keep as-is (not browser API) |

- [ ] Run type-check

```bash
npm run type-check
```

---

### Task 11: Split content/handlers/douban.ts by Responsibility

**Covers:** [S7]

**Files:**
- Create: `src/entrypoints/content/handlers/douban-scanner.ts`
- Create: `src/entrypoints/content/handlers/douban-sync.ts`
- Create: `src/entrypoints/content/handlers/douban-neodb.ts`
- Create: `src/entrypoints/content/handlers/douban-toast.ts`
- Modify: `src/entrypoints/content/handlers/douban.ts`

**Extraction mapping (zero code changes, only file boundaries):**

| Function | New File |
|----------|----------|
| `scanDoubanPageStatus()` | `douban-scanner.ts` |
| `extractCommentFromPage()` | `douban-scanner.ts` |
| `extractCrossPlatformLinks()` | `douban-scanner.ts` |
| `syncToLocalStorage()` | `douban-sync.ts` |
| `getLocalRecord()` | `douban-sync.ts` |
| `cleanupNotificationCache` | `douban-sync.ts` |
| `injectNeoDBPushButtons()` | `douban-neodb.ts` |
| `bindNeoDBPushEvents()` | `douban-neodb.ts` |
| `pushToNeoDB()` | `douban-neodb.ts` |
| `performNeoDBPush()` | `douban-neodb.ts` |
| `showPageToast()` | `douban-toast.ts` |
| `showNotification()` | `douban-toast.ts` |
| `handleDoubanDetailPage()` | stays in `douban.ts` (entry point, imports everything) |

- [ ] Extract and verify: `douban.ts` entry point re-exports `handleDoubanDetailPage`, imports from the new files

- [ ] Run type-check and build

```bash
npm run type-check && npm run build
```

Expected: Zero errors, identical build output.

---

### Task 12: Split content.ts Rating Observer

**Covers:** [S7]

**Files:**
- Create: `src/entrypoints/content/observers/rating.ts`
- Modify: `src/entrypoints/content.ts`

- [ ] Extract `startRatingObserver()`, `ratingObserver`, `lastKnownRating`, `ratingInputCleanup` into `observers/rating.ts`

```ts
// observers/rating.ts
export function startRatingObserver() { /* same code */ }
```

- [ ] In `content.ts`: replace inline function with `import { startRatingObserver } from './observers/rating'`

- [ ] Run type-check

```bash
npm run type-check
```

---

### Task 13: Remove Dead @crxjs/vite-plugin

**Covers:** [S3]

**Files:**
- Modify: `package.json`

- [ ] Remove `"@crxjs/vite-plugin"` from devDependencies

- [ ] Run build to confirm no breakage

```bash
npm install && npm run build
```

---

### Task 14: Final Verification

**Covers:** All

- [ ] Run full CI chain

```bash
npm run type-check && npm run build
```

Expected: Both pass with zero errors.

- [ ] Run tests

```bash
npm test
```

Expected: All existing Playwright tests pass. (No new tests required — this is pure refactoring with zero behavior changes.)