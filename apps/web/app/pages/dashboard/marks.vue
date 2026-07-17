<template>
  <div>
    <UmmPageHeader title="标记管理" description="查看和管理你的观影标记" />

    <!-- Loading -->
    <div v-if="loading" class="space-y-3">
      <USkeleton v-for="n in 5" :key="n" class="h-14" />
    </div>

    <!-- Marks List -->
    <div v-else-if="marks.length > 0" class="space-y-2">
      <UCard
        v-for="m in marks"
        :key="m.id"
      >
        <template #default>
          <div class="flex items-center justify-between">
            <div class="flex-1 min-w-0">
              <p class="text-sm text-neutral-900 dark:text-neutral-100 truncate">{{ m.mediaItemId.substring(0, 12) }}...</p>
            </div>
            <div class="flex items-center gap-3 ml-3">
              <UBadge
                :color="statusColor(m.status)"
                variant="subtle"
              >
                {{ statusLabel(m.status) }}
              </UBadge>
              <span v-if="m.rating" class="text-sm text-amber-500">★ {{ m.rating }}</span>
              <span class="text-xs text-neutral-500 dark:text-neutral-400">
                {{ m.updatedAt ? new Date(m.updatedAt).toLocaleDateString() : '' }}
              </span>
            </div>
          </div>
        </template>
      </UCard>
    </div>

    <!-- Empty State -->
    <UCard v-else>
      <template #default>
        <div class="py-12 text-center">
          <UIcon name="i-lucide-file-check" class="mx-auto h-10 w-10 text-neutral-400 dark:text-neutral-500 mb-3" />
          <p class="text-sm text-neutral-600 dark:text-neutral-400">暂无同步数据</p>
          <p class="mt-1 text-xs text-neutral-500 dark:text-neutral-500">从浏览器扩展同步后，标记记录将显示在这里。</p>
        </div>
      </template>
    </UCard>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: 'auth', layout: 'dashboard' })

interface UserMark {
  id: string; mediaItemId: string; status: number
  rating: number | null; updatedAt: string | null
}

const marks = ref<UserMark[]>([])
const loading = ref(true)

async function loadMarks() {
  try {
    const data = await $fetch<{ marks: UserMark[] }>('/api/marks')
    marks.value = data.marks
  } catch { /* DB not available */ }
  finally { loading.value = false }
}

function statusColor(s: number): 'success' | 'info' | 'warning' {
  return s === 2 ? 'success' : s === 1 ? 'info' : 'warning'
}
function statusLabel(s: number) {
  return s === 2 ? '已完成' : s === 1 ? '想看' : '在看'
}

loadMarks()
</script>
