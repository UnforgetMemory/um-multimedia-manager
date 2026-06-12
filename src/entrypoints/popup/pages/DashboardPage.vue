<script setup lang="ts">
import { inject, computed, onMounted, ref } from 'vue'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Settings, Film, Tv, Music, ListVideo, ArrowUpRight } from 'lucide-vue-next'
import { safeSendMessage } from '@/utils/context'

const loading = inject<boolean>('loading', false)
const loadData = inject<() => Promise<void>>('loadData', async () => {})

const records = ref<any[]>([])
const javCount = ref(0)

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

async function fetchData() {
  try {
    const [recordsRes, javRes] = await Promise.all([
      safeSendMessage({ type: 'GET_ALL_RECORDS' }, { timeout: 10000, retries: 2 }),
      safeSendMessage({ type: 'SEHUATANG_GET_ALL' }, { timeout: 8000, retries: 1 }),
    ])
    if (recordsRes?.success) records.value = recordsRes.records
    if (javRes?.success) javCount.value = (javRes.items || []).length
  } catch { /* silent */ }
}

onMounted(() => { loadData(); fetchData() })
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="flex items-center justify-between px-5 pt-4 pb-2">
      <h1 class="text-lg font-bold tracking-tight">UMM</h1>
      <span class="text-xs text-muted-foreground">v{{ appVersion }}</span>
    </div>

    <Separator />

    <!-- Content -->
    <div class="flex-1 px-5 py-4 overflow-y-auto">
      <div v-if="loading" class="py-12 text-center text-muted-foreground text-sm">加载中...</div>

      <template v-else>
        <!-- Stats Grid -->
        <div class="grid grid-cols-2 gap-3 mb-4">
          <Card class="p-3 text-center">
            <CardContent class="p-0">
              <Film class="w-5 h-5 mx-auto mb-1.5 text-muted-foreground" />
              <div class="text-2xl font-bold tracking-tight">{{ stats.movie.toLocaleString() }}</div>
              <div class="text-xs text-muted-foreground mt-1">电影</div>
            </CardContent>
          </Card>
          <Card class="p-3 text-center">
            <CardContent class="p-0">
              <Tv class="w-5 h-5 mx-auto mb-1.5 text-muted-foreground" />
              <div class="text-2xl font-bold tracking-tight">{{ stats.tv.toLocaleString() }}</div>
              <div class="text-xs text-muted-foreground mt-1">剧集</div>
            </CardContent>
          </Card>
          <Card class="p-3 text-center">
            <CardContent class="p-0">
              <Music class="w-5 h-5 mx-auto mb-1.5 text-muted-foreground" />
              <div class="text-2xl font-bold tracking-tight">{{ stats.music.toLocaleString() }}</div>
              <div class="text-xs text-muted-foreground mt-1">音乐</div>
            </CardContent>
          </Card>
          <Card class="p-3 text-center">
            <CardContent class="p-0">
              <ListVideo class="w-5 h-5 mx-auto mb-1.5 text-muted-foreground" />
              <div class="text-2xl font-bold tracking-tight">{{ javCount.toLocaleString() }}</div>
              <div class="text-xs text-muted-foreground mt-1">JavId</div>
            </CardContent>
          </Card>
        </div>

        <!-- Total -->
        <Card class="mb-4">
          <CardContent class="flex items-center justify-between py-3 px-5">
            <span class="text-sm font-medium text-muted-foreground">总记录</span>
            <span class="text-xl font-bold tracking-tight">{{ stats.total.toLocaleString() }}</span>
          </CardContent>
        </Card>

        <!-- CTA -->
        <Button @click="openOptionsPage" class="w-full" size="default">
          <Settings class="w-4 h-4 mr-2" />
          管理面板
          <ArrowUpRight class="w-3.5 h-3.5 ml-1.5 opacity-50" />
        </Button>
      </template>
    </div>
  </div>
</template>
