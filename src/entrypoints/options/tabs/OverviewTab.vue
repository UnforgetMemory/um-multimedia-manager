<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { RefreshCw, AlertCircle, Film, Tv, Music, ShieldAlert, Database } from 'lucide-vue-next'
import { safeSendMessage } from '@/utils/context'

interface DisplayRecord {
  type: string
  provider: string
  providerId: string
  rating: number
  status: number
  updatedAt: string
}

const loading = ref(false)
const loadError = ref<string | null>(null)
const records = ref<DisplayRecord[]>([])
const adultAvItems = ref<any[]>([])
const dataReady = ref(false)

const stats = computed(() => {
  let movie = 0, tv = 0, music = 0
  for (const r of records.value) {
    if (r.type === 'movie') movie++
    else if (r.type === 'tv') tv++
    else if (r.type === 'music') music++
  }
  return { total: records.value.length + adultAvItems.value.length, movie, tv, music, jav: adultAvItems.value.length }
})

const platformStats = computed(() => {
  const map: Record<string, { count: number; typeCounts: Record<string, number> }> = {}
  for (const r of records.value) {
    const key = r.provider
    if (!map[key]) map[key] = { count: 0, typeCounts: {} }
    map[key].count++
    map[key].typeCounts[r.type] = (map[key].typeCounts[r.type] || 0) + 1
  }
  for (const item of adultAvItems.value) {
    const key = item.source
    if (!map[key]) map[key] = { count: 0, typeCounts: {} }
    map[key].count++
    map[key].typeCounts['成人视频'] = (map[key].typeCounts['成人视频'] || 0) + 1
  }
  return Object.entries(map)
    .map(([provider, info]) => ({
      provider,
      count: info.count,
      types: Object.entries(info.typeCounts)
        .map(([type, count]) => ({ label: typeLabels[type] || type, count }))
        .sort((a, b) => b.count - a.count),
    }))
    .sort((a, b) => b.count - a.count)
})

const typeLabels: Record<string, string> = { movie: '电影', tv: '剧集', music: '音乐', book: '书籍' }
const platformLabels: Record<string, string> = { douban: '豆瓣', imdb: 'IMDb', neodb: 'NeoDB', tmdb: 'TMDB', javdb: 'JavDB', sehuatang: '色花堂' }

const platformHues: Record<string, number> = { douban: 142, imdb: 45, neodb: 217, tmdb: 271, javdb: 0, sehuatang: 25 }

const maxCount = computed(() => {
  if (platformStats.value.length === 0) return 1
  return Math.max(...platformStats.value.map(p => p.count))
})

// Calendar heatmap data — last 90 days
const calendarData = computed(() => {
  const now = new Date()
  const dayMs = 86400000
  const days = 90
  const map: Record<string, number> = {}

  for (const r of records.value) {
    if (!r.updatedAt) continue
    const d = new Date(r.updatedAt)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    map[key] = (map[key] || 0) + 1
  }
  for (const item of adultAvItems.value) {
    if (!item.updatedAt) continue
    const d = new Date(item.updatedAt)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    map[key] = (map[key] || 0) + 1
  }

  const maxDaily = Math.max(1, ...Object.values(map))
  const weeks: { date: Date; count: number; level: number }[][] = []
  let currentWeek: { date: Date; count: number; level: number }[] = []

  // Start from the oldest Sunday
  const startDate = new Date(now.getTime() - (days - 1) * dayMs)
  const startDay = startDate.getDay()
  startDate.setDate(startDate.getDate() - startDay)

  for (let i = 0; i < days + startDay; i++) {
    const d = new Date(startDate.getTime() + i * dayMs)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const count = map[key] || 0
    const level = count === 0 ? 0 : Math.min(8, Math.ceil((count / maxDaily) * 8))
    currentWeek.push({ date: d, count, level })
    if (currentWeek.length === 7) {
      weeks.push(currentWeek)
      currentWeek = []
    }
  }
  if (currentWeek.length > 0) weeks.push(currentWeek)

  // Month labels
  const monthLabels: { week: number; label: string }[] = []
  let lastMonth = -1
  weeks.forEach((week, i) => {
    const month = week[0].date.getMonth()
    if (month !== lastMonth) {
      monthLabels.push({ week: i, label: week[0].date.toLocaleDateString('zh-CN', { month: 'short' }) })
      lastMonth = month
    }
  })

  return { weeks, monthLabels, maxDaily }
})

const dayLabels = ['', '一', '', '三', '', '五', '']

function heatmapColor(level: number): string {
  const isDark = document.documentElement.classList.contains('dark')
  if (level === 0) return 'hsl(var(--muted))'
  if (isDark) {
    return `hsl(142, ${40 + level * 5}%, ${20 + level * 5}%)`
  }
  return `hsl(142, ${35 + level * 5}%, ${70 - level * 6}%)`
}

function barColor(count: number, maxCount: number): string {
  const isDark = document.documentElement.classList.contains('dark')
  if (count === 0) return 'hsl(var(--muted))'
  const ratio = count / maxCount
  const level = Math.min(5, Math.ceil(ratio * 5))
  if (isDark) {
    return `hsl(210, ${30 + level * 8}%, ${25 + level * 6}%)`
  }
  return `hsl(210, ${35 + level * 7}%, ${75 - level * 8}%)`
}

const weekdayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

const weeklyStats = computed(() => {
  const now = new Date()
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const dayMs = 86400000
  const days: { date: string; dateStr: string; weekday: string; total: number; items: { source: string; label: string; count: number }[]; isToday: boolean }[] = []
  let weekTotal = 0

  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * dayMs)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const dateStr = `${d.getMonth() + 1}/${d.getDate()}`
    const isToday = key === todayKey

    const sourceCounts: Record<string, number> = {}
    for (const r of records.value) {
      if (!r.updatedAt) continue
      const rd = new Date(r.updatedAt)
      const rKey = `${rd.getFullYear()}-${String(rd.getMonth() + 1).padStart(2, '0')}-${String(rd.getDate()).padStart(2, '0')}`
      if (rKey === key) sourceCounts[r.provider] = (sourceCounts[r.provider] || 0) + 1
    }
    for (const item of adultAvItems.value) {
      if (!item.updatedAt) continue
      const rd = new Date(item.updatedAt)
      const rKey = `${rd.getFullYear()}-${String(rd.getMonth() + 1).padStart(2, '0')}-${String(rd.getDate()).padStart(2, '0')}`
      if (rKey === key) sourceCounts[item.source] = (sourceCounts[item.source] || 0) + 1
    }

    const total = Object.values(sourceCounts).reduce((a, b) => a + b, 0)
    weekTotal += total

    const items = Object.entries(sourceCounts)
      .map(([source, count]) => ({ source, label: platformLabels[source] || source, count }))
      .sort((a, b) => b.count - a.count)

    days.push({ date: key, dateStr, weekday: weekdayNames[d.getDay()], total, items, isToday })
  }

  const maxDaily = Math.max(1, ...days.map(d => d.total))
  const avgDaily = Math.round(weekTotal / 7)
  const peakDay = days.reduce((max, d) => d.total > max.total ? d : max, days[0]).weekday

  return { days, total: weekTotal, maxDaily, avgDaily, peakDay }
})

// Tooltip positioning
const tooltipData = ref<{ show: boolean; x: number; y: number; text: string }>({ show: false, x: 0, y: 0, text: '' })

function showTooltip(e: MouseEvent, day: { date: Date; count: number }) {
  const rect = (e.target as HTMLElement).getBoundingClientRect()
  tooltipData.value = {
    show: true,
    x: rect.left + rect.width / 2,
    y: rect.top - 8,
    text: `${day.date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}: ${day.count} 条`,
  }
}

function hideTooltip() {
  tooltipData.value.show = false
}

const statIcons = [Film, Tv, Music, ShieldAlert]
const statLabels = ['电影', '剧集', '音乐', '成人视频']
const statKeys = ['movie', 'tv', 'music', 'jav'] as const

function platformColor(hue: number, variant: 'bar' | 'chip-bg' | 'chip-text' | 'chip-border' | 'icon'): string {
  const isDark = document.documentElement.classList.contains('dark')
  switch (variant) {
    case 'bar': return `hsl(${hue}, 55%, ${isDark ? '50%' : '45%'})`
    case 'icon': return `hsl(${hue}, 55%, ${isDark ? '45%' : '40%'})`
    case 'chip-bg': return isDark ? `hsl(${hue}, 30%, 15%)` : `hsl(${hue}, 40%, 95%)`
    case 'chip-text': return isDark ? `hsl(${hue}, 50%, 75%)` : `hsl(${hue}, 45%, 35%)`
    case 'chip-border': return isDark ? `hsl(${hue}, 25%, 25%)` : `hsl(${hue}, 35%, 80%)`
  }
}

async function loadData() {
  if (loading.value) return
  loading.value = true
  loadError.value = null
  try {
    const [recordsRes, adultAvRes] = await Promise.all([
      safeSendMessage({ type: 'GET_ALL_RECORDS' }, { timeout: 10000, retries: 2 }),
      safeSendMessage({ type: 'ADULT_AV_GET_ALL' }, { timeout: 8000, retries: 1 }),
    ])
    if (!recordsRes?.success) throw new Error(recordsRes?.error || '获取数据失败')
    records.value = recordsRes.records
    if (adultAvRes?.success) adultAvItems.value = adultAvRes.items || []
    dataReady.value = true
  } catch {
    records.value = []
    loadError.value = '数据加载失败，请重试'
  } finally {
    loading.value = false
  }
}

onMounted(loadData)

const activeOverviewTab = ref<'overview' | 'weekly' | 'platform'>('overview')
</script>

<template>
  <div :style="{ display: 'flex', flexDirection: 'column', gap: 'var(--section-gap)' }">
    <!-- Header -->
    <div class="flex items-center justify-end">
      <Button variant="ghost" size="sm" @click="loadData" :disabled="loading">
        <RefreshCw :class="['h-4 w-4', loading && 'animate-spin']" />
      </Button>
    </div>

    <!-- Skeleton -->
    <div v-if="!dataReady && !loadError" class="space-y-6">
      <div class="grid grid-cols-2 lg:grid-cols-4" :style="{ gap: 'var(--space-3)' }">
        <div v-for="i in 4" :key="i" class="h-28 bg-muted rounded-xl animate-pulse"></div>
      </div>
      <div class="h-48 bg-muted rounded-xl animate-pulse"></div>
    </div>

    <!-- Error -->
    <div v-else-if="loadError" class="py-12 text-center">
      <Alert variant="destructive" class="mb-4">
        <AlertCircle class="h-4 w-4" />
        <AlertTitle>加载失败</AlertTitle>
        <AlertDescription>{{ loadError }}</AlertDescription>
      </Alert>
      <Button @click="loadData" variant="outline">
        <RefreshCw class="mr-2 h-4 w-4" />重试
      </Button>
    </div>

    <!-- Content -->
    <template v-else>
      <!-- Sub-tabs -->
      <div class="flex p-1 bg-muted rounded-xl" :style="{ gap: 'var(--space-1)' }">
        <button
          v-for="tab in [{ id: 'overview' as const, label: '总览' }, { id: 'weekly' as const, label: '最近一周' }, { id: 'platform' as const, label: '平台分布' }]"
          :key="tab.id"
          @click="activeOverviewTab = tab.id"
          :class="[
            'flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200',
            activeOverviewTab === tab.id
              ? 'bg-background text-primary-content shadow-sm'
              : 'text-secondary-content hover:text-primary-content hover:bg-background/50'
          ]"
        >
          {{ tab.label }}
        </button>
      </div>

      <!-- Tab: Overview (Stats + Heatmap) -->
      <div v-if="activeOverviewTab === 'overview'" :style="{ display: 'flex', flexDirection: 'column', gap: 'var(--section-gap)' }">
        <!-- Stats Grid -->
        <div class="grid grid-cols-2 lg:grid-cols-4" :style="{ gap: 'var(--space-3)' }">
        <Card v-for="(key, i) in statKeys" :key="key" class="text-center" :style="{ padding: 'var(--card-padding)', minWidth: 0 }">
          <component :is="statIcons[i]" class="mx-auto mb-2 text-secondary-content" :style="{ width: 'calc(1.25rem * var(--font-scale, 1))', height: 'calc(1.25rem * var(--font-scale, 1))' }" />
          <div class="font-bold tracking-tight text-primary-content tabular-nums whitespace-nowrap" :style="{ fontSize: 'calc(1.75rem * var(--font-scale, 1))' }">
            {{ stats[key].toLocaleString() }}
          </div>
          <div class="font-caption text-secondary-content" :style="{ marginTop: 'var(--space-1)' }">{{ statLabels[i] }}</div>
        </Card>
      </div>

      <!-- Total -->
      <Card>
        <div class="flex items-center justify-between" :style="{ padding: 'var(--card-padding)' }">
          <div class="flex items-center gap-2">
            <Database class="w-4 h-4 text-secondary-content" />
            <span class="font-body font-medium text-secondary-content">总记录</span>
          </div>
          <span class="font-bold tracking-tight text-primary-content tabular-nums whitespace-nowrap" :style="{ fontSize: 'calc(1.75rem * var(--font-scale, 1))' }">
            {{ stats.total.toLocaleString() }}
          </span>
        </div>
      </Card>

      <!-- Calendar Heatmap -->
      <Card>
        <div :style="{ padding: 'var(--card-padding)' }">
          <div class="flex items-center justify-between" :style="{ marginBottom: 'var(--space-3)' }">
            <h3 class="font-h2 text-primary-content">活跃度</h3>
            <span class="font-caption text-secondary-content">最近 90 天</span>
          </div>
          <!-- Heatmap grid — rtl so scrollbar starts from right (latest data) -->
          <div class="overflow-x-auto pb-2 -mb-2" style="direction: rtl;">
            <div class="flex" :style="{ gap: '4px', minWidth: 'min-content', direction: 'ltr' }">
              <!-- Day labels -->
              <div class="flex flex-col" :style="{ gap: '4px', marginRight: '6px' }">
                <div v-for="(label, i) in dayLabels" :key="i"
                  class="font-caption text-secondary-content"
                  :style="{ width: '16px', height: '18px', fontSize: '9px', lineHeight: '18px', textAlign: 'right' }">
                  {{ label }}
                </div>
              </div>
              <!-- Weeks -->
              <div v-for="(week, wi) in calendarData.weeks" :key="wi" class="flex flex-col" :style="{ gap: '4px' }">
                <div v-for="(day, di) in week" :key="di"
                  class="heatmap-cell rounded-sm cursor-default"
                  :style="{ backgroundColor: heatmapColor(day.level) }"
                  @mouseenter="(e: MouseEvent) => showTooltip(e, day)"
                  @mouseleave="hideTooltip"
                />
              </div>
            </div>
          </div>
          <!-- Legend -->
          <div class="flex items-center justify-end" :style="{ gap: 'var(--space-1)', marginTop: 'var(--space-3)' }">
            <span class="font-caption text-secondary-content" :style="{ fontSize: '10px' }">少</span>
            <div v-for="i in 9" :key="i" class="rounded-sm"
              :style="{ width: '12px', height: '12px', backgroundColor: heatmapColor(i - 1) }"
            />
            <span class="font-caption text-secondary-content" :style="{ fontSize: '10px' }">多</span>
          </div>
        </div>
      </Card>
      </div><!-- end overview tab -->

      <!-- Tab: Weekly Detail -->
      <div v-if="activeOverviewTab === 'weekly'" :style="{ display: 'flex', flexDirection: 'column', gap: 'var(--section-gap)' }">
      <!-- Weekly Summary Stats -->
      <div class="grid grid-cols-3" :style="{ gap: 'var(--space-3)' }">
        <Card class="text-center" :style="{ padding: 'var(--card-padding)' }">
          <div class="font-bold tabular-nums text-primary-content" :style="{ fontSize: 'calc(1.5rem * var(--font-scale, 1))' }">
            {{ weeklyStats.total }}
          </div>
          <div class="font-caption text-secondary-content" :style="{ marginTop: 'var(--space-1)' }">本周总计</div>
        </Card>
        <Card class="text-center" :style="{ padding: 'var(--card-padding)' }">
          <div class="font-bold tabular-nums text-primary-content" :style="{ fontSize: 'calc(1.5rem * var(--font-scale, 1))' }">
            {{ weeklyStats.avgDaily }}
          </div>
          <div class="font-caption text-secondary-content" :style="{ marginTop: 'var(--space-1)' }">日均</div>
        </Card>
        <Card class="text-center" :style="{ padding: 'var(--card-padding)' }">
          <div class="font-bold tabular-nums text-primary-content" :style="{ fontSize: 'calc(1.5rem * var(--font-scale, 1))' }">
            {{ weeklyStats.peakDay }}
          </div>
          <div class="font-caption text-secondary-content" :style="{ marginTop: 'var(--space-1)' }">峰值日</div>
        </Card>
      </div>

      <!-- Daily Bar Chart -->
      <Card>
        <div :style="{ padding: 'var(--card-padding)' }">
          <h3 class="font-h2 text-primary-content" :style="{ marginBottom: 'var(--space-3)' }">每日记录</h3>
          <div class="flex items-end" :style="{ gap: 'var(--space-2)', height: '8rem' }">
            <div v-for="day in weeklyStats.days" :key="day.date"
              class="flex-1 flex flex-col items-center" :style="{ gap: 'var(--space-1)' }">
              <!-- Bar — log scale for maximum differentiation of small values -->
              <div class="w-full rounded-t-lg transition-all duration-300 relative group cursor-default"
                :style="{
                  height: `${Math.max(10, (Math.log(day.total + 1) / Math.log(weeklyStats.maxDaily + 1)) * 100)}%`,
                  backgroundColor: day.isToday ? 'hsl(var(--primary))' : barColor(day.total, weeklyStats.maxDaily),
                  minHeight: '10px',
                  opacity: day.total === 0 ? 0.3 : 1,
                }">
                <div class="absolute -top-6 left-1/2 -translate-x-1/2 text-xs-scaled font-bold text-primary-content opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                  {{ day.total }}
                </div>
              </div>
              <!-- Label -->
              <div class="text-center">
                <div class="font-caption text-secondary-content" :style="{ fontSize: '10px' }">{{ day.weekday }}</div>
                <div class="font-caption" :style="{ fontSize: '9px', color: day.isToday ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))' }">{{ day.dateStr }}</div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <!-- Daily Detail List -->
      <Card>
        <div :style="{ padding: 'var(--card-padding)' }">
          <h3 class="font-h2 text-primary-content" :style="{ marginBottom: 'var(--space-4)' }">每日详情</h3>
          <div :style="{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }">
            <div v-for="day in weeklyStats.days" :key="day.date"
              class="rounded-xl border transition-all"
              :class="day.isToday ? 'border-primary/30 bg-primary/[0.03] shadow-sm' : 'border-border hover:border-muted hover:shadow-sm'"
              :style="{ padding: 'var(--card-padding)' }">
              <!-- Day header row -->
              <div class="flex items-center justify-between" :style="{ marginBottom: 'var(--space-3)' }">
                <div class="flex items-center" :style="{ gap: 'var(--space-3)' }">
                  <!-- Day badge -->
                  <div class="w-10 h-10 rounded-xl flex flex-col items-center justify-center"
                    :style="{
                      backgroundColor: day.isToday ? 'hsl(var(--primary))' : 'hsl(var(--muted))',
                      color: day.isToday ? 'hsl(var(--primary-foreground))' : 'hsl(var(--muted-foreground))',
                    }">
                    <span class="font-bold leading-none" :style="{ fontSize: 'calc(0.9rem * var(--font-scale, 1))' }">{{ day.weekday.charAt(1) }}</span>
                    <span class="leading-none" :style="{ fontSize: 'calc(0.55rem * var(--font-scale, 1))', opacity: 0.7 }">{{ day.dateStr }}</span>
                  </div>
                  <div>
                    <div class="font-body font-semibold text-primary-content">{{ day.weekday }}</div>
                    <div class="font-caption text-secondary-content">{{ day.dateStr }}</div>
                  </div>
                </div>
                <div class="flex items-center" :style="{ gap: 'var(--space-2)' }">
                  <span v-if="day.isToday" class="text-xs-scaled font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">今天</span>
                  <div class="font-bold tabular-nums text-primary-content" :style="{ fontSize: 'calc(1.125rem * var(--font-scale, 1))' }">
                    {{ day.total }}
                  </div>
                </div>
              </div>

              <!-- Source breakdown with mini progress bars -->
              <div v-if="day.items.length > 0" :style="{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }">
                <div v-for="(item, i) in day.items" :key="i" class="flex items-center" :style="{ gap: 'var(--space-2)' }">
                  <span class="font-body text-secondary-content shrink-0" :style="{ width: '48px', fontSize: 'calc(0.75rem * var(--font-scale, 1))' }">{{ item.label }}</span>
                  <div class="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <div class="h-full rounded-full transition-all duration-500"
                      :style="{
                        width: `${(item.count / day.total) * 100}%`,
                        backgroundColor: platformColor(platformHues[item.source] || 0, 'bar'),
                      }" />
                  </div>
                  <span class="font-body font-medium tabular-nums text-primary-content shrink-0" :style="{ width: '32px', textAlign: 'right', fontSize: 'calc(0.75rem * var(--font-scale, 1))' }">{{ item.count }}</span>
                </div>
              </div>
              <div v-else class="py-2 text-center font-caption text-secondary-content" :style="{ fontSize: '11px' }">无记录</div>
            </div>
          </div>
        </div>
      </Card>
      </div><!-- end weekly tab -->

      <!-- Tab: Platform Distribution -->
      <div v-if="activeOverviewTab === 'platform'" :style="{ display: 'flex', flexDirection: 'column', gap: 'var(--section-gap)' }">
      <!-- Platform Distribution -->
      <div>
        <h3 class="font-h2 text-primary-content" :style="{ marginBottom: 'var(--space-3)' }">平台分布</h3>

        <!-- Summary bar chart -->
        <Card :style="{ marginBottom: 'var(--space-4)' }">
          <div :style="{ padding: 'var(--card-padding)' }">
            <div class="flex items-end" :style="{ gap: 'var(--space-1)', height: '5rem' }">
              <div
                v-for="info in platformStats"
                :key="info.provider"
                class="flex-1 rounded-t-md transition-all duration-500 relative group cursor-default"
                :style="{
                  height: `${Math.max(8, (info.count / maxCount) * 100)}%`,
                  backgroundColor: platformColor(platformHues[info.provider] || 0, 'bar'),
                }"
              >
                <div class="absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-bold text-primary-content opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                  {{ info.count.toLocaleString() }}
                </div>
              </div>
            </div>
            <div class="flex items-end" :style="{ gap: 'var(--space-1)', marginTop: 'var(--space-1)' }">
              <div
                v-for="info in platformStats"
                :key="info.provider + '-label'"
                class="flex-1 text-center font-caption text-secondary-content truncate"
              >
                {{ platformLabels[info.provider] || info.provider }}
              </div>
            </div>
          </div>
        </Card>

        <!-- Detailed cards -->
        <div class="grid grid-cols-1 sm:grid-cols-2" :style="{ gap: 'var(--space-3)' }">
          <div
            v-for="info in platformStats"
            :key="info.provider"
            class="rounded-xl border border-border bg-card transition-all hover:shadow-md hover:border-primary/30"
            :style="{ padding: 'var(--card-padding)' }"
          >
            <div class="flex items-center justify-between" :style="{ marginBottom: 'var(--space-3)' }">
              <div class="flex items-center" :style="{ gap: 'var(--space-3)' }">
                <div
                  class="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold text-white shrink-0"
                  :style="{ backgroundColor: platformColor(platformHues[info.provider] || 0, 'icon') }"
                >
                  {{ (platformLabels[info.provider] || info.provider).charAt(0) }}
                </div>
                <div>
                  <div class="font-body font-semibold text-primary-content">{{ platformLabels[info.provider] || info.provider }}</div>
                  <div class="font-caption text-secondary-content">{{ info.count.toLocaleString() }} 条记录</div>
                </div>
              </div>
              <!-- Progress bar -->
              <div class="w-20 rounded-full bg-muted overflow-hidden" :style="{ height: '6px' }">
                <div
                  class="h-full rounded-full transition-all duration-700"
                  :style="{
                    width: `${(info.count / stats.total) * 100}%`,
                    backgroundColor: platformColor(platformHues[info.provider] || 0, 'bar'),
                  }"
                />
              </div>
            </div>
            <!-- Type breakdown chips -->
            <div class="flex flex-wrap" :style="{ gap: 'var(--space-2)' }">
              <span
                v-for="t in info.types"
                :key="t.label"
                class="inline-flex items-center gap-1 rounded-full border font-caption"
                :style="{
                  padding: 'var(--space-1) var(--space-3)',
                  borderColor: platformColor(platformHues[info.provider] || 0, 'chip-border'),
                  color: platformColor(platformHues[info.provider] || 0, 'chip-text'),
                  backgroundColor: platformColor(platformHues[info.provider] || 0, 'chip-bg'),
                }"
              >
                <span class="font-medium">{{ t.label }}</span>
                <span class="opacity-70">{{ t.count }}</span>
              </span>
            </div>
          </div>
        </div>

        <div v-if="platformStats.length === 0" class="py-8 text-center font-body text-secondary-content">
          暂无数据
        </div>
      </div>
      </div><!-- end platform tab -->
    </template>

    <!-- Fixed-position tooltip (renders outside all overflow contexts) -->
    <Teleport to="body">
      <div
        v-if="tooltipData.show"
        class="fixed z-[9999] px-2 py-1 rounded text-xs whitespace-nowrap pointer-events-none shadow-lg"
        :style="{
          left: tooltipData.x + 'px',
          top: tooltipData.y + 'px',
          transform: 'translate(-50%, -100%)',
          background: 'hsl(var(--popover))',
          color: 'hsl(var(--popover-foreground))',
          border: '1px solid hsl(var(--border))',
        }"
      >
        {{ tooltipData.text }}
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.heatmap-cell {
  width: 18px;
  height: 18px;
  border-radius: 3px;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.heatmap-cell:hover {
  transform: scale(1.4);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  z-index: 10;
}
</style>
