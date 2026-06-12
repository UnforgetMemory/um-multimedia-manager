<script setup lang="ts">
import { inject, computed, onMounted, ref } from 'vue'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Settings } from 'lucide-vue-next'
import { safeSendMessage } from '@/utils/context'

interface DisplayRecord {
  type: string
  provider: string
  providerId: string
  rating: number
  status: number
}

const loading = inject<boolean>('loading', false)
const loadData = inject<() => Promise<void>>('loadData', async () => {})

const records = ref<DisplayRecord[]>([])
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
const recentRecords = computed(() => records.value.slice(0, 5))

function getPlatformLabel(provider: string): string {
  return ({ douban: '豆瓣', imdb: 'IMDb', neodb: 'NeoDB', tmdb: 'TMDB' } as Record<string, string>)[provider] || provider
}

function openOptionsPage() {
  window.open(chrome.runtime.getURL('options.html'), '_blank')
}

async function fetchData() {
  try {
    const response = await safeSendMessage({ type: 'GET_ALL_RECORDS' }, { timeout: 10000, retries: 2 })
    if (response?.success) records.value = response.records
  } catch { /* silent */ }
}

onMounted(() => { loadData(); fetchData() })
</script>

<template>
  <div class="min-h-screen bg-background">
    <div class="mx-auto px-[var(--page-margin)] py-6" style="max-width: var(--popup-max-width)">
      <div class="flex items-center justify-between mb-8">
        <h1 class="font-h1 tracking-tight">UMM</h1>
        <span class="font-caption text-secondary-content">v{{ appVersion }}</span>
      </div>

      <div v-if="loading" class="py-12 text-center text-secondary-content font-body">加载中...</div>

      <template v-else>
        <div class="grid grid-cols-2 gap-4 mb-[var(--section-gap)]">
          <div class="rounded-xl border border-border p-[var(--card-padding)] text-center">
            <div class="font-display text-primary-content">{{ stats.movie }}</div>
            <div class="font-caption text-secondary-content mt-1">电影</div>
          </div>
          <div class="rounded-xl border border-border p-[var(--card-padding)] text-center">
            <div class="font-display text-primary-content">{{ stats.tv }}</div>
            <div class="font-caption text-secondary-content mt-1">剧集</div>
          </div>
          <div class="rounded-xl border border-border p-[var(--card-padding)] text-center">
            <div class="font-display text-primary-content">{{ stats.music }}</div>
            <div class="font-caption text-secondary-content mt-1">音乐</div>
          </div>
          <div class="rounded-xl border border-border p-[var(--card-padding)] text-center">
            <div class="font-display text-primary-content">{{ records.length }}</div>
            <div class="font-caption text-secondary-content mt-1">已关联</div>
          </div>
        </div>

        <div v-if="recentRecords.length > 0" class="mb-[var(--section-gap)]">
          <h2 class="font-h2 text-primary-content mb-4">最近记录</h2>
          <div class="space-y-2">
            <div v-for="(record, i) in recentRecords" :key="i" class="flex items-center justify-between rounded-lg border border-border px-4 py-3">
              <div class="flex items-center gap-3">
                <Badge variant="outline" class="text-xs">{{ getPlatformLabel(record.provider) }}</Badge>
                <span class="font-body text-primary-content">{{ record.type }}</span>
                <span class="font-mono text-secondary-content text-xs">{{ record.providerId }}</span>
              </div>
              <span v-if="record.rating" class="font-caption text-primary">★ {{ record.rating }}</span>
            </div>
          </div>
        </div>

        <Button @click="openOptionsPage" class="w-full" size="lg">
          <Settings class="mr-2 h-4 w-4" />管理面板
        </Button>
      </template>

      <div class="mt-8 pt-4 border-t border-border text-center">
        <span class="font-caption text-tertiary-content">{{ records.length }} 条记录 · v{{ appVersion }}</span>
      </div>
    </div>
  </div>
</template>
