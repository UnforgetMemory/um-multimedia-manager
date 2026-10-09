<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAppStore } from '@/store/app';
import type { RecordWithType } from '@/feature/composables/use-stats';
import { PLATFORM_HUES } from '@/feature/composables/use-platform-meta';
import { dateKey } from '@/libraries/utils';
import { Card, CardHeader, CardContent } from '@/libraries/ui/card';
import { barColor, platformColor } from './bar-colors';

const { t } = useI18n();
const appStore = useAppStore();

interface DailyItem {
  source: string;
  label: string;
  count: number;
}
interface DailyStat {
  date: string;
  dateStr: string;
  weekday: string;
  weekdayShort: string;
  total: number;
  items: DailyItem[];
  isToday: boolean;
}

const weekdayNames = computed(() => [
  t('weekday.sunday'),
  t('weekday.monday'),
  t('weekday.tuesday'),
  t('weekday.wednesday'),
  t('weekday.thursday'),
  t('weekday.friday'),
  t('weekday.saturday'),
]);

/** Locale-aware short labels ('Sun' / '日') — safe for badges & axis ticks.
 *  Never slice full names: charAt(1) breaks Latin scripts ("Tuesday"→"u"). */
const weekdayShortNames = computed(() => [
  t('weekday.sun'),
  t('weekday.mon'),
  t('weekday.tue'),
  t('weekday.wed'),
  t('weekday.thu'),
  t('weekday.fri'),
  t('weekday.sat'),
]);

const weeklyStats = computed(() => {
  const data = appStore.records as RecordWithType[];
  const now = new Date();
  const dayMs = 86400000;
  const days: DailyStat[] = [];
  let weekTotal = 0;

  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * dayMs);
    const dateStr = `${d.getMonth() + 1}/${d.getDate()}`;
    const key = dateKey(d);
    const isToday = i === 0;

    const sourceCounts: Record<string, number> = {};
    for (const r of data || []) {
      if (!r.updatedAt) continue;
      const rd = new Date(r.updatedAt);
      const rKey = dateKey(rd);
      if (rKey !== key) continue;
      const provider: string = r.provider || r.storeName?.replace('_records', '') || 'unknown';
      sourceCounts[provider] = (sourceCounts[provider] || 0) + 1;
    }
    // Include adult AV items (javdb, sehuatang) in daily counts
    for (const item of appStore.adultAvItems || []) {
      if (!item.updatedAt) continue;
      const rd = new Date(item.updatedAt);
      const rKey = dateKey(rd);
      if (rKey !== key) continue;
      sourceCounts[item.source] = (sourceCounts[item.source] || 0) + 1;
    }

    const total = Object.values(sourceCounts).reduce((a, b) => a + b, 0);
    weekTotal += total;

    const items = Object.entries(sourceCounts)
      .map(([source, count]) => ({ source, label: t('platform.' + source, source), count }))
      .sort((a, b) => b.count - a.count);

    days.push({
      date: key,
      dateStr,
      weekday: weekdayNames.value[d.getDay()] ?? '',
      weekdayShort: weekdayShortNames.value[d.getDay()] ?? '',
      total,
      items,
      isToday,
    });
  }

  const maxDaily = Math.max(1, ...days.map((d) => d.total));
  const avgDaily = Math.round(weekTotal / 7);
  // WHY !: the loop above always pushes 7 days, so days[0] exists
  const peakDay = days.reduce((max, d) => (d.total > max.total ? d : max), days[0]!).weekday;

  return { days, total: weekTotal, maxDaily, avgDaily, peakDay };
});
</script>

<template vapor>
  <!-- Weekly Summary Stats -->
  <div class="umm:grid umm:grid-cols-3" :style="{ gap: 'var(--umm-section-gap)' }">
    <Card class="umm:text-center">
      <CardContent>
        <div
          class="umm:font-bold umm:tabular-nums umm:text-primary-content"
          :style="{ fontSize: '1.5rem' }"
        >
          {{ weeklyStats.total }}
        </div>
        <div class="umm:font-caption umm:text-secondary-content umm:mt-1">
          {{ t('stats.weeklyTotal') }}
        </div>
      </CardContent>
    </Card>
    <Card class="umm:text-center">
      <CardContent>
        <div
          class="umm:font-bold umm:tabular-nums umm:text-primary-content"
          :style="{ fontSize: '1.5rem' }"
        >
          {{ weeklyStats.avgDaily }}
        </div>
        <div class="umm:font-caption umm:text-secondary-content umm:mt-1">
          {{ t('stats.dailyAvg') }}
        </div>
      </CardContent>
    </Card>
    <Card class="umm:text-center">
      <CardContent>
        <div
          class="umm:font-bold umm:tabular-nums umm:text-primary-content"
          :style="{ fontSize: '1.5rem' }"
        >
          {{ weeklyStats.peakDay }}
        </div>
        <div class="umm:font-caption umm:text-secondary-content umm:mt-1">
          {{ t('stats.peakDay') }}
        </div>
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
        <div
          v-for="day in weeklyStats.days"
          :key="day.date"
          class="umm:flex-1 umm:flex umm:flex-col umm:items-center umm:gap-1"
          :style="{ height: '100%' }"
        >
          <!-- Bar — log scale, flex-1 wrapper provides definite height for percentage -->
          <div class="umm:flex-1 umm:w-full umm:flex umm:flex-col umm:justify-end umm:min-h-0">
            <div
              class="umm:w-full umm:rounded-t-lg umm:transition-all umm:duration-300 umm:relative group umm:cursor-default"
              :style="{
                height: `${Math.max(10, (Math.log(day.total + 1) / Math.log(weeklyStats.maxDaily + 1)) * 100)}%`,
                backgroundColor: day.isToday
                  ? 'var(--primary)'
                  : barColor(day.total, weeklyStats.maxDaily),
                minHeight: '10px',
                opacity: day.total === 0 ? 0.3 : 1,
              }"
            >
              <div
                class="umm:absolute umm:-top-6 umm:left-1/2 umm:-translate-x-1/2 umm:text-xs umm:font-bold umm:text-primary-content umm:opacity-0 umm:group-hover:opacity-100 umm:transition-opacity umm:whitespace-nowrap"
              >
                {{ day.total }}
              </div>
            </div>
          </div>
          <!-- Label -->
          <div class="umm:text-center">
            <div
              class="umm:font-caption umm:text-secondary-content"
              :style="{ fontSize: '0.625rem' }"
            >
              {{ day.weekdayShort }}
            </div>
            <div
              class="umm:font-caption umm:text-secondary-content"
              :style="{
                fontSize: '0.625rem',
                color: day.isToday ? 'var(--primary)' : undefined,
              }"
            >
              {{ day.dateStr }}
            </div>
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
        <div
          v-for="day in weeklyStats.days"
          :key="day.date"
          class="umm:rounded-xl umm:border umm:transition-all"
          :class="
            day.isToday
              ? 'umm:border-primary/30 umm:bg-primary/[0.03] umm:shadow-sm'
              : 'umm:border-border umm:hover:border-muted umm:hover:shadow-sm'
          "
          :style="{ padding: 'var(--umm-card-padding)' }"
        >
          <!-- Day header row -->
          <div class="umm:flex umm:items-center umm:justify-between umm:mb-3">
            <div class="umm:flex umm:items-center umm:gap-3">
              <!-- Day badge — horizontal layout, ink hierarchy: weekday
                 solid (primary), date subdued via opacity of SAME ink -->
              <div
                class="umm:h-10 umm:px-3 umm:rounded-lg umm:flex umm:items-center umm:gap-1.5"
                :style="{
                  backgroundColor: day.isToday ? 'var(--primary)' : 'var(--muted)',
                  color: day.isToday ? 'var(--primary-foreground)' : 'var(--accent-foreground)',
                }"
              >
                <span class="umm:font-bold umm:leading-none" :style="{ fontSize: '0.9rem' }">{{
                  day.weekdayShort
                }}</span>
                <span class="umm:leading-none" :style="{ fontSize: '0.7rem', opacity: 0.85 }">{{
                  day.dateStr
                }}</span>
              </div>
            </div>
            <div class="umm:flex umm:items-center" :style="{ gap: 'var(--umm-spacing-2)' }">
              <span
                v-if="day.isToday"
                class="umm:text-xs umm:font-medium umm:px-2 umm:py-0.5 umm:rounded-full umm:bg-primary/10 umm:text-primary"
                >{{ t('common.today') }}</span
              >
              <div
                class="umm:font-bold umm:tabular-nums umm:text-primary-content"
                :style="{ fontSize: '1.125rem' }"
              >
                {{ day.total }}
              </div>
            </div>
          </div>

          <!-- Source breakdown with mini progress bars -->
          <div v-if="day.items.length > 0" class="umm:flex umm:flex-col umm:gap-2 umm-stagger">
            <div
              v-for="(item, i) in day.items"
              :key="i"
              class="umm:flex umm:items-center"
              :style="{ gap: 'var(--umm-spacing-2)' }"
            >
              <span
                class="umm:font-body umm:text-secondary-content umm:shrink-0"
                :style="{ width: '80px', fontSize: '0.75rem' }"
                >{{ item.label }}</span
              >
              <div class="umm:flex-1 umm:h-2 umm:rounded-full umm:bg-muted umm:overflow-hidden">
                <div
                  class="umm:h-full umm:rounded-full umm:transition-all umm:duration-500"
                  :style="{
                    width: `${(item.count / day.total) * 100}%`,
                    backgroundColor: platformColor(PLATFORM_HUES[item.source] || 0, 'bar'),
                  }"
                />
              </div>
              <span
                class="umm:font-body umm:font-medium umm:tabular-nums umm:text-primary-content umm:shrink-0"
                :style="{ width: '32px', textAlign: 'right', fontSize: '0.75rem' }"
                >{{ item.count }}</span
              >
            </div>
          </div>
          <div v-else class="umm:py-2 umm:text-center umm:font-caption umm:text-secondary-content">
            {{ t('common.noRecords') }}
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
