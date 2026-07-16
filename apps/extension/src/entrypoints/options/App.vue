<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter, useRoute, RouterView } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useThemeStore } from '@/stores/theme'
import { useAppStore } from '@/stores/app'
import { useLocaleSync } from '@/composables/useLocaleSync'
import { Database, Star, Link, RefreshCw, Settings, Palette, Menu, X } from 'lucide-vue-next'
import ConfirmDialog from '@/shared/ConfirmDialog.vue'
import ToastContainer from '@/shared/ToastContainer.vue'
import NavItem from '@/shared/ui/nav-item/NavItem.vue'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()

useThemeStore()
useLocaleSync()

const appStore = useAppStore()
const { appVersion } = storeToRefs(appStore)

const sidebarOpen = ref(false)

const tabs = computed(() => [
  { id: 'overview', label: t('nav.overview') as string, icon: Database, route: '/overview' },
  { id: 'rating', label: t('nav.rating') as string, icon: Star, route: '/rating' },
  { id: 'linked', label: t('nav.linked') as string, icon: Link, route: '/linked' },
  { id: 'sync', label: t('nav.sync') as string, icon: RefreshCw, route: '/sync' },
  { id: 'appearance', label: t('nav.appearance') as string, icon: Palette, route: '/appearance' },
  { id: 'settings', label: t('nav.settings') as string, icon: Settings, route: '/settings' },
])

const currentTab = computed(() => {
  const name = route.name as string
  return tabs.value.find(t => t.id === name)?.id || 'overview'
})

function navigateTo(path: string) {
  router.push(path)
  sidebarOpen.value = false
}
</script>

<template>
  <div class="umm:h-screen umm:bg-background umm:text-foreground umm:flex umm:overflow-hidden">
    <!-- Sidebar — persistent on xl+, drawer on smaller -->
    <!-- Mobile drawer overlay -->
    <Transition name="fade">
      <div
        v-if="sidebarOpen"
        class="umm:xl:hidden umm:fixed umm:inset-0 umm:bg-black/50 umm:z-40"
        @click="sidebarOpen = false"
      />
    </Transition>

    <!-- Sidebar -->
    <Transition name="slide">
      <nav
        :class="['umm:fixed umm:xl:static umm:inset-y-0 umm:left-0 umm:z-50 umm:w-64 umm:bg-card umm:border-r umm:border-border umm:flex umm:flex-col umm:shrink-0 umm:transition-transform umm:duration-300', sidebarOpen ? 'umm:translate-x-0' : 'umm:-translate-x-full umm:xl:translate-x-0']"
        :style="{ paddingTop: 'var(--umm-spacing-5)', paddingBottom: 'var(--umm-spacing-5)' }"
      >
        <!-- Sidebar header -->
        <div class="umm:flex umm:items-center umm:justify-between umm:px-5 umm:mb-6">
          <div>
            <h1 class="umm:text-base umm:font-bold umm:tracking-tight umm:text-primary-content">UMManager</h1>
            <span class="umm:font-caption umm:text-secondary-content">v{{ appVersion }}</span>
          </div>
          <button @click="sidebarOpen = false" class="umm:xl:hidden umm:p-1 umm:rounded-md umm:hover:bg-muted">
            <X class="umm:w-4 umm:h-4 umm:text-secondary-content" />
          </button>
        </div>

        <!-- Nav items -->
        <div class="umm:flex-1 umm:px-3 umm:flex umm:flex-col umm:gap-1 umm:overflow-y-auto">
          <NavItem
            v-for="tab in tabs"
            :key="tab.id"
            :icon="tab.icon"
            :label="tab.label"
            :active="currentTab === tab.id"
            @click="navigateTo(tab.route)"
          />
        </div>

      </nav>
    </Transition>

    <!-- Main content area -->
    <div class="umm:flex-1 umm:flex umm:flex-col umm:min-w-0">
      <!-- Mobile menu button -->
      <button @click="sidebarOpen = !sidebarOpen" class="umm:xl:hidden umm:fixed umm:top-3 umm:left-3 umm:z-30 umm:p-2 umm:rounded-lg umm:bg-card umm:border umm:border-border umm:shadow-sm umm:hover:bg-muted umm:transition-colors">
        <Menu class="umm:w-4 umm:h-4 umm:text-secondary-content" />
      </button>

      <!-- Page content -->
      <main class="umm:flex-1 umm:overflow-y-auto" :style="{ padding: 'var(--umm-card-padding)', paddingTop: 'calc(var(--umm-card-padding) + 40px)' }">
        <div class="umm:mx-auto" style="max-width: 1200px;">
          <RouterView v-slot="{ Component }">
            <Suspense>
              <component :is="Component" />
              <template #fallback>
                <div class="umm:flex umm:flex-col umm:gap-4 umm:animate-pulse">
                  <div class="umm:h-8 umm:bg-muted umm:rounded umm:w-1/3"></div>
                  <div class="umm:h-4 umm:bg-muted umm:rounded umm:w-2/3"></div>
                  <div class="umm:h-48 umm:bg-muted umm:rounded"></div>
                </div>
              </template>
            </Suspense>
          </RouterView>
        </div>
      </main>
    </div>

    <!-- Global Confirm Dialog -->
    <ConfirmDialog />

    <!-- Toast Notifications -->
    <ToastContainer />
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.slide-enter-active, .slide-leave-active { transition: transform 0.3s ease; }
.slide-enter-from, .slide-leave-to { transform: translateX(-100%); }
</style>
