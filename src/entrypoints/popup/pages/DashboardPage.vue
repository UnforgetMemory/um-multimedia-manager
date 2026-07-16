<script setup lang="ts">
import { onMounted } from 'vue'
import { useAppStore } from '@/stores/app'
import { useStats, type RecordWithType } from '@/composables/useStats'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import StatCard from '@/shared/StatCard.vue'
import { Card, CardContent } from '@/shared/ui/card'
import { Button } from '@/shared/ui/button'
import { Separator } from '@/shared/ui/separator'
import { Settings, Film, Tv, Music, Book, Gamepad2, ShieldAlert, ArrowUpRight, Play } from 'lucide-vue-next'

const { t } = useI18n()
const appStore = useAppStore()
const { dataReady, appVersion } = storeToRefs(appStore)
const { stats } = useStats(
  () => (appStore.records as RecordWithType[]),
  () => appStore.adultAvItems,
)

function openOptionsPage() {
  window.open(chrome.runtime.getURL('options.html'), '_blank')
}

onMounted(async () => {
  appStore.loadData()

  // Bilibili injection now handled by standalone content script in bilibili-test.js
})
</script>

<template>
  <div class="umm:flex umm:flex-col umm:h-full">
    <div class="umm:flex umm:items-center umm:justify-between umm:px-5 umm:pt-4 umm:pb-2">
      <h1 class="umm:text-base umm:font-bold umm:tracking-tight umm:text-primary-content">UMManager</h1>
      <span class="umm:font-caption umm:text-secondary-content">v{{ appVersion }}</span>
    </div>

    <Separator />

    <div class="umm:flex-1 umm:px-5 umm:py-4 umm:overflow-y-auto">
      <div class="umm:grid umm:grid-cols-4 umm:gap-3 umm:mb-4">
        <StatCard :icon="Film" :label="t('stats.movie')" :value="stats.movie" :loading="!dataReady" />
        <StatCard :icon="Tv" :label="t('stats.tv')" :value="stats.tv" :loading="!dataReady" />
        <StatCard :icon="Music" :label="t('stats.music')" :value="stats.music" :loading="!dataReady" />
        <StatCard :icon="Book" :label="t('stats.book')" :value="stats.book" :loading="!dataReady" />
        <StatCard :icon="Gamepad2" :label="t('stats.game')" :value="stats.game" :loading="!dataReady" />
        <StatCard :icon="ShieldAlert" :label="t('stats.jav')" :value="stats.jav" :loading="!dataReady" />
        <StatCard :icon="Play" :label="t('stats.bilibili')" :value="stats.bilibili" :loading="!dataReady" />
        <StatCard :icon="Play" :label="t('stats.youtube')" :value="stats.youtube" :loading="!dataReady" />
      </div>

      <Card class="umm:mb-4 umm:overflow-hidden">
        <CardContent class="umm:flex umm:items-center umm:justify-between umm:py-3 umm:px-5">
          <span class="umm:text-sm umm:font-medium umm:text-secondary-content">{{ t('stats.total') }}</span>
          <span class="umm:text-base umm:sm:text-lg umm:font-bold umm:tracking-tight umm:text-primary-content umm:truncate umm:tabular-nums" :class="{ 'umm:animate-pulse': !dataReady }">
            {{ dataReady ? stats.total.toLocaleString() : '—' }}
          </span>
        </CardContent>
      </Card>

      <Button @click="openOptionsPage" class="umm:w-full umm:gap-2" size="default">
        <Settings class="umm:w-4 umm:h-4" />
        {{ t('nav.managementPanel') }}
        <ArrowUpRight class="umm:w-3.5 umm:h-3.5 umm:ml-1.5 umm:opacity-50" />
      </Button>
    </div>
  </div>
</template>
