<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount, Teleport } from 'vue'
import { useI18n } from 'vue-i18n'
import { Card, CardHeader, CardContent } from '@/shared/ui/card'
import SegmentedControl from '@/shared/ui/segmented-control/SegmentedControl.vue'
import { dateKey } from '@/utils'

const { t, locale } = useI18n()

const props = defineProps<{
  records: { updatedAt?: string }[]
  adultAvItems: { updatedAt?: string }[]
}>()

/** Time range selector (days) — labels localized via common.daysCount */
const rangeDays = ref<'90' | '150' | '365'>('90')
const rangeOptions = computed(() => [
  { id: '90', label: t('common.daysCount', { n: 90 }) },
  { id: '150', label: t('common.daysCount', { n: 150 }) },
  { id: '365', label: t('common.daysCount', { n: 365 }) },
])
const scrollEl = ref<HTMLElement | null>(null)

function scrollToLatest() {
  nextTick(() => {
    const el = scrollEl.value
    if (el) el.scrollLeft = el.scrollWidth
  })
}
onMounted(scrollToLatest)
watch([rangeDays, () => props.records.length], scrollToLatest)

const dayLabels = computed(() => [
  '', t('weekday.mon'), '', t('weekday.wed'), '', t('weekday.fri'), '',
])

/** Date formatting MUST follow the APP locale (vue-i18n), never navigator —
 *  mixing the two produced Chinese months inside the English UI. */
const appLocale = computed(() => locale.value)

function formatDate(date: Date): string {
  try {
    return date.toLocaleDateString(appLocale.value, { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return dateKey(date)
  }
}

const calendarData = computed(() => {
  const now = new Date()
  const dayMs = 86400000
  const days = Number(rangeDays.value)
  const map: Record<string, number> = {}
  for (const r of props.records) {
    if (!r.updatedAt) continue
    const d = new Date(r.updatedAt)
    const key = dateKey(d)
    map[key] = (map[key] || 0) + 1
  }
  for (const item of props.adultAvItems) {
    if (!item.updatedAt) continue
    const d = new Date(item.updatedAt)
    const key = dateKey(d)
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
    const key = dateKey(d)
    const count = map[key] || 0
    const level = count === 0 ? 0 : Math.min(8, Math.ceil(8 * Math.log2(1 + count) / Math.log2(1 + maxDaily)))
    currentWeek.push({ date: d, count, level })
    if (currentWeek.length === 7) { weeks.push(currentWeek); currentWeek = [] }
  }
  if (currentWeek.length > 0) weeks.push(currentWeek)

  // Month timeline labels: emit at each week whose first day starts a new month
  const monthLabels: string[] = weeks.map((week, wi) => {
    const m = week[0].date.getMonth()
    if (wi > 0 && m === weeks[wi - 1][0].date.getMonth()) return ''
    try { return week[0].date.toLocaleDateString(appLocale.value, { month: 'short' }) } catch { return String(m + 1) }
  })

  return { weeks, maxDaily, monthLabels }
})

const todayKey = dateKey(new Date())

// ---- Shared tooltip (one glass bubble for the whole grid) ----
const tip = ref({ show: false, x: 0, y: 0, below: false, date: '', text: '', color: 'var(--muted)' })
let hideTimer: ReturnType<typeof setTimeout> | null = null

function onTipOver(e: MouseEvent): void {
  const el = (e.target as HTMLElement).closest('.heatmap-cell') as HTMLElement | null
  if (!el || !el.dataset.tipDate) { hideTip(); return }
  const count = Number(el.dataset.tipCount ?? 0)
  const r = el.getBoundingClientRect()
  const below = r.top < 96 // not enough headroom above → flip under the cell
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null }
  tip.value = {
    show: true,
    x: r.left + r.width / 2,
    y: below ? r.bottom + 6 : r.top - 6,
    below,
    date: el.dataset.tipDate,
    text: count === 0 ? t('common.noActivity') : t('common.countActivity', count),
    color: el.dataset.tipColor ?? 'var(--muted)',
  }
}

function hideTip(): void {
  // small delay so crossing the 4px gaps between cells doesn't flicker
  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = setTimeout(() => { tip.value.show = false }, 60)
}

onBeforeUnmount(() => { if (hideTimer) clearTimeout(hideTimer) })

function heatmapColor(level: number): string {
  if (level === 0) return 'var(--muted)'

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
        <SegmentedControl v-model="rangeDays" :options="rangeOptions" compact />
      </div>
    </CardHeader>
    <CardContent>
      <!-- Heatmap: fluid CSS Grid — stretches when wide, scrolls when narrow.
           Tooltip = ONE shared glass bubble driven by event delegation
           (scales to 365 days; per-cell tooltip instances would not). -->
      <div ref="scrollEl" class="heatmap-scroll umm:overflow-x-auto"
        @mouseover="onTipOver" @mouseleave="hideTip" @scroll="hideTip">
        <div class="heatmap-grid" :style="{
          '--weeks': calendarData.weeks.length,
          minWidth: `calc(${calendarData.weeks.length} * 16px + 40px)`,
          maxWidth: `calc(${calendarData.weeks.length} * 26px + 42px)`,
        }">
          <!-- Month timeline (row 1) -->
          <template v-for="(ml, wi) in calendarData.monthLabels" :key="'m' + wi">
            <div v-if="wi === 0" :style="{ gridRow: '1', gridColumn: '1' }" />
            <div class="heatmap-month" :style="{ gridRow: '1', gridColumn: `${wi + 2}` }">
              <span v-if="ml" class="umm:font-caption umm:text-secondary-content">{{ ml }}</span>
            </div>
          </template>

          <!-- Weekday labels (column 1) -->
          <template v-for="(label, di) in dayLabels" :key="'d' + di">
            <div v-if="label" class="heatmap-day-label umm:font-caption umm:text-secondary-content"
              :style="{ gridRow: `${di + 2}`, gridColumn: '1' }">
              {{ label }}
            </div>
          </template>

          <!-- Cells — dataset attrs feed the shared tooltip; aria-label for SR -->
          <template v-for="(week, wi) in calendarData.weeks" :key="'w' + wi">
            <template v-for="(day, di) in week" :key="di">
              <div class="heatmap-cell umm:rounded-sm umm:cursor-default"
                :class="{ 'is-today': dateKey(day.date) === todayKey }"
                :data-tip-date="formatDate(day.date)"
                :data-tip-count="day.count"
                :data-tip-color="heatmapColor(day.level)"
                :aria-label="`${formatDate(day.date)} · ${day.count === 0 ? t('common.noActivity') : t('common.countActivity', day.count)}`"
                :style="{ gridRow: `${di + 2}`, gridColumn: `${wi + 2}`, backgroundColor: heatmapColor(day.level) }" />
            </template>
          </template>
        </div>
      </div>

      <!-- Shared glass tooltip (single instance, teleported to dodge clipping) -->
      <Teleport to="body">
        <div class="heatmap-tip" :class="{ 'is-visible': tip.show, below: tip.below }" :aria-hidden="!tip.show" :style="{ left: `${tip.x}px`, top: `${tip.y}px` }">
          <span class="heatmap-tip-dot" :style="{ background: tip.color }" />
          <span class="heatmap-tip-date">{{ tip.date }}</span>
          <span class="heatmap-tip-count">{{ tip.text }}</span>
        </div>
      </Teleport>

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
/* Shared tooltip — Vibrancy glass bubble; fixed + teleported (dodges clipping),
   flips above/below the cell, 150ms fade. pointer-events:none = never flickers. */
.heatmap-tip {
  position: fixed;
  z-index: calc(var(--umm-z-tooltip, 150) + 10);
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--popover);
  backdrop-filter: blur(12px);
  box-shadow: 0 2px 8px rgb(0 0 0 / 0.3);
  pointer-events: none;
  font-size: 11px;
  line-height: 1;
  white-space: nowrap;
  opacity: 0;
  transition: opacity var(--umm-static-duration-fast, 200ms) ease;
  transform: translate(-50%, calc(-100% - 6px));
}
.heatmap-tip.is-visible {
  opacity: 1;
}
.heatmap-tip.below {
  transform: translate(-50%, 6px);
}
/* anchor point = cell edge; flip class moves the bubble under the cell */
.heatmap-tip.below {
  transform: translate(-50%, 6px);
}
.heatmap-tip-date {
  font-weight: 600;
  color: var(--foreground);
}
.heatmap-tip-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.15);
}
.heatmap-tip-count {
  color: var(--muted-foreground);
}

.heatmap-scroll {
  animation: umm-mount-fade var(--umm-static-duration-enter, 500ms) var(--umm-static-ease-emphasized, cubic-bezier(0.16, 1, 0.3, 1)) both;
}
/* Fluid GitHub-style grid: label column + N week columns that share the
   card width; capped so cells never balloon on wide cards; centered. */
.heatmap-grid {
  display: grid;
  grid-template-columns: 18px repeat(var(--weeks), minmax(0, 1fr));
  grid-template-rows: 16px repeat(7, auto);
  gap: 4px;
  width: 100%;
  margin: 0 auto;
}
.heatmap-month {
  position: relative;
  height: 14px;
  font-size: 10px;
  line-height: 14px;
}
.heatmap-month span {
  position: absolute;
  left: 0;
  white-space: nowrap;
}
.heatmap-day-label {
  align-self: center;
  justify-self: end;
  padding-right: 6px;
  font-size: 10px;
  line-height: 1;
}
.heatmap-cell {
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: 3px;
  transition: filter var(--umm-static-duration-fast, 200ms) ease, box-shadow var(--umm-static-duration-fast, 200ms) ease;
}
/* StyleKit-compliant hover: brightness + ring, no scale/lift */
.heatmap-cell:hover {
  filter: brightness(1.3);
  box-shadow: 0 0 0 1.5px color-mix(in srgb, var(--foreground) 35%, transparent);
  z-index: 10;
}
/* Today marker — brand ring, independent of hover shadow */
.heatmap-cell.is-today {
  outline: 1.5px solid var(--primary);
  outline-offset: 1px;
}
</style>
