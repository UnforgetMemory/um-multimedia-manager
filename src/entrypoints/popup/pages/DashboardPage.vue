<script setup lang="ts">
import { inject, computed, onMounted, ref } from 'vue'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Settings, Film, Tv, Music, ShieldAlert, ArrowUpRight } from 'lucide-vue-next'
import { safeSendMessage } from '@/utils/context'

const loadData = inject<() => Promise<void>>('loadData', async () => {})

const records = ref<any[]>([])
const javCount = ref(0)
const dataReady = ref(false)

const stats = computed(() => {
  let movie = 0, tv = 0, music = 0
  for (const r of records.value) {
    if (r.type === 'movie') movie++
    else if (r.type === 'tv') tv++
    else if (r.type === 'music') music++
  }
  return { total: records.value.length, movie, tv, music }
})

const appVersion = computed(() => { try { return chrome.runtime.getManifest().version } catch { return '3.0.0' } })

function openOptionsPage() {
  window.open(chrome.runtime.getURL('options.html'), '_blank')
}

onMounted(() => {
  loadData()
  Promise.all([
    safeSendMessage({ type: 'GET_ALL_RECORDS' }, { timeout: 10000, retries: 2 }),
    safeSendMessage({ type: 'ADULT_AV_GET_ALL' }, { timeout: 8000, retries: 1 }),
  ]).then(([recordsRes, javRes]) => {
    if (recordsRes?.success) records.value = recordsRes.records
    if (javRes?.success) javCount.value = (javRes.items || []).length
    dataReady.value = true
  }).catch(() => { dataReady.value = true })
})
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
        <Card class="p-3 text-center overflow-hidden">
          <CardContent class="p-0">
            <Film class="w-5 h-5 mx-auto mb-1.5 text-secondary-content" />
            <div class="text-xl sm:text-2xl font-bold tracking-tight text-primary-content truncate tabular-nums" :class="{ 'animate-pulse': !dataReady }">
              {{ dataReady ? stats.movie.toLocaleString() : '—' }}
            </div>
            <div class="text-xs-scaled text-secondary-content mt-1">电影</div>
          </CardContent>
        </Card>
        <Card class="p-3 text-center overflow-hidden">
          <CardContent class="p-0">
            <Tv class="w-5 h-5 mx-auto mb-1.5 text-secondary-content" />
            <div class="text-xl sm:text-2xl font-bold tracking-tight text-primary-content truncate tabular-nums" :class="{ 'animate-pulse': !dataReady }">
              {{ dataReady ? stats.tv.toLocaleString() : '—' }}
            </div>
            <div class="text-xs-scaled text-secondary-content mt-1">剧集</div>
          </CardContent>
        </Card>
        <Card class="p-3 text-center overflow-hidden">
          <CardContent class="p-0">
            <Music class="w-5 h-5 mx-auto mb-1.5 text-secondary-content" />
            <div class="text-xl sm:text-2xl font-bold tracking-tight text-primary-content truncate tabular-nums" :class="{ 'animate-pulse': !dataReady }">
              {{ dataReady ? stats.music.toLocaleString() : '—' }}
            </div>
            <div class="text-xs-scaled text-secondary-content mt-1">音乐</div>
          </CardContent>
        </Card>
        <Card class="p-3 text-center overflow-hidden">
          <CardContent class="p-0">
            <ShieldAlert class="w-5 h-5 mx-auto mb-1.5 text-secondary-content" />
            <div class="text-xl sm:text-2xl font-bold tracking-tight text-primary-content truncate tabular-nums" :class="{ 'animate-pulse': !dataReady }">
              {{ dataReady ? javCount.toLocaleString() : '—' }}
            </div>
            <div class="text-xs-scaled text-secondary-content mt-1">成人视频</div>
          </CardContent>
        </Card>
      </div>

      <!-- Total -->
      <Card class="mb-4 overflow-hidden">
        <CardContent class="flex items-center justify-between py-3 px-5">
          <span class="text-sm-scaled font-medium text-secondary-content">总记录</span>
          <span class="text-lg sm:text-xl font-bold tracking-tight text-primary-content truncate tabular-nums" :class="{ 'animate-pulse': !dataReady }">
            {{ dataReady ? (stats.total + javCount).toLocaleString() : '—' }}
          </span>
        </CardContent>
      </Card>

      <!-- CTA -->
      <Button @click="openOptionsPage" class="w-full" size="default">
        <Settings class="w-4 h-4 mr-2" />
        管理面板
        <ArrowUpRight class="w-3.5 h-3.5 ml-1.5 opacity-50" />
      </Button>
    </div>
  </div>
</template>
