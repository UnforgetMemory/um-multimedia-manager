<template>
  <div class="min-h-screen bg-umm-bg">
    <!-- Top Navigation -->
    <header class="sticky top-0 z-50 border-b bg-umm-surface/80 backdrop-blur-md border-umm-border theme-transition">
      <div class="mx-auto flex h-14 max-w-5xl items-center justify-between px-5">
        <NuxtLink to="/" class="text-sm font-semibold tracking-tight text-umm-text-primary">UMM</NuxtLink>
        <nav class="flex items-center gap-4 text-sm">
          <NuxtLink v-if="!user" to="/auth/login" class="text-umm-text-secondary hover:text-umm-text-primary transition-colors">登录</NuxtLink>
          <NuxtLink v-else to="/dashboard" class="text-umm-text-secondary hover:text-umm-text-primary transition-colors">仪表盘</NuxtLink>
        </nav>
      </div>
    </header>
    <main class="mx-auto max-w-5xl px-5 py-10">
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
const { user } = useAuth()
</script>