<script setup lang="ts">
import { inject, computed, ref, type Ref } from 'vue'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { RefreshCw, AlertCircle } from 'lucide-vue-next'

const loading = inject<boolean>('loading', false)
const loadError = inject<string | null>('loadError', null)
const stats = inject<Ref<{ total: number; movie: number; tv: number; music: number }>>('stats', ref({ total: 0, movie: 0, tv: 0, music: 0 }))
const loadData = inject<() => Promise<void>>('loadData', async () => {})
const handleRefresh = inject<() => void>('handleRefresh', () => {})

const statsList = computed(() => [
  { label: '总计', value: stats.value.total },
  { label: '电影', value: stats.value.movie },
  { label: '剧集', value: stats.value.tv },
  { label: '音乐', value: stats.value.music },
])
</script>

<template>
  <Card>
    <CardHeader>
      <div class="flex items-center justify-between">
        <div>
          <CardTitle>记录概览</CardTitle>
          <CardDescription>您的媒体收藏统计</CardDescription>
        </div>
        <Button
          variant="ghost"
          size="sm"
          @click="handleRefresh"
          :disabled="loading"
          title="刷新数据"
        >
          <RefreshCw :class="['h-4 w-4', loading && 'animate-spin']" />
        </Button>
      </div>
    </CardHeader>
    <CardContent>
      <div v-if="loading" class="py-8 text-center text-muted-foreground">
        加载中...
      </div>

      <div v-else-if="loadError" class="py-8 text-center">
        <Alert variant="destructive" class="mb-4">
          <AlertCircle class="h-4 w-4" />
          <AlertTitle>加载失败</AlertTitle>
          <AlertDescription>{{ loadError }}</AlertDescription>
        </Alert>
        <Button @click="loadData" variant="outline">
          <RefreshCw class="mr-2 h-4 w-4" />
          重试
        </Button>
      </div>

      <div v-else>
        <div class="grid grid-cols-2 gap-4 mb-6">
          <Card v-for="stat in statsList" :key="stat.label" class="p-4">
            <div class="text-center">
              <div class="text-3xl font-bold tracking-tight">{{ stat.value }}</div>
              <div class="text-sm font-medium text-muted-foreground mt-1">{{ stat.label }}</div>
            </div>
          </Card>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
