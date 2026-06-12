<script setup lang="ts">
import { inject, computed, onMounted, ref } from 'vue'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Settings, Film, Tv, Music, Link } from 'lucide-vue-next'
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
const recentRecords = computed(() => records.value.slice(0, 8))

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
  <div style="background: linear-gradient(135deg, hsl(var(--background)) 0%, hsl(var(--muted)) 100%); min-height: 100%;">
    <div style="padding: 16px 20px; max-width: 560px; margin: 0 auto; display: flex; flex-direction: column; height: 468px;">

      <!-- Header -->
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
        <div style="display: flex; align-items: baseline; gap: 8px;">
          <h1 style="font-size: 1.25rem; font-weight: 700; letter-spacing: -0.025em; color: hsl(var(--foreground));">UMM</h1>
          <span style="font-size: 0.7rem; color: hsl(var(--muted-foreground));">v{{ appVersion }}</span>
        </div>
        <Badge variant="outline" class="text-xs">{{ stats.total.toLocaleString() }} 条</Badge>
      </div>

      <!-- Loading -->
      <div v-if="loading" style="flex: 1; display: flex; align-items: center; justify-content: center; color: hsl(var(--muted-foreground));">
        加载中...
      </div>

      <template v-else>
        <!-- Stats Grid -->
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 14px;">
          <div style="background: hsl(var(--card)); border: 1px solid hsl(var(--border)); border-radius: 10px; padding: 10px 8px; text-align: center;">
            <div style="display: flex; align-items: center; justify-content: center; gap: 4px; margin-bottom: 2px;">
              <Film style="width: 12px; height: 12px; color: hsl(var(--muted-foreground));" />
              <span style="font-size: 0.65rem; color: hsl(var(--muted-foreground)); font-weight: 500;">电影</span>
            </div>
            <div style="font-size: 1.5rem; font-weight: 700; color: hsl(var(--foreground)); line-height: 1.1;">{{ stats.movie.toLocaleString() }}</div>
          </div>
          <div style="background: hsl(var(--card)); border: 1px solid hsl(var(--border)); border-radius: 10px; padding: 10px 8px; text-align: center;">
            <div style="display: flex; align-items: center; justify-content: center; gap: 4px; margin-bottom: 2px;">
              <Tv style="width: 12px; height: 12px; color: hsl(var(--muted-foreground));" />
              <span style="font-size: 0.65rem; color: hsl(var(--muted-foreground)); font-weight: 500;">剧集</span>
            </div>
            <div style="font-size: 1.5rem; font-weight: 700; color: hsl(var(--foreground)); line-height: 1.1;">{{ stats.tv.toLocaleString() }}</div>
          </div>
          <div style="background: hsl(var(--card)); border: 1px solid hsl(var(--border)); border-radius: 10px; padding: 10px 8px; text-align: center;">
            <div style="display: flex; align-items: center; justify-content: center; gap: 4px; margin-bottom: 2px;">
              <Music style="width: 12px; height: 12px; color: hsl(var(--muted-foreground));" />
              <span style="font-size: 0.65rem; color: hsl(var(--muted-foreground)); font-weight: 500;">音乐</span>
            </div>
            <div style="font-size: 1.5rem; font-weight: 700; color: hsl(var(--foreground)); line-height: 1.1;">{{ stats.music.toLocaleString() }}</div>
          </div>
          <div style="background: hsl(var(--card)); border: 1px solid hsl(var(--border)); border-radius: 10px; padding: 10px 8px; text-align: center;">
            <div style="display: flex; align-items: center; justify-content: center; gap: 4px; margin-bottom: 2px;">
              <Link style="width: 12px; height: 12px; color: hsl(var(--muted-foreground));" />
              <span style="font-size: 0.65rem; color: hsl(var(--muted-foreground)); font-weight: 500;">关联</span>
            </div>
            <div style="font-size: 1.5rem; font-weight: 700; color: hsl(var(--foreground)); line-height: 1.1;">{{ stats.total.toLocaleString() }}</div>
          </div>
        </div>

        <!-- Recent Records -->
        <div v-if="recentRecords.length > 0" style="flex: 1; overflow-y: auto; margin-bottom: 12px;">
          <h2 style="font-size: 0.75rem; font-weight: 600; color: hsl(var(--muted-foreground)); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px;">最近记录</h2>
          <div style="display: flex; flex-direction: column; gap: 4px;">
            <div
              v-for="(record, i) in recentRecords"
              :key="i"
              style="display: flex; align-items: center; justify-content: space-between; background: hsl(var(--card)); border: 1px solid hsl(var(--border)); border-radius: 8px; padding: 6px 10px;"
            >
              <div style="display: flex; align-items: center; gap: 8px; min-width: 0;">
                <span style="font-size: 0.6rem; font-weight: 600; color: hsl(var(--primary)); background: hsl(var(--muted)); padding: 1px 5px; border-radius: 4px; white-space: nowrap;">{{ getPlatformLabel(record.provider) }}</span>
                <span style="font-size: 0.7rem; color: hsl(var(--muted-foreground));">{{ record.type }}</span>
                <span style="font-size: 0.65rem; color: hsl(var(--muted-foreground) / 0.6); font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{ record.providerId }}</span>
              </div>
              <span v-if="record.rating" style="font-size: 0.7rem; font-weight: 600; color: hsl(var(--primary)); white-space: nowrap;">★ {{ record.rating }}</span>
            </div>
          </div>
        </div>

        <!-- CTA Button -->
        <Button @click="openOptionsPage" class="w-full" size="sm" style="margin-top: auto;">
          <Settings class="mr-1.5 h-3.5 w-3.5" />管理面板
        </Button>
      </template>

    </div>
  </div>
</template>
