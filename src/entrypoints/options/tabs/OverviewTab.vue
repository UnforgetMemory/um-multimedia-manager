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
const javCount = ref(0)
const dataReady = ref(false)

const stats = computed(() => {
  let movie = 0, tv = 0, music = 0
  for (const r of records.value) {
    if (r.type === 'movie') movie++
    else if (r.type === 'tv') tv++
    else if (r.type === 'music') music++
  }
  return { total: records.value.length, movie, tv, music, jav: javCount.value }
})

const platformStats = computed(() => {
  const map: Record<string, { count: number; type: string }> = {}
  for (const r of records.value) {
    const key = r.provider
    if (!map[key]) map[key] = { count: 0, type: r.type }
    map[key].count++
  }
  // Add JavId as a separate platform
  if (javCount.value > 0) {
    map['sehuatang'] = { count: javCount.value, type: '成人视频' }
  }
  return Object.entries(map).sort((a, b) => b[1].count - a[1].count)
})

const platformColors: Record<string, string> = {
  douban: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20',
  imdb: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20',
  neodb: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  tmdb: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
  sehuatang: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
}

const platformLabels: Record<string, string> = {
  douban: '豆瓣',
  imdb: 'IMDb',
  neodb: 'NeoDB',
  tmdb: 'TMDB',
  sehuatang: '色花堂',
}

const statIcons = [Film, Tv, Music, ShieldAlert]
const statLabels = ['电影', '剧集', '音乐', '成人视频']
const statKeys = ['movie', 'tv', 'music', 'jav'] as const

async function loadData() {
  if (loading.value) return
  loading.value = true
  loadError.value = null
  try {
    const [recordsRes, javRes] = await Promise.all([
      safeSendMessage({ type: 'GET_ALL_RECORDS' }, { timeout: 10000, retries: 2 }),
      safeSendMessage({ type: 'SEHUATANG_GET_ALL' }, { timeout: 8000, retries: 1 }),
    ])
    if (!recordsRes?.success) throw new Error(recordsRes?.error || '获取数据失败')
    records.value = recordsRes.records
    if (javRes?.success) javCount.value = (javRes.items || []).length
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
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div
            v-for="[provider, info] in platformStats"
            :key="provider"
            :class="[
              'flex items-center gap-3 rounded-lg border p-3 transition-colors',
              platformColors[provider] || 'bg-muted/50 text-muted-foreground border-border'
            ]"
          >
            <div class="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0"
              :class="platformColors[provider] || 'bg-muted'">
              {{ (platformLabels[provider] || provider).charAt(0) }}
            </div>
            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium truncate">{{ platformLabels[provider] || provider }}</div>
              <div class="text-xs opacity-60">{{ info.type }}</div>
            </div>
            <span class="text-lg font-bold tabular-nums shrink-0">{{ info.count.toLocaleString() }}</span>
          </div>
        </div>
        <div v-if="platformStats.length === 0" class="text-center py-8 text-secondary-content text-sm">
          暂无数据
        </div>
      </div>
    </template>
  </div>
</template>
