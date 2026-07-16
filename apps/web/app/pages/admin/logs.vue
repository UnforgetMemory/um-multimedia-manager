<template>
  <div>
    <h1 class="text-2xl font-bold mb-4">同步日志</h1>
    <div class="space-y-1">
      <div v-for="log in logs" :key="log.id" class="p-2 bg-white dark:bg-gray-800 rounded text-xs flex gap-4">
        <span class="text-gray-400">{{ log.createdAt?.slice(0, 19)?.replace('T', ' ') }}</span>
        <span>{{ log.syncType }}</span>
        <span>{{ log.itemCount }} 条</span>
        <span :class="log.status === 'success' ? 'text-green-600' : 'text-red-600'">{{ log.status }}</span>
      </div>
      <div v-if="logs.length === 0" class="text-center py-8 text-gray-400">暂无同步日志</div>
    </div>
  </div>
</template>
<script setup lang="ts">
definePageMeta({ middleware: 'admin', layout: 'admin' })
const logs = ref<any[]>([])
try {
  const data = await $fetch('/api/admin/logs')
  logs.value = data.logs
} catch { /* DB not available */ }
</script>