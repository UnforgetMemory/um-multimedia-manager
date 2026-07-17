<template>
  <div>
    <UmmPageHeader title="仪表盘" description="数据概览与最近活动" />

    <!-- Stats Cards -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
      <UmmStatCard label="记录总数" :value="stats.total" subtext="所有平台汇总" />
      <UmmStatCard label="已完成" :value="stats.done" color="success" subtext="已标记完成" />
      <UmmStatCard label="待处理" :value="stats.pending" color="warning" subtext="进行中/想看" />
    </div>

    <!-- Empty State -->
    <UCard v-if="stats.total === 0 && !loading">
      <template #default>
        <div class="py-12 text-center">
          <UIcon name="i-lucide-file-text" class="mx-auto h-10 w-10 text-neutral-400 dark:text-neutral-500 mb-3" />
          <p class="text-sm text-neutral-600 dark:text-neutral-400">暂无数据</p>
          <p class="mt-1 text-xs text-neutral-500 dark:text-neutral-500 max-w-xs mx-auto">
            使用浏览器扩展标记内容后，数据将通过同步功能显示在这里。
          </p>
        </div>
      </template>
    </UCard>

    <!-- Loading State -->
    <div v-if="loading" class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <USkeleton v-for="n in 3" :key="n" class="h-24" />
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: 'auth', layout: 'dashboard' })

const stats = ref({ total: 0, done: 0, pending: 0 })
const loading = ref(true)

async function loadStats() {
  try {
    const [itemsData, marksData] = await Promise.all([
      $fetch<{ pagination: { total: number } }>('/api/items', { query: { limit: '1' } }),
      $fetch<{ marks: { status: number }[] }>('/api/marks'),
    ])
    stats.value.total = itemsData.pagination?.total ?? 0
    const marks = marksData.marks ?? []
    stats.value.done = marks.filter((m) => m.status === 2).length
    stats.value.pending = marks.filter((m: any) => m.status !== 2).length
  } catch { /* DB not available yet */ }
  finally { loading.value = false }
}
loadStats()
</script>
