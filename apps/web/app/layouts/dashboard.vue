<template>
  <UDashboardGroup>
    <UDashboardSidebar collapsible>
      <template #header>
        <NuxtLink to="/dashboard" class="text-sm font-semibold tracking-tight">
          UMM
        </NuxtLink>
      </template>

      <UNavigationMenu
        :items="navItems"
        orientation="vertical"
      />

      <template #footer>
        <div class="flex items-center justify-between">
          <span class="text-xs text-muted truncate">{{ user?.email }}</span>
          <UColorModeButton />
        </div>
      </template>
    </UDashboardSidebar>

    <UDashboardPanel>
      <template #header>
        <UDashboardNavbar>
          <template #leading>
            <UDashboardSidebarCollapse />
          </template>

          <template #trailing>
            <UButton
              label="退出"
              color="error"
              variant="ghost"
              size="xs"
              @click="signOut"
            />
          </template>
        </UDashboardNavbar>
      </template>

      <template #body>
        <slot />
      </template>
    </UDashboardPanel>
  </UDashboardGroup>
</template>

<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const { user, signOut } = useAuth()
definePageMeta({ middleware: 'auth' })

const navItems: NavigationMenuItem[][] = [[
  {
    label: '概览',
    icon: 'i-lucide-layout-dashboard',
    to: '/dashboard',
  },
  {
    label: '条目管理',
    icon: 'i-lucide-list',
    to: '/dashboard/items',
  },
  {
    label: '标记管理',
    icon: 'i-lucide-bookmark',
    to: '/dashboard/marks',
  },
  {
    label: '设置',
    icon: 'i-lucide-settings',
    to: '/dashboard/settings',
  },
]]
</script>
