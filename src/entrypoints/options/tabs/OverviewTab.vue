<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '@/stores/app'
import { useStats, type RecordWithType } from '@/composables/useStats'
import { PLATFORM_HUES } from '@/composables/usePlatformMeta'


import HeatmapCalendar from '@/shared/HeatmapCalendar.vue'
import PlatformDistribution from '@/shared/PlatformDistribution.vue'
import { Card, CardHeader, CardContent } from '@/shared/ui/card'
import { Button } from '@/shared/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert'
import SegmentedControl from '@/shared/ui/segmented-control/SegmentedControl.vue'
import StatsGrid from '@/shared/ui/stats-grid/StatsGrid.vue'
import { AlertCircle, Database, RefreshCw, Film, Tv, Music, ShieldAlert } from 'lucide-vue-next'

const { t } = useI18n()
const appStore = useAppStore()
const { stats } = useStats(
  () => (appStore.records as RecordWithType[]),
  () => appStore.adultAvItems,
)

const activeOverviewTab = ref<'overview' | 'weekly' | 'platform'>('overview')

const overviewTabs = computed(() => [
  { id: 'overview' as const, label: t('tab.overview') as string },
  { id: 'weekly' as const, label: t('tab.weekly') as string },
  { id: 'platform' as const, label: t('tab.platform') as string },
])

interface PlatformStat {
  provider: string
  count: number
  types: { label: string; count: number }[]
}

const platformStats = computed<PlatformStat[]>(() => {
  const data = appStore.records as RecordWithType[]
  const map: Record<string, PlatformStat> = {}
  for (const r of data || []) {
    const provider: string = r.provider || r.storeName?.replace('_records', '') || 'unknown'
    if (!map[provider]) map[provider] = { provider, count: 0, types: [] }
    map[provider].count++
    const type: string = r.type || (r.url?.includes('music') ? 'music' : 'movie')
    const existing = map[provider].types.find(t => t.label === type)
    if (existing) existing.count++
    else map[provider].types.push({ label: type, count: 1 })
  }
  // Include adult AV items (javdb, sehuatang) in platform distribution
  for (const item of appStore.adultAvItems || []) {
    const provider = item.source
    if (!map[provider]) map[provider] = { provider, count: 0, types: [] }
    map[provider].count++
    const existing = map[provider].types.find(t => t.label === 'jav')
    if (existing) existing.count++
    else map[provider].types.push({ label: 'jav', count: 1 })
  }
  return Object.values(map).sort((a, b) => b.count - a.count)
})

const maxCount = computed(() => Math.max(1, ...platformStats.value.map(p => p.count)))

interface DailyItem { source: string; label: string; count: number }
interface DailyStat { date: string; dateStr: string; weekday: string; total: number; items: DailyItem[]; isToday: boolean }

const weekdayNames = computed(() => [
  t('weekday.sunday'), t('weekday.monday'), t('weekday.tuesday'), t('weekday.wednesday'),
  t('weekday.thursday'), t('weekday.friday'), t('weekday.saturday'),
])

const weeklyStats = computed(() => {
  const data = appStore.records as RecordWithType[]
  const now = new Date()
  const dayMs = 86400000
  const days: DailyStat[] = []
  let weekTotal = 0

  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * dayMs)
    const dateStr = `${d.getMonth() + 1}/${d.getDate()}`
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const isToday = i === 0

    const sourceCounts: Record<string, number> = {}
    for (const r of data || []) {
      if (!r.updatedAt) continue
      const rd = new Date(r.updatedAt)
      const rKey = `${rd.getFullYear()}-${String(rd.getMonth() + 1).padStart(2, '0')}-${String(rd.getDate()).padStart(2, '0')}`
      if (rKey !== key) continue
      const provider: string = r.provider || r.storeName?.replace('_records', '') || 'unknown'
      sourceCounts[provider] = (sourceCounts[provider] || 0) + 1
    }
    // Include adult AV items (javdb, sehuatang) in daily counts
    for (const item of appStore.adultAvItems || []) {
      if (!item.updatedAt) continue
      const rd = new Date(item.updatedAt)
      const rKey = `${rd.getFullYear()}-${String(rd.getMonth() + 1).padStart(2, '0')}-${String(rd.getDate()).padStart(2, '0')}`
      if (rKey !== key) continue
      sourceCounts[item.source] = (sourceCounts[item.source] || 0) + 1
    }

    const total = Object.values(sourceCounts).reduce((a, b) => a + b, 0)
    weekTotal += total

    const items = Object.entries(sourceCounts)
      .map(([source, count]) => ({ source, label: t('platform.' + source, source), count }))
      .sort((a, b) => b.count - a.count)

    days.push({ date: key, dateStr, weekday: weekdayNames.value[d.getDay()], total, items, isToday })
  }

  const maxDaily = Math.max(1, ...days.map(d => d.total))
  const avgDaily = Math.round(weekTotal / 7)
  const peakDay = days.reduce((max, d) => d.total > max.total ? d : max, days[0]).weekday

  return { days, total: weekTotal, maxDaily, avgDaily, peakDay }
})

const statIcons = [Film, Tv, Music, ShieldAlert]
const statLabels = computed(() => [t('stats.movie'), t('stats.tv'), t('stats.music'), t('stats.jav')])
const statKeys = ['movie', 'tv', 'music', 'jav'] as const

const statsData = computed(() =>
  statKeys.map((key, i) => ({
    key,
    icon: statIcons[i],
    label: statLabels.value[i],
    value: stats.value[key],
  }))
)

const tooltipData = ref<{ show: boolean; x: number; y: number; text: string }>({ show: false, x: 0, y: 0, text: '' })

function platformColor(hue: number, variant: 'bar' | 'icon'): string {
  const s = getComputedStyle(document.documentElement)
  const barL = s.getPropertyValue('--umm-bar-platform-l').trim()
  const iconL = s.getPropertyValue('--umm-bar-platform-icon-l').trim()
  switch (variant) {
    case 'bar': return `hsl(${hue}, 55%, ${barL || '45%'})`
    case 'icon': return `hsl(${hue}, 55%, ${iconL || '40%'})`
  }
}

function barColor(count: number, maxCount: number): string {
  if (count === 0) return 'hsl(var(--muted))'
  const s = getComputedStyle(document.documentElement)
  const baseS = parseFloat(s.getPropertyValue('--umm-bar-base-s')) || 35
  const baseL = parseFloat(s.getPropertyValue('--umm-bar-base-l')) || 75
  const ratio = count / maxCount
  const level = Math.min(5, Math.ceil(ratio * 5))
  return `hsl(210, ${baseS + level * 7}%, ${baseL - level * 6}%)`
}

onMounted(async () => { await appStore.loadData() })
</script>

<template>
  <div class="umm:flex umm:flex-col umm:gap-6">
    <!-- Skeleton -->
    <div v-if="!appStore.dataReady && !appStore.error" class="umm:flex umm:flex-col umm:gap-6">
      <div class="umm:grid umm:grid-cols-2 umm:lg:grid-cols-4" :style="{ gap: 'var(--umm-section-gap)' }">
        <div v-for="i in 4" :key="i" class="umm:h-28 umm:bg-muted umm:rounded-xl umm:animate-pulse"></div>
      </div>
      <div class="umm:h-48 umm:bg-muted umm:rounded-xl umm:animate-pulse"></div>
    </div>

    <!-- Error -->
    <div v-else-if="appStore.error" class="umm:py-12 umm:text-center">
      <Alert variant="destructive" class="umm:mb-4">
        <AlertCircle class="umm:h-4 umm:w-4" />
        <AlertTitle>{{ t('common.loadFailed') }}</AlertTitle>
        <AlertDescription>{{ appStore.error }}</AlertDescription>
      </Alert>
      <Button @click="appStore.loadData" variant="outline" class="umm:gap-2">
        <RefreshCw class="umm:h-4 umm:w-4" />{{ t('common.retry') }}
      </Button>
    </div>

    <!-- Content -->
    <template v-else>
      <div class="umm:flex umm:items-center umm:gap-2">
        <SegmentedControl v-model="activeOverviewTab" :options="overviewTabs" class="umm:flex-1" />
        <Button variant="ghost" size="sm" @click="appStore.loadData" :disabled="appStore.loading">
          <RefreshCw :class="['umm:h-4 umm:w-4', appStore.loading && 'umm:animate-spin']" />
        </Button>
      </div>

      <!-- Tab: Overview (Stats + Heatmap) -->
      <div v-if="activeOverviewTab === 'overview'" class="umm:flex umm:flex-col umm:gap-6">
        <!-- Stats Grid -->
        <StatsGrid :stats="statsData" :loading="!appStore.dataReady" />

        <!-- Total -->
        <Card>
          <CardContent>
            <div class="umm:flex umm:items-center umm:justify-between">
              <div class="umm:flex umm:items-center umm:gap-2">
                <Database class="umm:w-4 umm:h-4 umm:text-secondary-content" />
                <span class="umm:font-body umm:font-medium umm:text-secondary-content">{{ t('stats.total') }}</span>
              </div>
              <span class="umm:font-bold umm:tracking-tight umm:text-primary-content umm:tabular-nums umm:whitespace-nowrap" :style="{ fontSize: '1.75rem' }">
                {{ stats.total.toLocaleString() }}
              </span>
            </div>
          </CardContent>
        </Card>

        <!-- Calendar Heatmap -->
        <HeatmapCalendar :records="appStore.records" :adultAvItems="appStore.adultAvItems" />
      </div><!-- end overview tab -->

      <!-- Tab: Weekly Detail -->
      <div v-if="activeOverviewTab === 'weekly'" class="umm:flex umm:flex-col umm:gap-6">
      <!-- Weekly Summary Stats -->
      <div class="umm:grid umm:grid-cols-3" :style="{ gap: 'var(--umm-section-gap)' }">
        <Card class="umm:text-center">
          <CardContent>
            <div class="umm:font-bold umm:tabular-nums umm:text-primary-content" :style="{ fontSize: '1.5rem' }">
              {{ weeklyStats.total }}
            </div>
            <div class="umm:font-caption umm:text-secondary-content umm:mt-1">{{ t('stats.weeklyTotal') }}</div>
          </CardContent>
        </Card>
        <Card class="umm:text-center">
          <CardContent>
            <div class="umm:font-bold umm:tabular-nums umm:text-primary-content" :style="{ fontSize: '1.5rem' }">
              {{ weeklyStats.avgDaily }}
            </div>
            <div class="umm:font-caption umm:text-secondary-content umm:mt-1">{{ t('stats.dailyAvg') }}</div>
          </CardContent>
        </Card>
        <Card class="umm:text-center">
          <CardContent>
            <div class="umm:font-bold umm:tabular-nums umm:text-primary-content" :style="{ fontSize: '1.5rem' }">
              {{ weeklyStats.peakDay }}
            </div>
            <div class="umm:font-caption umm:text-secondary-content umm:mt-1">{{ t('stats.peakDay') }}</div>
          </CardContent>
        </Card>
      </div>

      <!-- Daily Bar Chart -->
      <Card>
        <CardHeader>
          <h3 class="umm:font-h2 umm:text-primary-content">{{ t('stats.dailyRecords') }}</h3>
        </CardHeader>
        <CardContent>
          <div class="umm:flex umm:gap-2" :style="{ height: '8rem' }">
            <div v-for="day in weeklyStats.days" :key="day.date"
              class="umm:flex-1 umm:flex umm:flex-col umm:items-center umm:gap-1" :style="{ height: '100%' }">
              <!-- Bar — log scale, flex-1 wrapper provides definite height for percentage -->
              <div class="umm:flex-1 umm:w-full umm:flex umm:flex-col umm:justify-end umm:min-h-0">
                <div class="umm:w-full umm:rounded-t-lg umm:transition-all umm:duration-300 umm:relative group umm:cursor-default"
                  :style="{
                    height: `${Math.max(10, (Math.log(day.total + 1) / Math.log(weeklyStats.maxDaily + 1)) * 100)}%`,
                    backgroundColor: day.isToday ? 'hsl(var(--primary))' : barColor(day.total, weeklyStats.maxDaily),
                    minHeight: '10px',
                    opacity: day.total === 0 ? 0.3 : 1,
                  }">
                  <div class="umm:absolute umm:-top-6 umm:left-1/2 umm:-translate-x-1/2 umm:text-xs umm:font-bold umm:text-primary-content umm:opacity-0 umm:group-hover:opacity-100 umm:transition-opacity umm:whitespace-nowrap">
                    {{ day.total }}
                  </div>
                </div>
              </div>
              <!-- Label -->
              <div class="umm:text-center">
                <div class="umm:font-caption umm:text-secondary-content" :style="{ fontSize: '0.625rem' }">{{ day.weekday }}</div>
                <div class="umm:font-caption umm:text-secondary-content" :style="{ fontSize: '0.625rem', color: day.isToday ? 'hsl(var(--primary))' : undefined }">{{ day.dateStr }}</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- Daily Detail List -->
      <Card>
        <CardHeader>
          <h3 class="umm:font-h2 umm:text-primary-content">{{ t('stats.dailyDetail') }}</h3>
        </CardHeader>
        <CardContent>
          <div class="umm:flex umm:flex-col umm:gap-3">
            <div v-for="day in weeklyStats.days" :key="day.date"
              class="umm:rounded-xl umm:border umm:transition-all"
              :class="day.isToday ? 'umm:border-primary/30 umm:bg-primary/[0.03] umm:shadow-sm' : 'umm:border-border umm:hover:border-muted umm:hover:shadow-sm'"
              :style="{ padding: 'var(--umm-card-padding)' }">
              <!-- Day header row -->
              <div class="umm:flex umm:items-center umm:justify-between umm:mb-3">
                <div class="umm:flex umm:items-center umm:gap-3">
                  <!-- Day badge -->
                  <div class="umm:w-10 umm:h-10 umm:rounded-xl umm:flex umm:flex-col umm:items-center umm:justify-center"
                    :style="{
                      backgroundColor: day.isToday ? 'hsl(var(--primary))' : 'hsl(var(--muted))',
                      color: day.isToday ? 'hsl(var(--primary-foreground))' : 'hsl(var(--muted-foreground))',
                    }">
                    <span class="umm:font-bold umm:leading-none" :style="{ fontSize: '0.9rem' }">{{ day.weekday.charAt(1) }}</span>
                    <span class="umm:leading-none umm:text-secondary-content" :style="{ fontSize: '0.7rem' }">{{ day.dateStr }}</span>
                  </div>
                </div>
                <div class="umm:flex umm:items-center" :style="{ gap: 'var(--umm-spacing-2)' }">
                  <span v-if="day.isToday" class="umm:text-xs umm:font-medium umm:px-2 umm:py-0.5 umm:rounded-full umm:bg-primary/10 umm:text-primary">{{ t('common.today') }}</span>
                  <div class="umm:font-bold umm:tabular-nums umm:text-primary-content" :style="{ fontSize: '1.125rem' }">
                    {{ day.total }}
                  </div>
                </div>
              </div>

              <!-- Source breakdown with mini progress bars -->
              <div v-if="day.items.length > 0" class="umm:flex umm:flex-col umm:gap-2">
                <div v-for="(item, i) in day.items" :key="i" class="umm:flex umm:items-center" :style="{ gap: 'var(--umm-spacing-2)' }">
                  <span class="umm:font-body umm:text-secondary-content umm:shrink-0" :style="{ width: '80px', fontSize: '0.75rem' }">{{ item.label }}</span>
                  <div class="umm:flex-1 umm:h-2 umm:rounded-full umm:bg-muted umm:overflow-hidden">
                    <div class="umm:h-full umm:rounded-full umm:transition-all umm:duration-500"
                      :style="{
                        width: `${(item.count / day.total) * 100}%`,
                        backgroundColor: platformColor(PLATFORM_HUES[item.source] || 0, 'bar'),
                      }" />
                  </div>
                  <span class="umm:font-body umm:font-medium umm:tabular-nums umm:text-primary-content umm:shrink-0" :style="{ width: '32px', textAlign: 'right', fontSize: '0.75rem' }">{{ item.count }}</span>
                </div>
              </div>
              <div v-else class="umm:py-2 umm:text-center umm:font-caption umm:text-secondary-content">{{ t('common.noRecords') }}</div>
            </div>
          </div>
        </CardContent>
      </Card>
      </div><!-- end weekly tab -->

      <!-- Tab: Platform Distribution -->
      <div v-if="activeOverviewTab === 'platform'" class="umm:flex umm:flex-col umm:gap-6">
      <!-- Platform Distribution -->
      <div>
        <h3 class="umm:font-h2 umm:text-primary-content umm:mb-3">{{ t('tab.platformDistribution') }}</h3>

        <!-- Summary bar chart -->
        <Card class="umm:mb-4">
          <div :style="{ padding: 'var(--umm-card-padding)' }">
            <div class="umm:flex umm:items-end" :style="{ gap: 'var(--umm-spacing-1)', height: '5rem' }">
              <div
                v-for="info in platformStats"
                :key="info.provider"
                class="umm:flex-1 umm:rounded-t-md umm:transition-all umm:duration-500 umm:relative group umm:cursor-default"
                :style="{
                  height: `${Math.max(8, (info.count / maxCount) * 100)}%`,
                  backgroundColor: platformColor(PLATFORM_HUES[info.provider] || 0, 'bar'),
                }"
              >
                <div class="umm:absolute umm:-top-6 umm:left-1/2 umm:-translate-x-1/2 umm:text-xs umm:font-bold umm:text-primary-content umm:opacity-0 umm:group-hover:opacity-100 umm:transition-opacity umm:whitespace-nowrap umm:tabular-nums">
                  {{ info.count.toLocaleString() }}
                </div>
              </div>
            </div>
            <div class="umm:flex umm:items-end" :style="{ gap: 'var(--umm-spacing-1)', marginTop: 'var(--umm-spacing-1)' }">
              <div
                v-for="info in platformStats"
                :key="info.provider + '-label'"
                class="umm:flex-1 umm:text-center umm:font-caption umm:text-secondary-content umm:truncate"
              >
                {{ t('platform.' + info.provider, info.provider) }}
              </div>
            </div>
          </div>
        </Card>

        <!-- Detailed cards -->
        <PlatformDistribution :platformStats="platformStats" />

        <div v-if="platformStats.length === 0" class="umm:py-8 umm:text-center umm:font-body umm:text-secondary-content">
          {{ t('common.noData') }}
        </div>
      </div>
      </div><!-- end platform tab -->
    </template>

    <!-- Fixed-position tooltip (renders outside all overflow contexts) -->
    <Teleport to="body">
      <div
        v-if="tooltipData.show"
        class="umm:fixed umm:z-[9999] umm:px-2 umm:py-1 umm:rounded umm:text-xs umm:whitespace-nowrap umm:pointer-events-none umm:shadow-lg"
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
  box-shadow: 0 2px 8px hsl(var(--foreground) / 0.2);
  z-index: 10;
}
</style>
