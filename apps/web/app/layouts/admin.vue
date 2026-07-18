<template>
  <UDashboardGroup>
    <UDashboardSidebar collapsible>
      <template #header>
        <NuxtLink to="/admin" class="text-sm font-semibold tracking-tight">
          UMM 管理
        </NuxtLink>
      </template>

      <UNavigationMenu
        :items="navItems"
        orientation="vertical"
      />

      <template #footer>
        <div class="flex items-center justify-between">
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
            <div class="flex items-center gap-2">
              <UButton
                label="返回面板"
                color="neutral"
                variant="ghost"
                size="xs"
                to="/dashboard"
              />
              <UButton
                label="退出"
                color="error"
                variant="ghost"
                size="xs"
                @click="signOut"
              />
            </div>
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

const { signOut } = useAuth()
definePageMeta({ middleware: 'admin' })

const navItems: NavigationMenuItem[][] = [[
  {
    label: '概览',
    icon: 'i-lucide-layout-dashboard',
    to: '/admin',
  },
  {
    label: '用户管理',
    icon: 'i-lucide-users',
    to: '/admin/users',
  },
  {
    label: '同步日志',
    icon: 'i-lucide-clock',
    to: '/admin/logs',
  },
]]
</script>
