<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <header class="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
      <div class="max-w-7xl mx-auto flex items-center justify-between">
        <NuxtLink to="/dashboard" class="text-lg font-bold">UMM</NuxtLink>
        <nav class="space-x-4 text-sm">
          <NuxtLink to="/dashboard" class="hover:text-blue-600">概览</NuxtLink>
          <NuxtLink to="/dashboard/items" class="hover:text-blue-600">条目</NuxtLink>
          <NuxtLink to="/dashboard/marks" class="hover:text-blue-600">标记</NuxtLink>
          <NuxtLink to="/dashboard/settings" class="hover:text-blue-600">设置</NuxtLink>
          <button @click="signOut" class="text-red-600 hover:text-red-800">退出</button>
        </nav>
      </div>
    </header>
    <main class="max-w-7xl mx-auto px-4 py-6">
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
const { signOut } = useAuth()
definePageMeta({ middleware: 'auth' })
</script>