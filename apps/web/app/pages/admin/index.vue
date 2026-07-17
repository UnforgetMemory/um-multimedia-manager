<template>
  <div>
    <div class="mb-6">
      <h1 class="text-xl font-semibold text-umm-text-primary">系统概览</h1>
      <p class="mt-1 text-sm text-umm-text-secondary">平台数据统计</p>
    </div>

    <div v-if="loading" class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <USkeleton v-for="n in 3" :key="n" class="h-24" />
    </div>

    <div v-else class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <UCard>
        <div class="flex items-center gap-3">
          <div class="flex items-center justify-center w-10 h-10 rounded-lg bg-info/10">
            <UIcon name="i-lucide-users" class="w-5 h-5 text-info" />
          </div>
          <div>
            <p class="text-xs font-medium uppercase tracking-wider text-umm-text-muted">用户数</p>
            <p class="mt-0.5 text-2xl font-semibold text-umm-text-primary">{{ stats.userCount }}</p>
          </div>
        </div>
      </UCard>

      <UCard>
        <div class="flex items-center gap-3">
          <div class="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
            <UIcon name="i-lucide-film" class="w-5 h-5 text-primary" />
          </div>
          <div>
            <p class="text-xs font-medium uppercase tracking-wider text-umm-text-muted">条目数</p>
            <p class="mt-0.5 text-2xl font-semibold text-umm-text-primary">{{ stats.itemCount }}</p>
          </div>
        </div>
      </UCard>

      <UCard>
        <div class="flex items-center gap-3">
          <div class="flex items-center justify-center w-10 h-10 rounded-lg bg-success/10">
            <UIcon name="i-lucide-bookmark" class="w-5 h-5 text-success" />
          </div>
          <div>
            <p class="text-xs font-medium uppercase tracking-wider text-umm-text-muted">标记数</p>
            <p class="mt-0.5 text-2xl font-semibold text-umm-text-primary">{{ stats.markCount }}</p>
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: 'admin', layout: 'admin' })

interface AdminStats {
  userCount: number
  itemCount: number
  markCount: number
}

const stats = ref<AdminStats>({ userCount: 0, itemCount: 0, markCount: 0 })
const loading = ref(true)

try {
  const data = await $fetch<AdminStats>('/api/admin/stats')
  if (data) stats.value = data
} catch { /* DB not available */ }
finally { loading.value = false }
</script>