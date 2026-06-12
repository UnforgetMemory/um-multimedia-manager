<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { RefreshCw, AlertCircle, Film, Tv, Music, ShieldAlert, Database } from 'lucide-vue-next'
import { safeSendMessage } from '@/utils/context'

interface DisplayRecord {
  type: string
  provider: string
  providerId: string
  rating: number
  status: number
}

const loading = ref(false)
const loadError = ref<string | null>(null)
const records = ref<DisplayRecord[]>([])
const adultAvItems = ref<any[]>([])
const dataReady = ref(false)

const stats = computed(() => {
  let movie = 0, tv = 0, music = 0
  for (const r of records.value) {
    if (r.type === 'movie') movie++
    else if (r.type === 'tv') tv++
    else if (r.type === 'music') music++
  }
  return { total: records.value.length + adultAvItems.value.length, movie, tv, music, jav: adultAvItems.value.length }
})

const platformStats = computed(() => {
  const map: Record<string, { count: number; typeCounts: Record<string, number> }> = {}
  for (const r of records.value) {
    const key = r.provider
    if (!map[key]) map[key] = { count: 0, typeCounts: {} }
    map[key].count++
    map[key].typeCounts[r.type] = (map[key].typeCounts[r.type] || 0) + 1
  }
  // Add adult AV sources from jav_ids store
  for (const item of adultAvItems.value) {
    const key = item.source
    if (!map[key]) map[key] = { count: 0, typeCounts: {} }
    map[key].count++
    map[key].typeCounts['成人视频'] = (map[key].typeCounts['成人视频'] || 0) + 1
  }
  return Object.entries(map)
    .map(([provider, info]) => ({
      provider,
      count: info.count,
      types: Object.entries(info.typeCounts)
        .map(([type, count]) => ({ label: typeLabels[type] || type, count }))
        .sort((a, b) => b.count - a.count),
    }))
    .sort((a, b) => b.count - a.count)
})

const typeLabels: Record<string, string> = {
  movie: '电影',
  tv: '剧集',
  music: '音乐',
  book: '书籍',
}

const platformLabels: Record<string, string> = {
  douban: '豆瓣',
  imdb: 'IMDb',
  neodb: 'NeoDB',
  tmdb: 'TMDB',
  javdb: 'JavDB',
  sehuatang: '色花堂',
}

const platformHues: Record<string, number> = {
  douban: 142,
  imdb: 45,
  neodb: 217,
  tmdb: 271,
  javdb: 0,
  sehuatang: 25,
}

const maxCount = computed(() => {
  if (platformStats.value.length === 0) return 1
  return Math.max(...platformStats.value.map(p => p.count))
})

const statIcons = [Film, Tv, Music, ShieldAlert]
const statLabels = ['电影', '剧集', '音乐', '成人视频']
const statKeys = ['movie', 'tv', 'music', 'jav'] as const

async function loadData() {
  if (loading.value) return
  loading.value = true
  loadError.value = null
  try {
    const [recordsRes, adultAvRes] = await Promise.all([
      safeSendMessage({ type: 'GET_ALL_RECORDS' }, { timeout: 10000, retries: 2 }),
      safeSendMessage({ type: 'ADULT_AV_GET_ALL' }, { timeout: 8000, retries: 1 }),
    ])
    if (!recordsRes?.success) throw new Error(recordsRes?.error || '获取数据失败')
    records.value = recordsRes.records
    if (adultAvRes?.success) adultAvItems.value = adultAvRes.items || []
    dataReady.value = true
    dataReady.value = true
  } catch {
    records.value = []
    loadError.value = '数据加载失败，请重试'
  } finally {
    loading.value = false
  }
}

onMounted(loadData)
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h2 class="font-h1 text-primary-content">记录概览</h2>
      <Button variant="ghost" size="sm" @click="loadData" :disabled="loading">
        <RefreshCw :class="['h-4 w-4', loading && 'animate-spin']" />
      </Button>
    </div>

    <!-- Skeleton -->
    <div v-if="!dataReady && !loadError" class="space-y-6">
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div v-for="i in 4" :key="i" class="h-24 bg-muted rounded-xl animate-pulse"></div>
      </div>
      <div class="h-48 bg-muted rounded-xl animate-pulse"></div>
    </div>

    <!-- Error -->
    <div v-else-if="loadError" class="py-12 text-center">
      <Alert variant="destructive" class="mb-4">
        <AlertCircle class="h-4 w-4" />
        <AlertTitle>加载失败</AlertTitle>
        <AlertDescription>{{ loadError }}</AlertDescription>
      </Alert>
      <Button @click="loadData" variant="outline">
        <RefreshCw class="mr-2 h-4 w-4" />重试
      </Button>
    </div>

    <!-- Content -->
    <template v-else>
      <!-- Stats Grid -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card v-for="(key, i) in statKeys" :key="key" class="p-4 text-center overflow-hidden">
          <component :is="statIcons[i]" class="w-5 h-5 mx-auto mb-2 text-muted-foreground" />
          <div class="text-xl sm:text-2xl font-bold tracking-tight text-primary-content truncate">
            {{ stats[key].toLocaleString() }}
          </div>
          <div class="text-xs text-secondary-content mt-1">{{ statLabels[i] }}</div>
        </Card>
      </div>

      <!-- Total -->
      <Card class="overflow-hidden">
        <div class="flex items-center justify-between p-4">
          <div class="flex items-center gap-2">
            <Database class="w-4 h-4 text-muted-foreground" />
            <span class="text-sm font-medium text-secondary-content">总记录</span>
          </div>
          <span class="text-lg sm:text-xl font-bold tracking-tight text-primary-content truncate">
            {{ stats.total.toLocaleString() }}
          </span>
        </div>
      </Card>

      <!-- Platform Distribution — Visual Layout -->
      <div>
        <h3 class="font-h2 text-primary-content mb-3">平台分布</h3>

        <!-- Summary bar chart -->
        <Card class="overflow-hidden mb-4">
          <div class="p-4">
            <div class="flex items-end gap-1 h-20">
              <div
                v-for="info in platformStats"
                :key="info.provider"
                class="flex-1 rounded-t-md transition-all duration-500 relative group cursor-default"
                :style="{
                  height: `${Math.max(8, (info.count / maxCount) * 100)}%`,
                  backgroundColor: `hsl(${platformHues[info.provider] || 0}, 60%, 50%)`,
                }"
              >
                <div class="absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-bold text-primary-content opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                  {{ info.count.toLocaleString() }}
                </div>
              </div>
            </div>
            <div class="flex items-end gap-1 mt-1">
              <div
                v-for="info in platformStats"
                :key="info.provider + '-label'"
                class="flex-1 text-center text-xs text-secondary-content truncate"
              >
                {{ platformLabels[info.provider] || info.provider }}
              </div>
            </div>
          </div>
        </Card>

        <!-- Detailed cards -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div
            v-for="info in platformStats"
            :key="info.provider"
            class="rounded-lg border border-border bg-card p-4 transition-all hover:shadow-md hover:border-primary/30"
          >
            <div class="flex items-center justify-between mb-3">
              <div class="flex items-center gap-2">
                <div
                  class="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0"
                  :style="{ backgroundColor: `hsl(${platformHues[info.provider] || 0}, 60%, 45%)` }"
                >
                  {{ (platformLabels[info.provider] || info.provider).charAt(0) }}
                </div>
                <div>
                  <div class="text-sm font-semibold text-primary-content">{{ platformLabels[info.provider] || info.provider }}</div>
                  <div class="text-xs text-secondary-content">{{ info.count.toLocaleString() }} 条记录</div>
                </div>
              </div>
              <!-- Progress bar -->
              <div class="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  class="h-full rounded-full transition-all duration-700"
                  :style="{
                    width: `${(info.count / stats.total) * 100}%`,
                    backgroundColor: `hsl(${platformHues[info.provider] || 0}, 60%, 50%)`,
                  }"
                />
              </div>
            </div>
            <!-- Type breakdown -->
            <div class="flex flex-wrap gap-1.5">
              <span
                v-for="t in info.types"
                :key="t.label"
                class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border"
                :style="{
                  borderColor: `hsl(${platformHues[info.provider] || 0}, 40%, 70%)`,
                  color: `hsl(${platformHues[info.provider] || 0}, 50%, 40%)`,
                  backgroundColor: `hsl(${platformHues[info.provider] || 0}, 50%, 95%)`,
                }"
              >
                <span class="font-medium">{{ t.label }}</span>
                <span class="opacity-70">{{ t.count }}</span>
              </span>
            </div>
          </div>
        </div>

        <div v-if="platformStats.length === 0" class="text-center py-8 text-secondary-content text-sm">
          暂无数据
        </div>
      </div>
    </template>
  </div>
</template>
