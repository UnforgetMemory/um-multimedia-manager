<script setup lang="ts">
import { inject, computed, ref, type Ref } from 'vue'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { RefreshCw, AlertCircle } from 'lucide-vue-next'

const loading = inject<boolean>('loading', false)
const loadError = inject<string | null>('loadError', null)
const records = inject<Ref<Array<{ type: string; provider: string }>>>('records', ref([]))
const loadData = inject<() => Promise<void>>('loadData', async () => {})

const platformStats = computed(() => {
  const stats: Record<string, number> = {}

  for (const record of records.value) {
    const key = `${record.type} / ${record.provider}`
    stats[key] = (stats[key] || 0) + 1
  }

  return Object.entries(stats)
    .sort((a, b) => b[1] - a[1])
    .reduce((obj, [key, value]) => {
      obj[key] = value
      return obj
    }, {} as Record<string, number>)
})
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>平台分布</CardTitle>
      <CardDescription>各媒体平台的详细统计</CardDescription>
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

      <div v-else class="space-y-3">
        <div
          v-for="[platform, count] in Object.entries(platformStats)"
          :key="platform"
          class="flex items-center justify-between rounded-md border border-border p-4"
        >
          <span class="text-lg font-medium">{{ platform }}</span>
          <Badge variant="secondary" class="text-lg font-medium px-3 py-1">
            {{ count }}
          </Badge>
        </div>

        <div v-if="Object.keys(platformStats).length === 0" class="text-center py-8 text-muted-foreground">
          暂无数据
        </div>
      </div>
    </CardContent>
  </Card>
</template>
