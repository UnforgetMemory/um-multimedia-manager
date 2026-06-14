<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAppStore } from '@/stores/app'
import { useStats } from '@/composables/useStats'
import { PLATFORM_LABELS, PLATFORM_HUES } from '@/composables/usePlatformMeta'
import StatCard from '@/components/StatCard.vue'
import HeatmapCalendar from '@/components/HeatmapCalendar.vue'
import PlatformDistribution from '@/components/PlatformDistribution.vue'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { RefreshCw, AlertCircle, Film, Tv, Music, ShieldAlert, Database } from 'lucide-vue-next'

const appStore = useAppStore()
const { stats } = useStats(
  () => appStore.records as any,
  () => appStore.adultAvItems as any,
)

const activeOverviewTab = ref<'overview' | 'weekly' | 'platform'>('overview')

const typeLabels: Record<string, string> = { movie: '电影', tv: '剧集', music: '音乐', book: '书籍' }

const platformStats = computed(() => {
  const map: Record<string, { count: number; typeCounts: Record<string, number> }> = {}
  for (const r of (appStore.records as any[])) {
    const key = r.provider as string
    if (!map[key]) map[key] = { count: 0, typeCounts: {} }
    map[key].count++
    map[key].typeCounts[r.type] = (map[key].typeCounts[r.type] || 0) + 1
  }
  for (const item of appStore.adultAvItems) {
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
        .map(([t, count]) => ({ label: typeLabels[t] || t, count }))
        .sort((a, b) => b.count - a.count),
    }))
    .sort((a, b) => b.count - a.count)
})

const maxCount = computed(() => Math.max(1, ...platformStats.value.map(p => p.count)))

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
    for (const r of (appStore.records as any[])) {
      if (!r.updatedAt) continue
      const rd = new Date(r.updatedAt)
      const rKey = `${rd.getFullYear()}-${String(rd.getMonth() + 1).padStart(2, '0')}-${String(rd.getDate()).padStart(2, '0')}`
      if (rKey === key) sourceCounts[r.provider] = (sourceCounts[r.provider] || 0) + 1
    }
    for (const item of appStore.adultAvItems) {
      if (!item.updatedAt) continue
      const rd = new Date(item.updatedAt)
      const rKey = `${rd.getFullYear()}-${String(rd.getMonth() + 1).padStart(2, '0')}-${String(rd.getDate()).padStart(2, '0')}`
      if (rKey === key) sourceCounts[item.source] = (sourceCounts[item.source] || 0) + 1
    }

    const total = Object.values(sourceCounts).reduce((a, b) => a + b, 0)
    weekTotal += total

    const items = Object.entries(sourceCounts)
      .map(([source, count]) => ({ source, label: PLATFORM_LABELS[source] || source, count }))
      .sort((a, b) => b.count - a.count)

    days.push({ date: key, dateStr, weekday: weekdayNames[d.getDay()], total, items, isToday })
  }

  const maxDaily = Math.max(1, ...days.map(d => d.total))
  const avgDaily = Math.round(weekTotal / 7)
  const peakDay = days.reduce((max, d) => d.total > max.total ? d : max, days[0]).weekday

  return { days, total: weekTotal, maxDaily, avgDaily, peakDay }
})

const statIcons = [Film, Tv, Music, ShieldAlert]
const statLabels = ['电影', '剧集', '音乐', '成人视频']
const statKeys = ['movie', 'tv', 'music', 'jav'] as const

const tooltipData = ref<{ show: boolean; x: number; y: number; text: string }>({ show: false, x: 0, y: 0, text: '' })

function platformColor(hue: number, variant: 'bar' | 'icon'): string {
  const isDark = document.documentElement.classList.contains('dark')
  switch (variant) {
    case 'bar': return `hsl(${hue}, 55%, ${isDark ? '50%' : '45%'})`
    case 'icon': return `hsl(${hue}, 55%, ${isDark ? '45%' : '40%'})`
  }
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

onMounted(async () => { await appStore.loadData() })
</script>

<template>
  <div :style="{ display: 'flex', flexDirection: 'column', gap: 'var(--section-gap)' }">
    <!-- Skeleton -->
    <div v-if="!appStore.dataReady && !appStore.error" class="space-y-6">
      <div class="grid grid-cols-2 lg:grid-cols-4" :style="{ gap: 'var(--space-3)' }">
        <div v-for="i in 4" :key="i" class="h-28 bg-muted rounded-xl animate-pulse"></div>
      </div>
      <div class="h-48 bg-muted rounded-xl animate-pulse"></div>
    </div>

    <!-- Error -->
    <div v-else-if="appStore.error" class="py-12 text-center">
      <Alert variant="destructive" class="mb-4">
        <AlertCircle class="h-4 w-4" />
        <AlertTitle>加载失败</AlertTitle>
        <AlertDescription>{{ appStore.error }}</AlertDescription>
      </Alert>
      <Button @click="appStore.loadData" variant="outline">
        <RefreshCw class="mr-2 h-4 w-4" />重试
      </Button>
    </div>

    <!-- Content -->
    <template v-else>
      <!-- Sub-tabs with refresh -->
      <div class="flex items-center" :style="{ gap: 'var(--space-2)' }">
        <div class="flex flex-1 p-1 bg-muted rounded-xl" :style="{ gap: 'var(--space-1)' }">
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
        <Button variant="ghost" size="sm" @click="appStore.loadData" :disabled="appStore.loading">
          <RefreshCw :class="['h-4 w-4', appStore.loading && 'animate-spin']" />
        </Button>
      </div>

      <!-- Tab: Overview (Stats + Heatmap) -->
      <div v-if="activeOverviewTab === 'overview'" :style="{ display: 'flex', flexDirection: 'column', gap: 'var(--section-gap)' }">
        <!-- Stats Grid -->
        <div class="grid grid-cols-2 lg:grid-cols-4" :style="{ gap: 'var(--space-3)' }">
          <StatCard v-for="(key, i) in statKeys" :key="key" :icon="statIcons[i]" :label="statLabels[i]" :value="stats[key]" :loading="!appStore.dataReady" />
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
        <HeatmapCalendar :records="appStore.records" :adultAvItems="appStore.adultAvItems" />
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
          <div class="flex" :style="{ gap: 'var(--space-2)', height: '8rem' }">
            <div v-for="day in weeklyStats.days" :key="day.date"
              class="flex-1 flex flex-col items-center" :style="{ gap: 'var(--space-1)', height: '100%' }">
              <!-- Bar — log scale, flex-1 wrapper provides definite height for percentage -->
              <div class="flex-1 w-full flex flex-col justify-end min-h-0">
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
                        backgroundColor: platformColor(PLATFORM_HUES[item.source] || 0, 'bar'),
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
                  backgroundColor: platformColor(PLATFORM_HUES[info.provider] || 0, 'bar'),
                }"
              >
                <div class="absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-bold text-primary-content opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap tabular-nums">
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
                {{ PLATFORM_LABELS[info.provider] || info.provider }}
              </div>
            </div>
          </div>
        </Card>

        <!-- Detailed cards -->
        <PlatformDistribution :platformStats="platformStats" />

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
