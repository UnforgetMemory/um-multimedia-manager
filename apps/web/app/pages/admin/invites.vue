<template>
  <div>
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-xl font-semibold text-umm-text-primary">邀请码管理</h1>
        <p class="mt-1 text-sm text-umm-text-secondary">管理用户注册邀请码</p>
      </div>
      <UButton
        color="primary"
        icon="i-lucide-plus"
        label="生成邀请码"
        @click="showCreateModal = true"
      />
    </div>

    <!-- Loading -->
    <div v-if="loading" class="space-y-3">
      <USkeleton v-for="n in 5" :key="n" class="h-12" />
    </div>

    <!-- Invites Table -->
    <UCard v-else-if="invites.length > 0">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-umm-border">
            <th class="text-left py-3 pr-4 text-xs font-medium text-umm-text-muted uppercase tracking-wider">邀请码</th>
            <th class="text-left py-3 pr-4 text-xs font-medium text-umm-text-muted uppercase tracking-wider">使用人</th>
            <th class="text-left py-3 pr-4 text-xs font-medium text-umm-text-muted uppercase tracking-wider">过期时间</th>
            <th class="text-left py-3 pr-4 text-xs font-medium text-umm-text-muted uppercase tracking-wider">状态</th>
            <th class="text-right py-3 text-xs font-medium text-umm-text-muted uppercase tracking-wider">创建时间</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-umm-border">
          <tr v-for="invite in invites" :key="invite.id" class="hover:bg-umm-surface-hover transition-colors">
            <td class="py-3 pr-4 font-mono text-sm text-umm-text-primary">{{ invite.code }}</td>
            <td class="py-3 pr-4 text-umm-text-secondary">
              {{ invite.usedBy || '-' }}
            </td>
            <td class="py-3 pr-4 text-umm-text-secondary text-xs">
              {{ invite.expiresAt ? formatDate(invite.expiresAt) : '永不过期' }}
            </td>
            <td class="py-3 pr-4">
              <UBadge :color="inviteStatusColor(invite)" variant="subtle">
                {{ inviteStatusLabel(invite) }}
              </UBadge>
            </td>
            <td class="py-3 text-right text-umm-text-muted text-xs">
              {{ formatDate(invite.createdAt) }}
            </td>
          </tr>
        </tbody>
      </table>
      <template #footer>
        <p class="text-xs text-umm-text-muted">
          共 {{ invites.length }} 个邀请码
        </p>
      </template>
    </UCard>

    <!-- Empty State -->
    <UCard v-else>
      <div class="py-12 text-center">
        <UIcon name="i-lucide-ticket" class="mx-auto h-8 w-8 text-umm-text-muted mb-2" />
        <p class="text-sm text-umm-text-secondary">暂无邀请码</p>
      </div>
    </UCard>

    <!-- Create Modal -->
    <UModal v-model:open="showCreateModal">
      <template #header>
        <h2 class="text-lg font-semibold text-umm-text-primary">生成邀请码</h2>
      </template>
      <template #body>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-umm-text-primary mb-1.5">过期时间</label>
            <USelect
              v-model="expirationDays"
              :items="expirationOptions"
              placeholder="选择过期时间"
            />
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            label="取消"
            @click="showCreateModal = false"
          />
          <UButton
            color="primary"
            label="生成"
            :loading="generating"
            @click="generateInvite"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: 'admin', layout: 'admin' })

interface InviteCode {
  id: string
  code: string
  createdAt: string | null
  expiresAt: string | null
  usedBy: string | null
}

const invites = ref<InviteCode[]>([])
const loading = ref(true)
const showCreateModal = ref(false)
const generating = ref(false)
const expirationDays = ref(7)

const expirationOptions = [
  { label: '7 天', value: 7 },
  { label: '30 天', value: 30 },
  { label: '90 天', value: 90 },
  { label: '永不过期', value: 0 },
]

// Load invites
try {
  const data = await $fetch<InviteCode[]>('/api/admin/invites')
  invites.value = data ?? []
} catch { /* API not available */ }
finally { loading.value = false }

function inviteStatusColor(invite: InviteCode): 'success' | 'warning' | 'error' | 'neutral' {
  if (invite.usedBy) return 'neutral'
  if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) return 'error'
  return 'success'
}

function inviteStatusLabel(invite: InviteCode): string {
  if (invite.usedBy) return '已使用'
  if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) return '已过期'
  return '可用'
}

function formatDate(date: string | null): string {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

async function generateInvite() {
  generating.value = true
  try {
    const newInvite = await $fetch<InviteCode>('/api/admin/invites', {
      method: 'POST',
      body: {
        expirationDays: expirationDays.value || undefined,
      },
    })
    invites.value.unshift(newInvite)
    showCreateModal.value = false
  } catch (e) {
    console.error('Failed to generate invite:', e)
  } finally {
    generating.value = false
  }
}
</script>
