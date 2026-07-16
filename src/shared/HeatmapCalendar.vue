<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Card, CardHeader, CardContent } from '@/shared/ui/card'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/shared/ui/tooltip'

const { t } = useI18n()

const props = defineProps<{
  records: { updatedAt?: string }[]
  adultAvItems: { updatedAt?: string }[]
}>()

const dayLabels = computed(() => [
  '', t('weekday.mon'), '', t('weekday.wed'), '', t('weekday.fri'), '',
])

const localeStr = computed(() => {
  try { return navigator.language || 'en-US' } catch { return 'en-US' }
})

function formatDate(date: Date): string {
  try {
    return date.toLocaleDateString(localeStr.value, { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }
}

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
    const level = count === 0 ? 0 : Math.min(8, Math.ceil(8 * Math.log2(1 + count) / Math.log2(1 + maxDaily)))
    currentWeek.push({ date: d, count, level })
    if (currentWeek.length === 7) { weeks.push(currentWeek); currentWeek = [] }
  }
  if (currentWeek.length > 0) weeks.push(currentWeek)
  return { weeks, maxDaily }
})

function heatmapColor(level: number): string {
  if (level === 0) return 'hsl(var(--muted))'

  const isDark = document.documentElement.classList.contains('dark')

  // Dark theme: card bg is ~15% lightness. Start L1 at 29% (clearly above card),
  // go up to 64% (bright green). 5% lightness steps = easy to distinguish.
  if (isDark) return `hsl(142, ${35 + level * 6}%, ${24 + level * 5}%)`

  // Light theme: card bg is 100% white. L1 at 82% is a visible green tint,
  // stepping down 8% per level to L8 at 26% (deep green).
  return `hsl(142, ${30 + level * 5}%, ${90 - level * 8}%)`
}

// Legend levels: show a subset for the gradient bar
const legendLevels = [0, 2, 4, 6, 8] as const
</script>

<template>
  <Card>
    <CardHeader>
      <div class="umm:flex umm:items-center umm:justify-between">
        <h3 class="umm:font-h2 umm:text-primary-content">{{ t('common.activity') }}</h3>
        <span class="umm:font-caption umm:text-secondary-content">{{ t('common.last90Days') }}</span>
      </div>
    </CardHeader>
    <CardContent>
      <!-- Heatmap grid -->
      <div class="umm:overflow-x-auto umm:pb-2 umm:-mb-2" style="direction: rtl; padding-top: 8px;">
        <div class="umm:flex" :style="{ gap: 'var(--umm-spacing-1)', minWidth: 'min-content', direction: 'ltr' }">
          <!-- Day labels -->
          <div class="umm:flex umm:flex-col" :style="{ gap: 'var(--umm-spacing-1)', marginRight: '6px' }">
            <div v-for="(label, i) in dayLabels" :key="i"
              class="umm:font-caption umm:text-secondary-content"
              :style="{ width: '16px', height: '18px', fontSize: '10px', lineHeight: '18px', textAlign: 'right' }">
              {{ label }}
            </div>
          </div>
          <!-- Weeks -->
          <TooltipProvider :delayDuration="300" :skipDelayDuration="150" disableHoverableContent>
            <div v-for="(week, wi) in calendarData.weeks" :key="wi" class="umm:flex umm:flex-col" :style="{ gap: 'var(--umm-spacing-1)' }">
              <Tooltip v-for="(day, di) in week" :key="di">
                <TooltipTrigger as-child>
                  <div class="heatmap-cell umm:rounded-sm umm:cursor-default"
                    :style="{ backgroundColor: heatmapColor(day.level) }" />
                </TooltipTrigger>
                <TooltipContent side="top">
                  <div class="umm:text-xs umm:whitespace-nowrap">
                    <span class="umm:font-medium">{{ formatDate(day.date) }}</span>
                  </div>
                  <div class="umm:text-xs umm:text-muted-foreground">
                    {{ day.count === 0 ? t('common.noActivity') : t('common.countActivity', { count: day.count }) }}
                  </div>
                </TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </div>
      </div>

      <!-- Legend -->
      <div class="umm:flex umm:items-center umm:justify-end umm:mt-4 umm:gap-2">
        <span class="umm:font-caption umm:text-secondary-content" :style="{ fontSize: '11px' }">{{ t('common.legendLess') }}</span>
        <div class="umm:flex" :style="{ gap: 'var(--umm-spacing-1)' }">
          <div v-for="lvl in legendLevels" :key="lvl"
            class="umm:rounded-sm"
            :style="{ width: '12px', height: '12px', backgroundColor: heatmapColor(lvl) }" />
        </div>
        <span class="umm:font-caption umm:text-secondary-content" :style="{ fontSize: '11px' }">{{ t('common.legendMore') }}</span>
      </div>
    </CardContent>
  </Card>
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
