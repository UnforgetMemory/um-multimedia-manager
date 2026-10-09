<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAppStore } from '@/store/app';

import { Button } from '@/libraries/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/libraries/ui/alert';
import SegmentedControl from '@/libraries/ui/segmented-control/SegmentedControl.vue';
import { AlertCircle, RefreshCw } from '@/libraries/ui/icons';
import OverviewStatsPanel from './overview/OverviewStatsPanel.vue';
import WeeklyPanel from './overview/WeeklyPanel.vue';
import PlatformPanel from './overview/PlatformPanel.vue';

const { t } = useI18n();
const appStore = useAppStore();

const activeOverviewTab = ref<'overview' | 'weekly' | 'platform'>('overview');

const overviewTabs = computed(() => [
  { id: 'overview' as const, label: t('tab.overview') as string },
  { id: 'weekly' as const, label: t('tab.weekly') as string },
  { id: 'platform' as const, label: t('tab.platform') as string },
]);

const tooltipData = ref<{ show: boolean; x: number; y: number; text: string }>({
  show: false,
  x: 0,
  y: 0,
  text: '',
});

onMounted(async () => {
  await appStore.loadData();
});
</script>

<template vapor>
  <div class="umm:flex umm:flex-col umm:gap-6">
    <!-- Skeleton -->
    <div v-if="!appStore.dataReady && !appStore.error" class="umm:flex umm:flex-col umm:gap-6">
      <div
        class="umm:grid umm:grid-cols-2 umm:lg:grid-cols-4"
        :style="{ gap: 'var(--umm-section-gap)' }"
      >
        <div
          v-for="i in 5"
          :key="i"
          class="umm:h-28 umm:bg-muted umm:rounded-xl umm:animate-pulse"
        ></div>
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
        <Button
          variant="ghost"
          size="sm"
          :aria-label="t('common.refresh')"
          @click="appStore.loadData"
          :disabled="appStore.loading"
        >
          <RefreshCw :class="['umm:h-4 umm:w-4', appStore.loading && 'umm:animate-spin']" />
        </Button>
      </div>

      <!-- Tab: Overview (Stats + Heatmap) -->
      <div v-if="activeOverviewTab === 'overview'" class="umm:flex umm:flex-col umm:gap-6">
        <OverviewStatsPanel />
      </div>
      <!-- end overview tab -->

      <!-- Tab: Weekly Detail -->
      <div v-if="activeOverviewTab === 'weekly'" class="umm:flex umm:flex-col umm:gap-6">
        <WeeklyPanel />
      </div>
      <!-- end weekly tab -->

      <!-- Tab: Platform Distribution -->
      <div v-if="activeOverviewTab === 'platform'" class="umm:flex umm:flex-col umm:gap-6">
        <PlatformPanel />
      </div>
      <!-- end platform tab -->
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
          background: 'var(--popover)',
          color: 'var(--popover-foreground)',
          border: '1px solid var(--border)',
        }"
      >
        {{ tooltipData.text }}
      </div>
    </Teleport>
  </div>
</template>
