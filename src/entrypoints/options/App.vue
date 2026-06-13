<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter, useRoute, RouterView } from 'vue-router'
import { useTheme } from '@/composables/useTheme'
import { Database, Star, Link, RefreshCw, Settings, Palette, Menu, X } from 'lucide-vue-next'

const router = useRouter()
const route = useRoute()

useTheme()

const sidebarOpen = ref(false)

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
  sidebarOpen.value = false
}
</script>

<template>
  <div class="h-screen bg-background text-foreground flex overflow-hidden">
    <!-- Sidebar — persistent on xl+, drawer on smaller -->
    <!-- Mobile drawer overlay -->
    <Transition name="fade">
      <div
        v-if="sidebarOpen"
        class="xl:hidden fixed inset-0 bg-black/50 z-40"
        @click="sidebarOpen = false"
      />
    </Transition>

    <!-- Sidebar -->
    <Transition name="slide">
      <nav
        :class="[
          'fixed xl:static inset-y-0 left-0 z-50 w-64 bg-card border-r border-border flex flex-col shrink-0 transition-transform duration-300',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full xl:translate-x-0',
        ]"
        :style="{ paddingTop: 'var(--space-5)', paddingBottom: 'var(--space-5)' }"
      >
        <!-- Sidebar header -->
        <div class="flex items-center justify-between px-5 mb-6">
          <div>
            <h1 class="text-base font-bold tracking-tight text-primary-content">UMManager</h1>
            <span class="font-caption text-secondary-content">v{{ appVersion }}</span>
          </div>
          <button @click="sidebarOpen = false" class="xl:hidden p-1 rounded-md hover:bg-muted">
            <X class="w-4 h-4 text-secondary-content" />
          </button>
        </div>

        <!-- Nav items -->
        <div class="flex-1 px-3 space-y-1">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            @click="navigateTo(tab.route)"
            :class="[
              'w-full flex items-center gap-3 rounded-lg font-medium transition-all duration-200',
              currentTab === tab.id
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-secondary-content hover:bg-muted hover:text-primary-content',
            ]"
            :style="{ padding: 'var(--space-2) var(--space-3)', fontSize: 'var(--font-body-size)' }"
          >
            <component :is="tab.icon" class="h-4 w-4 shrink-0" />
            <span>{{ tab.label }}</span>
          </button>
        </div>

        <!-- Sidebar footer -->
        <div class="px-5 pt-4 border-t border-border">
          <span class="font-caption text-tertiary-content">UMManager · v{{ appVersion }}</span>
        </div>
      </nav>
    </Transition>

    <!-- Main content area -->
    <div class="flex-1 flex flex-col min-w-0">
      <!-- Top bar -->
      <header class="border-b border-border shrink-0" :style="{ padding: 'var(--space-3) var(--page-margin)' }">
        <div class="flex items-center gap-3">
          <button @click="sidebarOpen = !sidebarOpen" class="xl:hidden p-1.5 rounded-md hover:bg-muted">
            <Menu class="w-5 h-5 text-secondary-content" />
          </button>
          <h2 class="font-h2 text-primary-content truncate">{{ tabs.find(t => t.id === currentTab)?.label || '概览' }}</h2>
        </div>
      </header>

      <!-- Page content -->
      <main class="flex-1 overflow-y-auto" :style="{ padding: 'var(--card-padding)' }">
        <div class="mx-auto" style="max-width: 1200px;">
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
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.slide-enter-active, .slide-leave-active { transition: transform 0.3s ease; }
.slide-enter-from, .slide-leave-to { transform: translateX(-100%); }
</style>
