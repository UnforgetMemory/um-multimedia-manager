<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAppStore } from '@/store/app';
import { useStats, type RecordWithType } from '@/feature/composables/use-stats';
import HeatmapCalendar from '@/feature/HeatmapCalendar.vue';
import { computeYearlyStats } from '@/domain/record/statistics';
import { Card, CardHeader, CardContent } from '@/libraries/ui/card';
import StatsGrid from '@/libraries/ui/stats-grid/StatsGrid.vue';
import { Database, Film, Tv, Music, Book, Gamepad2, ShieldAlert, Play } from '@/libraries/ui/icons';

const { t } = useI18n();
const appStore = useAppStore();
const { stats } = useStats(
  () => appStore.records as RecordWithType[],
  () => appStore.adultAvItems,
);

/**
 * Stat type card definitions for the stats grid.
 * statIcons, statLabels, and statKeys must stay parallel — each index maps to one stat card.
 * Add a new stat type by appending to all three arrays at the same position.
 */
const statIcons = [Film, Tv, Music, Book, Gamepad2, ShieldAlert, Play, Play];
const statLabels = computed(() => [
  t('stats.movie'),
  t('stats.tv'),
  t('stats.music'),
  t('stats.book'),
  t('stats.game'),
  t('stats.jav'),
  t('stats.bilibili'),
  t('stats.youtube'),
]);
const statKeys = ['movie', 'tv', 'music', 'book', 'game', 'jav', 'bilibili', 'youtube'] as const;
/** Semantic accents — mirrors popup DashboardPage assignments */
const statAccents = ['brand', 'violet', 'rose', 'amber', 'teal', 'red', 'blue', 'green'] as const;

const statsData = computed(() =>
  statKeys.flatMap((key, i) => {
    const icon = statIcons[i];
    const label = statLabels.value[i];
    if (!icon || !label) return [];
    return [{ key, icon, label, value: stats.value[key], accent: statAccents[i] }];
  }),
);

/**
 * Yearly totals — domain-pure aggregation (continuous range, gap years = 0),
 * starting at LAST year, newest → oldest. Timestamps merge records +
 * adultAvItems to match the heatmap's counting surface.
 */
const yearlyStats = computed(() => {
  const timestamps = [
    ...(appStore.records as { updatedAt?: string }[]).map((r) => r.updatedAt),
    ...appStore.adultAvItems.map((i) => i.updatedAt),
  ];
  const { rows } = computeYearlyStats(timestamps);
  return rows.map((row, i) => ({
    year: row.year,
    count: row.count,
    pct: row.pct,
    delta: row.delta,
    opacity: Math.max(0.35, 1 - i * 0.12),
  }));
});
</script>

<template vapor>
  <!-- Stats Grid -->
  <StatsGrid :stats="statsData" :loading="!appStore.dataReady" />

  <!-- Total -->
  <Card>
    <CardContent>
      <div class="umm:flex umm:items-center umm:justify-between">
        <div class="umm:flex umm:items-center umm:gap-2">
          <Database class="umm:w-4 umm:h-4 umm:text-secondary-content" />
          <span class="umm:font-body umm:font-medium umm:text-secondary-content">{{
            t('stats.total')
          }}</span>
        </div>
        <span
          class="umm:font-bold umm:tracking-tight umm:text-primary-content umm:tabular-nums umm:whitespace-nowrap"
          :style="{ fontSize: '1.75rem' }"
        >
          {{ stats.total.toLocaleString() }}
        </span>
      </div>
    </CardContent>
  </Card>

  <!-- Calendar Heatmap -->
  <HeatmapCalendar :records="appStore.records" :adultAvItems="appStore.adultAvItems" />

  <!-- Yearly stats — from last year back to the earliest year -->
  <Card>
    <CardHeader>
      <h3 class="umm:font-h2 umm:text-primary-content">{{ t('stats.yearly') }}</h3>
    </CardHeader>
    <CardContent>
      <div v-if="yearlyStats.length" class="umm:flex umm:flex-col umm:gap-3 umm-stagger">
        <div v-for="row in yearlyStats" :key="row.year" class="umm:flex umm:items-center umm:gap-3">
          <span
            class="umm:font-bold umm:tabular-nums umm:text-primary-content"
            style="width: 52px"
            >{{ row.year }}</span
          >
          <div class="umm:flex-1 umm:h-2.5 umm:rounded-full umm:bg-muted umm:overflow-hidden">
            <div
              class="umm:h-full umm:rounded-full"
              :style="{
                width: row.pct + '%',
                background: 'var(--primary)',
                opacity: row.opacity,
              }"
            />
          </div>
          <span
            class="umm:font-bold umm:tabular-nums umm:text-primary-content"
            style="width: 64px; text-align: right"
            >{{ row.count.toLocaleString() }}</span
          >
          <span
            class="umm:font-medium umm:tabular-nums"
            :style="{
              width: '76px',
              textAlign: 'right',
              color: row.delta >= 0 ? 'var(--success-text)' : 'var(--error-text)',
            }"
          >
            {{ row.delta >= 0 ? '▲' : '▼' }} {{ Math.abs(row.delta).toLocaleString() }}
          </span>
        </div>
      </div>
      <div v-else class="umm:py-8 umm:text-center umm:font-caption umm:text-secondary-content">
        {{ t('common.noRecords') }}
      </div>
    </CardContent>
  </Card>
</template>
