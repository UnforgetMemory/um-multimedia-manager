<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Card } from '@/components/ui/card'

const { t } = useI18n()

const props = defineProps<{
  records: { updatedAt?: string }[]
  adultAvItems: { updatedAt?: string }[]
}>()

const dayLabels = computed(() => [
  '', t('weekday.mon'), '', t('weekday.wed'), '', t('weekday.fri'), '',
])

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
  return { weeks, maxDaily }
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
    <div :style="{ padding: 'var(--card-padding)' }">
      <div class="flex items-center justify-between" :style="{ marginBottom: 'var(--space-3)' }">
        <h3 class="font-h2 text-primary-content">{{ t('common.activity') }}</h3>
        <span class="font-caption text-secondary-content">{{ t('common.last90Days') }}</span>
      </div>
      <div class="overflow-x-auto pb-2 -mb-2" style="direction: rtl;">
        <div class="flex" :style="{ gap: '4px', minWidth: 'min-content', direction: 'ltr' }">
          <div class="flex flex-col" :style="{ gap: '4px', marginRight: '6px' }">
            <div v-for="(label, i) in dayLabels" :key="i"
              class="font-caption text-secondary-content"
              :style="{ width: '16px', height: '18px', fontSize: '9px', lineHeight: '18px', textAlign: 'right' }">
              {{ label }}
            </div>
          </div>
          <div v-for="(week, wi) in calendarData.weeks" :key="wi" class="flex flex-col" :style="{ gap: '4px' }">
            <div v-for="(day, di) in week" :key="di"
              class="heatmap-cell rounded-sm cursor-default"
              :style="{ backgroundColor: heatmapColor(day.level) }" />
          </div>
        </div>
      </div>
    </div>
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
