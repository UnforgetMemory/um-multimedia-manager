<template>
  <div class="min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100">
    <header class="border-b border-gray-200 dark:border-gray-800 px-4 py-3">
      <div class="max-w-7xl mx-auto flex items-center justify-between">
        <NuxtLink to="/" class="text-lg font-bold">UMM</NuxtLink>
        <nav class="space-x-4">
          <NuxtLink v-if="!user" to="/auth/login">登录</NuxtLink>
          <NuxtLink v-else to="/dashboard">仪表盘</NuxtLink>
        </nav>
      </div>
    </header>
    <main class="max-w-7xl mx-auto px-4 py-6">
      <slot />
    </main>
  </div>
</template>

<script setup>
const { user } = useAuth()
</script>