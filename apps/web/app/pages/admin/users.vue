<template>
  <div>
    <div class="mb-6">
      <h1 class="text-xl font-semibold text-umm-text-primary">用户管理</h1>
      <p class="mt-1 text-sm text-umm-text-secondary">管理平台注册用户</p>
    </div>

    <!-- Search -->
    <div class="mb-4">
      <UInput
        v-model="q"
        placeholder="搜索用户..."
        icon="i-lucide-search"
        size="sm"
        @update:model-value="onSearch"
      />
    </div>

    <!-- Loading -->
    <div v-if="loading" class="space-y-3">
      <USkeleton v-for="n in 5" :key="n" class="h-12" />
    </div>

    <!-- Users Table -->
    <UCard v-else-if="filteredUsers.length > 0">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-umm-border">
            <th class="text-left py-3 pr-4 text-xs font-medium text-umm-text-muted uppercase tracking-wider">用户</th>
            <th class="text-left py-3 pr-4 text-xs font-medium text-umm-text-muted uppercase tracking-wider">邮箱</th>
            <th class="text-left py-3 pr-4 text-xs font-medium text-umm-text-muted uppercase tracking-wider">角色</th>
            <th class="text-right py-3 text-xs font-medium text-umm-text-muted uppercase tracking-wider">注册时间</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-umm-border">
          <tr v-for="u in filteredUsers" :key="u.id" class="hover:bg-umm-surface-hover transition-colors">
            <td class="py-3 pr-4 text-umm-text-primary font-medium">{{ u.name || '匿名' }}</td>
            <td class="py-3 pr-4 text-umm-text-secondary">{{ u.email || '-' }}</td>
            <td class="py-3 pr-4">
              <UBadge :color="u.role === 'admin' ? 'info' : 'neutral'" variant="subtle">
                {{ u.role || 'user' }}
              </UBadge>
            </td>
            <td class="py-3 text-right text-umm-text-muted text-xs">
              {{ formatDate(u.createdAt) }}
            </td>
          </tr>
        </tbody>
      </table>
      <template #footer>
        <p class="text-xs text-umm-text-muted">
          共 {{ filteredUsers.length }} 位用户
        </p>
      </template>
    </UCard>

    <!-- Empty State -->
    <UCard v-else>
      <div class="py-12 text-center">
        <UIcon name="i-lucide-users" class="mx-auto h-8 w-8 text-umm-text-muted mb-2" />
        <p class="text-sm text-umm-text-secondary">{{ q ? '未找到匹配用户' : '暂无用户' }}</p>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: 'admin', layout: 'admin' })

interface AdminUser {
  id: string
  name: string | null
  email: string | null
  role: string | null
  createdAt: string | null
}

const users = ref<AdminUser[]>([])
const q = ref('')
const loading = ref(true)

try {
  const data = await $fetch<AdminUser[]>('/api/admin/users')
  users.value = data ?? []
} catch { /* DB not available */ }
finally { loading.value = false }

const filteredUsers = computed(() => {
  if (!q.value) return users.value
  const query = q.value.toLowerCase()
  return users.value.filter(u =>
    (u.name?.toLowerCase() ?? '').includes(query) ||
    (u.email?.toLowerCase() ?? '').includes(query)
  )
})

function onSearch() {
  // reactive via computed, no extra logic needed
}

function formatDate(date: string | null): string {
  if (!date) return '-'
  return new Date(date).toLocaleDateString()
}
</script>