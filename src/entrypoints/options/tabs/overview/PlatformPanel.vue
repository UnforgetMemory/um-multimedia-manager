<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAppStore } from '@/store/app';
import type { RecordWithType } from '@/feature/composables/use-stats';
import { PLATFORM_HUES } from '@/feature/composables/use-platform-meta';
import { Card } from '@/libraries/ui/card';
import PlatformDistribution from '@/feature/PlatformDistribution.vue';
import { platformColor } from './bar-colors';

const { t } = useI18n();
const appStore = useAppStore();

interface PlatformStat {
  provider: string;
  count: number;
  types: { label: string; count: number }[];
}

const platformStats = computed<PlatformStat[]>(() => {
  const data = appStore.records as RecordWithType[];
  const map: Record<string, PlatformStat> = {};
  for (const r of data || []) {
    const provider: string = r.provider || r.storeName?.replace('_records', '') || 'unknown';
    if (!map[provider]) map[provider] = { provider, count: 0, types: [] };
    map[provider].count++;
    // Normalize Bilibili types: all Bilibili records are videos regardless of key prefix
    const rawType =
      r.type || (r.url?.includes('music') ? 'music' : r.url?.includes('book') ? 'book' : 'movie');
    const type = provider === 'bilibili' ? 'video' : provider === 'youtube' ? 'video' : rawType;
    const existing = map[provider].types.find((t) => t.label === type);
    if (existing) existing.count++;
    else map[provider].types.push({ label: type, count: 1 });
  }
  // Include adult AV items (javdb, sehuatang) in platform distribution
  for (const item of appStore.adultAvItems || []) {
    const provider = item.source;
    if (!map[provider]) map[provider] = { provider, count: 0, types: [] };
    map[provider].count++;
    const existing = map[provider].types.find((t) => t.label === 'jav');
    if (existing) existing.count++;
    else map[provider].types.push({ label: 'jav', count: 1 });
  }
  return Object.values(map).sort((a, b) => b.count - a.count);
});

const maxCount = computed(() => Math.max(1, ...platformStats.value.map((p) => p.count)));
</script>

<template vapor>
  <div>
    <h3 class="umm:font-h2 umm:text-primary-content umm:mb-3">
      {{ t('tab.platformDistribution') }}
    </h3>

    <!-- Summary bar chart -->
    <Card class="umm:mb-4">
      <div :style="{ padding: 'var(--umm-card-padding)' }">
        <div
          class="umm:flex umm:items-end"
          :style="{ gap: 'var(--umm-spacing-1)', height: '5rem' }"
        >
          <div
            v-for="info in platformStats"
            :key="info.provider"
            class="umm:flex-1 umm:rounded-t-md umm:transition-all umm:duration-500 umm:relative group umm:cursor-default"
            :style="{
              height: `${Math.max(8, (info.count / maxCount) * 100)}%`,
              backgroundColor: platformColor(PLATFORM_HUES[info.provider] || 0, 'bar'),
            }"
          >
            <div
              class="umm:absolute umm:-top-6 umm:left-1/2 umm:-translate-x-1/2 umm:text-xs umm:font-bold umm:text-primary-content umm:opacity-0 umm:group-hover:opacity-100 umm:transition-opacity umm:whitespace-nowrap umm:tabular-nums"
            >
              {{ info.count.toLocaleString() }}
            </div>
          </div>
        </div>
        <div
          class="umm:flex umm:items-end"
          :style="{ gap: 'var(--umm-spacing-1)', marginTop: 'var(--umm-spacing-1)' }"
        >
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

    <div
      v-if="platformStats.length === 0"
      class="umm:py-8 umm:text-center umm:font-body umm:text-secondary-content"
    >
      {{ t('common.noData') }}
    </div>
  </div>
</template>
