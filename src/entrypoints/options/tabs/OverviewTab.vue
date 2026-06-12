<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { RefreshCw, AlertCircle } from 'lucide-vue-next'
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

const stats = computed(() => {
  let movie = 0, tv = 0, music = 0
  for (const r of records.value) {
    if (r.type === 'movie') movie++
    else if (r.type === 'tv') tv++
    else if (r.type === 'music') music++
  }
  return { total: records.value.length, movie, tv, music }
})

const statsList = computed(() => [
  { label: '总计', value: stats.value.total },
  { label: '电影', value: stats.value.movie },
  { label: '剧集', value: stats.value.tv },
  { label: '音乐', value: stats.value.music },
])

const platformStats = computed(() => {
  const map: Record<string, number> = {}
  for (const r of records.value) {
    const key = `${r.type} / ${r.provider}`
    map[key] = (map[key] || 0) + 1
  }
  return Object.entries(map).sort((a, b) => b[1] - a[1])
})

async function loadData() {
  if (loading.value) return
  loading.value = true
  loadError.value = null
  try {
    const response = await safeSendMessage(
      { type: 'GET_ALL_RECORDS' },
      { timeout: 10000, retries: 2 }
    )
    if (!response?.success) throw new Error(response?.error || '获取数据失败')
    records.value = response.records
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
  <div class="space-y-[var(--section-gap)]">
    <div class="flex items-center justify-between">
      <h2 class="font-h1 text-primary-content">记录概览</h2>
      <Button variant="ghost" size="sm" @click="loadData" :disabled="loading">
        <RefreshCw :class="['h-4 w-4', loading && 'animate-spin']" />
      </Button>
    </div>

    <div v-if="loading" class="py-12 text-center text-secondary-content font-body">加载中...</div>

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

    <template v-else>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card v-for="stat in statsList" :key="stat.label" class="p-[var(--card-padding)]">
          <div class="text-center">
            <div class="font-display text-primary-content">{{ stat.value }}</div>
            <div class="font-caption text-secondary-content mt-1">{{ stat.label }}</div>
          </div>
        </Card>
      </div>

      <div>
        <h3 class="font-h2 text-primary-content mb-4">平台分布</h3>
        <div class="space-y-3">
          <div
            v-for="[platform, count] in platformStats"
            :key="platform"
            class="flex items-center justify-between rounded-md border border-border p-4"
          >
            <span class="font-body text-primary-content">{{ platform }}</span>
            <Badge variant="secondary" class="text-lg font-medium px-3 py-1">{{ count }}</Badge>
          </div>
          <div v-if="platformStats.length === 0" class="text-center py-8 text-secondary-content font-body">
            暂无数据
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
