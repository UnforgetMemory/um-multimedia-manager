<script setup lang="ts">
import { inject, computed, onMounted, ref } from 'vue'
import { Button } from '@/components/ui/button'
import { Settings, Film, Tv, Music, ArrowUpRight } from 'lucide-vue-next'
import { safeSendMessage } from '@/utils/context'

const loading = inject<boolean>('loading', false)
const loadData = inject<() => Promise<void>>('loadData', async () => {})

const records = ref<any[]>([])
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
    const response = await safeSendMessage({ type: 'GET_ALL_RECORDS' }, { timeout: 10000, retries: 2 })
    if (response?.success) records.value = response.records
  } catch { /* silent */ }
}

onMounted(() => { loadData(); fetchData() })
</script>

<template>
  <div class="min-h-screen bg-background text-foreground" style="padding: 24px 28px; max-width: 560px; margin: 0 auto;">

    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-lg font-bold tracking-tight">UMM</h1>
        <p class="text-xs text-muted-foreground mt-0.5">Unified Multimedia Manager</p>
      </div>
      <span class="text-xs text-muted-foreground font-mono">v{{ appVersion }}</span>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="py-16 text-center text-muted-foreground text-sm">加载中...</div>

    <template v-else>
      <!-- Hero stat -->
      <div class="text-center mb-8">
        <div class="text-5xl font-extrabold tracking-tight text-foreground leading-none">
          {{ stats.total.toLocaleString() }}
        </div>
        <div class="text-xs text-muted-foreground mt-2 uppercase tracking-widest">总记录</div>
      </div>

      <!-- Stats row -->
      <div class="grid grid-cols-3 gap-3 mb-8">
        <div class="text-center p-4 rounded-xl border border-border bg-card">
          <Film class="w-5 h-5 mx-auto mb-2 text-muted-foreground" />
          <div class="text-xl font-bold text-foreground">{{ stats.movie.toLocaleString() }}</div>
          <div class="text-xs text-muted-foreground mt-1">电影</div>
        </div>
        <div class="text-center p-4 rounded-xl border border-border bg-card">
          <Tv class="w-5 h-5 mx-auto mb-2 text-muted-foreground" />
          <div class="text-xl font-bold text-foreground">{{ stats.tv.toLocaleString() }}</div>
          <div class="text-xs text-muted-foreground mt-1">剧集</div>
        </div>
        <div class="text-center p-4 rounded-xl border border-border bg-card">
          <Music class="w-5 h-5 mx-auto mb-2 text-muted-foreground" />
          <div class="text-xl font-bold text-foreground">{{ stats.music.toLocaleString() }}</div>
          <div class="text-xs text-muted-foreground mt-1">音乐</div>
        </div>
      </div>

      <!-- CTA -->
      <Button @click="openOptionsPage" class="w-full" size="sm">
        <Settings class="w-4 h-4 mr-1.5" />
        管理面板
        <ArrowUpRight class="w-3 h-3 ml-1 opacity-50" />
      </Button>
    </template>

    <!-- Footer -->
    <div class="mt-6 pt-4 border-t border-border text-center">
      <span class="text-xs text-muted-foreground">UMM · v{{ appVersion }}</span>
    </div>
  </div>
</template>
