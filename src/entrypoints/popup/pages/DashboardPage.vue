<script setup lang="ts">
import { onMounted } from 'vue'
import { useAppStore } from '@/stores/app'
import { useStats } from '@/composables/useStats'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import StatCard from '@/components/StatCard.vue'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Settings, Film, Tv, Music, ShieldAlert, ArrowUpRight } from 'lucide-vue-next'

const { t } = useI18n()
const appStore = useAppStore()
const { dataReady, appVersion } = storeToRefs(appStore)
const { stats } = useStats(
  () => appStore.records as any,
  () => appStore.adultAvItems as any,
)

function openOptionsPage() {
  window.open(chrome.runtime.getURL('options.html'), '_blank')
}

onMounted(() => appStore.loadData())
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="flex items-center justify-between px-5 pt-4 pb-2">
      <h1 class="text-lg font-bold tracking-tight">UMManager</h1>
      <span class="text-xs-scaled text-secondary-content">v{{ appVersion }}</span>
    </div>

    <Separator />

    <!-- Content -->
    <div class="flex-1 px-5 py-4 overflow-y-auto">
      <!-- Stats Grid -->
      <div class="grid grid-cols-2 gap-3 mb-4">
        <StatCard :icon="Film" :label="t('stats.movie')" :value="stats.movie" :loading="!dataReady" />
        <StatCard :icon="Tv" :label="t('stats.tv')" :value="stats.tv" :loading="!dataReady" />
        <StatCard :icon="Music" :label="t('stats.music')" :value="stats.music" :loading="!dataReady" />
        <StatCard :icon="ShieldAlert" :label="t('stats.jav')" :value="stats.jav" :loading="!dataReady" />
      </div>

      <!-- Total -->
      <Card class="mb-4 overflow-hidden">
        <CardContent class="flex items-center justify-between py-3 px-5">
          <span class="text-sm-scaled font-medium text-secondary-content">{{ t('stats.total') }}</span>
          <span class="text-lg sm:text-xl font-bold tracking-tight text-primary-content truncate tabular-nums" :class="{ 'animate-pulse': !dataReady }">
            {{ dataReady ? stats.total.toLocaleString() : '—' }}
          </span>
        </CardContent>
      </Card>

      <!-- CTA -->
      <Button @click="openOptionsPage" class="w-full" size="default">
        <Settings class="w-4 h-4 mr-2" />
         {{ t('nav.managementPanel') }}
        <ArrowUpRight class="w-3.5 h-3.5 ml-1.5 opacity-50" />
      </Button>
    </div>
  </div>
</template>
