<template>
  <div>
    <h1 class="text-2xl font-bold mb-4">用户管理</h1>
    <div class="space-y-2">
      <div v-for="u in users" :key="u.id" class="p-3 bg-white dark:bg-gray-800 rounded shadow-sm text-sm flex justify-between">
        <span>{{ u.name || '匿名' }}</span>
        <span class="text-gray-500">{{ u.email }}</span>
        <span :class="u.role === 'admin' ? 'text-purple-600' : 'text-gray-500'">{{ u.role }}</span>
      </div>
      <div v-if="users.length === 0" class="text-center py-8 text-gray-400">暂无用户</div>
    </div>
  </div>
</template>
<script setup lang="ts">
definePageMeta({ middleware: 'admin', layout: 'admin' })
const users = ref<any[]>([])
try {
  const data = await $fetch('/api/admin/users')
  users.value = data
} catch { /* DB not available */ }
</script>