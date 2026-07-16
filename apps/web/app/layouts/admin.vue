<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <header class="bg-gray-900 text-white px-4 py-3">
      <div class="max-w-7xl mx-auto flex items-center justify-between">
        <NuxtLink to="/admin" class="text-lg font-bold">UMM 管理</NuxtLink>
        <nav class="space-x-4 text-sm">
          <NuxtLink to="/admin">概览</NuxtLink>
          <NuxtLink to="/admin/users">用户</NuxtLink>
          <NuxtLink to="/admin/logs">同步日志</NuxtLink>
          <NuxtLink to="/dashboard" class="text-gray-400 hover:text-white">返回面板</NuxtLink>
        </nav>
      </div>
    </header>
    <main class="max-w-7xl mx-auto px-4 py-6">
      <slot />
    </main>
  </div>
</template>
<script setup lang="ts">
definePageMeta({ middleware: 'admin' })
</script>