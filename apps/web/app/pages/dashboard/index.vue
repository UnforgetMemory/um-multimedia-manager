<template>
  <div>
    <h1 class="text-2xl font-bold mb-4">仪表盘</h1>
    <div class="grid grid-cols-3 gap-4 mb-6">
      <div class="p-4 bg-white dark:bg-gray-800 rounded shadow">
        <p class="text-sm text-gray-500">记录总数</p>
        <p class="text-2xl font-bold">{{ stats.total }}</p>
      </div>
      <div class="p-4 bg-white dark:bg-gray-800 rounded shadow">
        <p class="text-sm text-gray-500">已完成</p>
        <p class="text-2xl font-bold text-green-600">{{ stats.done }}</p>
      </div>
      <div class="p-4 bg-white dark:bg-gray-800 rounded shadow">
        <p class="text-sm text-gray-500">待处理</p>
        <p class="text-2xl font-bold text-blue-600">{{ stats.pending }}</p>
      </div>
    </div>
    <p class="text-gray-500 text-sm">使用浏览器扩展标记内容后，数据将通过同步功能显示在这里。</p>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: 'auth', layout: 'dashboard' })
const stats = ref({ total: 0, done: 0, pending: 0 })

async function loadStats() {
  try {
    const data = await $fetch('/api/items', { query: { limit: '1' } })
    stats.value.total = data.pagination.total
  } catch { /* DB not available yet */ }
}
loadStats()
</script>