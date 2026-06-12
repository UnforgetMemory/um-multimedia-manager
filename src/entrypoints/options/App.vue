<script setup lang="ts">
import { computed } from 'vue'
import { useRouter, useRoute, RouterView } from 'vue-router'
import { useTheme } from '@/composables/useTheme'
import { Database, Star, Link, RefreshCw, Settings, Palette } from 'lucide-vue-next'

const router = useRouter()
const route = useRoute()

useTheme()

const appVersion = computed(() => {
  try { return chrome.runtime.getManifest().version } catch { return '3.0.0' }
})

const tabs = [
  { id: 'overview', label: '概览', icon: Database, route: '/overview' },
  { id: 'rating', label: '评分管理', icon: Star, route: '/rating' },
  { id: 'linked', label: '关联查询', icon: Link, route: '/linked' },
  { id: 'sync', label: '数据同步', icon: RefreshCw, route: '/sync' },
  { id: 'appearance', label: '外观', icon: Palette, route: '/appearance' },
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
    <!-- Header -->
    <header class="border-b border-border" :style="{ padding: 'var(--space-4) var(--page-margin)' }">
      <div class="mx-auto flex items-center justify-between" style="max-width: 1440px;">
        <h1 class="font-h1 tracking-tight">UMManager</h1>
        <span class="font-caption text-secondary-content">v{{ appVersion }}</span>
      </div>
    </header>

    <div class="mx-auto flex" style="max-width: 1440px;">
      <!-- Sidebar (xl+) -->
      <nav class="w-60 shrink-0 border-r border-border hidden xl:block" :style="{ padding: 'var(--space-4)' }">
        <div class="space-y-1">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            @click="navigateTo(tab.route)"
            :class="[
              'w-full flex items-center gap-3 rounded-md font-medium transition-colors',
              currentTab === tab.id
                ? 'bg-primary text-primary-foreground'
                : 'text-secondary-content hover:bg-muted hover:text-primary-content'
            ]"
            :style="{ padding: 'var(--space-2) var(--space-3)', fontSize: 'var(--font-body-size)' }"
          >
            <component :is="tab.icon" class="h-4 w-4" />
            {{ tab.label }}
          </button>
        </div>
      </nav>

      <!-- Bottom nav (sm–lg) -->
      <nav class="xl:hidden fixed bottom-0 left-0 right-0 border-t border-border bg-background z-50" :style="{ padding: '0 var(--page-margin)' }">
        <div class="flex justify-around py-2">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            @click="navigateTo(tab.route)"
            :class="[
              'flex flex-col items-center gap-1 font-medium transition-colors',
              currentTab === tab.id ? 'text-primary' : 'text-secondary-content'
            ]"
            :style="{ padding: 'var(--space-1) var(--space-2)', fontSize: 'var(--font-caption-size)' }"
          >
            <component :is="tab.icon" class="h-4 w-4" />
            {{ tab.label }}
          </button>
        </div>
      </nav>

      <!-- Content -->
      <main class="flex-1 pb-20 xl:pb-0" :style="{ padding: 'var(--card-padding)' }">
        <RouterView v-slot="{ Component }">
          <Suspense>
            <component :is="Component" />
            <template #fallback>
              <div class="space-y-4 animate-pulse">
                <div class="h-8 bg-muted rounded w-1/3"></div>
                <div class="h-4 bg-muted rounded w-2/3"></div>
                <div class="h-48 bg-muted rounded"></div>
              </div>
            </template>
          </Suspense>
        </RouterView>
      </main>
    </div>
  </div>
</template>
