<script setup lang="ts">
import { computed } from 'vue'
import { useRouter, useRoute, RouterView } from 'vue-router'
import { Database, Star, Link, RefreshCw, Settings } from 'lucide-vue-next'

const router = useRouter()
const route = useRoute()

const appVersion = computed(() => {
  try { return chrome.runtime.getManifest().version } catch { return '3.0.0' }
})

const tabs = [
  { id: 'overview', label: '概览', icon: Database, route: '/overview' },
  { id: 'rating', label: '评分管理', icon: Star, route: '/rating' },
  { id: 'linked', label: '关联查询', icon: Link, route: '/linked' },
  { id: 'sync', label: '数据同步', icon: RefreshCw, route: '/sync' },
  { id: 'settings', label: '设置', icon: Settings, route: '/settings' },
] as const

const currentTab = computed(() => {
  const name = route.name as string
  return tabs.find(t => t.id === name)?.id || 'overview'
})

function navigateTo(path: string) {
  router.push(path)
}
</script>

<template>
  <div class="min-h-screen bg-background text-foreground">
    <header class="border-b border-border px-[var(--page-margin)] py-4">
      <div class="max-w-screen-2xl mx-auto flex items-center justify-between">
        <h1 class="font-h1 tracking-tight">UMM 管理面板</h1>
        <span class="font-caption text-secondary-content">v{{ appVersion }}</span>
      </div>
    </header>

    <div class="max-w-screen-2xl mx-auto flex">
      <nav class="w-48 shrink-0 border-r border-border p-[var(--space-4)] hidden lg:block">
        <div class="space-y-1">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            @click="navigateTo(tab.route)"
            :class="[
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
              currentTab === tab.id
                ? 'bg-primary text-primary-foreground'
                : 'text-secondary-content hover:bg-muted hover:text-primary-content'
            ]"
          >
            <component :is="tab.icon" class="h-4 w-4" />
            {{ tab.label }}
          </button>
        </div>
      </nav>

      <nav class="lg:hidden fixed bottom-0 left-0 right-0 border-t border-border bg-background z-50 px-[var(--page-margin)]">
        <div class="flex justify-around py-2">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            @click="navigateTo(tab.route)"
            :class="[
              'flex flex-col items-center gap-1 px-2 py-1 text-xs font-medium transition-colors',
              currentTab === tab.id
                ? 'text-primary'
                : 'text-secondary-content'
            ]"
          >
            <component :is="tab.icon" class="h-4 w-4" />
            {{ tab.label }}
          </button>
        </div>
      </nav>

      <main class="flex-1 p-[var(--card-padding)] pb-20 lg:pb-[var(--card-padding)]">
        <RouterView v-slot="{ Component }">
          <Suspense>
            <component :is="Component" />
            <template #fallback>
              <div class="flex items-center justify-center py-20">
                <div class="text-secondary-content font-body">加载中...</div>
              </div>
            </template>
          </Suspense>
        </RouterView>
      </main>
    </div>
  </div>
</template>
