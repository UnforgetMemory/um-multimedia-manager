<template>
  <div>
    <h1 class="text-2xl font-bold mb-6">系统概览</h1>
    <div class="grid grid-cols-3 gap-4 mb-6">
      <div class="p-4 bg-white dark:bg-gray-800 rounded shadow">
        <p class="text-sm text-gray-500">用户数</p>
        <p class="text-2xl font-bold">{{ stats.userCount }}</p>
      </div>
      <div class="p-4 bg-white dark:bg-gray-800 rounded shadow">
        <p class="text-sm text-gray-500">条目数</p>
        <p class="text-2xl font-bold">{{ stats.itemCount }}</p>
      </div>
      <div class="p-4 bg-white dark:bg-gray-800 rounded shadow">
        <p class="text-sm text-gray-500">标记数</p>
        <p class="text-2xl font-bold">{{ stats.markCount }}</p>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
definePageMeta({ middleware: 'admin', layout: 'admin' })
const stats = ref({ userCount: 0, itemCount: 0, markCount: 0 })
try {
  const data = await $fetch('/api/admin/stats')
  stats.value = data
} catch { /* DB not available */ }
</script>