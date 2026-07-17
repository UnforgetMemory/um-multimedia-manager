<template>
  <div>
    <div class="mb-6">
      <h1 class="text-xl font-semibold text-umm-text-primary">同步日志</h1>
      <p class="mt-1 text-sm text-umm-text-secondary">查看数据同步历史记录</p>
    </div>

    <!-- Status Filter -->
    <div class="mb-4 flex gap-2">
      <UButtonGroup size="sm">
        <UButton
          :color="statusFilter === '' ? 'primary' : 'neutral'"
          :variant="statusFilter === '' ? 'solid' : 'ghost'"
          label="全部"
          @click="statusFilter = ''"
        />
        <UButton
          :color="statusFilter === 'success' ? 'success' : 'neutral'"
          :variant="statusFilter === 'success' ? 'solid' : 'ghost'"
          label="成功"
          @click="statusFilter = 'success'"
        />
        <UButton
          :color="statusFilter === 'error' ? 'error' : 'neutral'"
          :variant="statusFilter === 'error' ? 'solid' : 'ghost'"
          label="失败"
          @click="statusFilter = 'error'"
        />
      </UButtonGroup>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="space-y-3">
      <USkeleton v-for="n in 8" :key="n" class="h-10" />
    </div>

    <!-- Logs Table -->
    <UCard v-else-if="filteredLogs.length > 0">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-umm-border">
            <th class="text-left py-3 pr-4 text-xs font-medium text-umm-text-muted uppercase tracking-wider">时间</th>
            <th class="text-left py-3 pr-4 text-xs font-medium text-umm-text-muted uppercase tracking-wider">类型</th>
            <th class="text-right py-3 pr-4 text-xs font-medium text-umm-text-muted uppercase tracking-wider">条目数</th>
            <th class="text-right py-3 text-xs font-medium text-umm-text-muted uppercase tracking-wider">状态</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-umm-border">
          <tr v-for="log in filteredLogs" :key="log.id" class="hover:bg-umm-surface-hover transition-colors">
            <td class="py-3 pr-4 text-xs text-umm-text-muted font-mono">
              {{ formatTime(log.createdAt) }}
            </td>
            <td class="py-3 pr-4 text-umm-text-primary font-medium">{{ log.syncType || '-' }}</td>
            <td class="py-3 pr-4 text-right text-umm-text-secondary">
              {{ log.itemCount ?? 0 }} 条
            </td>
            <td class="py-3 text-right">
              <UBadge
                :color="log.status === 'success' ? 'success' : 'error'"
                variant="subtle"
              >
                <div class="flex items-center gap-1">
                  <UIcon
                    :name="log.status === 'success' ? 'i-lucide-check-circle' : 'i-lucide-x-circle'"
                    class="w-3 h-3"
                  />
                  {{ log.status === 'success' ? '成功' : '失败' }}
                </div>
              </UBadge>
            </td>
          </tr>
        </tbody>
      </table>
      <template #footer>
        <p class="text-xs text-umm-text-muted">
          显示 {{ filteredLogs.length }} 条记录（最近 100 条）
        </p>
      </template>
    </UCard>

    <!-- Empty State -->
    <UCard v-else>
      <div class="py-12 text-center">
        <UIcon name="i-lucide-clock" class="mx-auto h-8 w-8 text-umm-text-muted mb-2" />
        <p class="text-sm text-umm-text-secondary">
          {{ statusFilter ? '未找到匹配的同步记录' : '暂无同步日志' }}
        </p>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: 'admin', layout: 'admin' })

interface SyncLog {
  id: string
  createdAt: string | null
  syncType: string | null
  itemCount: number | null
  status: string | null
}

const logs = ref<SyncLog[]>([])
const statusFilter = ref('')
const loading = ref(true)

try {
  const data = await $fetch<{ logs: SyncLog[] }>('/api/admin/logs')
  logs.value = data?.logs ?? []
} catch { /* DB not available */ }
finally { loading.value = false }

const filteredLogs = computed(() => {
  if (!statusFilter.value) return logs.value
  return logs.value.filter(l => l.status === statusFilter.value)
})

function formatTime(date: string | null): string {
  if (!date) return '-'
  return date.slice(0, 19).replace('T', ' ')
}
</script>