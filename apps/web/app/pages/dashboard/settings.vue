<template>
  <div>
    <UmmPageHeader title="设置" description="管理 API 令牌和个人配置" />

    <!-- API Tokens -->
    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-key" class="w-4 h-4 text-neutral-500" />
          <h3 class="text-sm font-semibold text-neutral-900 dark:text-neutral-100">API 令牌</h3>
        </div>
      </template>

      <template #default>
        <p class="text-xs text-neutral-500 dark:text-neutral-400 mb-4">用于浏览器扩展与 Worker API 的认证。</p>

        <div v-if="tokens.length > 0" class="space-y-2 mb-4">
          <div
            v-for="token in tokens"
            :key="token.id"
            class="flex items-center justify-between rounded-lg bg-neutral-50 dark:bg-neutral-800/50 px-4 py-3"
          >
            <div>
              <p class="text-sm text-neutral-900 dark:text-neutral-100">{{ token.description || '未命名' }}</p>
              <p class="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{{ new Date(token.createdAt).toLocaleDateString() }}</p>
            </div>
            <UButton
              color="error"
              variant="ghost"
              size="xs"
              icon="i-lucide-trash-2"
              @click="revoke(token.id)"
            >
              吊销
            </UButton>
          </div>
        </div>

        <UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-plus"
          @click="createToken"
        >
          创建新令牌
        </UButton>

        <UAlert
          v-if="newToken"
          color="warning"
          variant="soft"
          icon="i-lucide-alert-triangle"
          title="令牌（仅显示一次）"
          class="mt-4"
        >
          <template #description>
            <code class="block mt-1 text-xs font-mono break-all">{{ newToken }}</code>
            <p class="text-xs mt-1 opacity-80">请立即保存此令牌，关闭后将无法再次查看。</p>
          </template>
        </UAlert>
      </template>
    </UCard>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: 'auth', layout: 'dashboard' })

interface ApiToken {
  id: string; description: string | null; createdAt: string
}

const tokens = ref<ApiToken[]>([])
const newToken = ref('')

async function loadTokens() {
  try {
    const data = await $fetch<{ tokens: ApiToken[] }>('/api/tokens')
    tokens.value = data.tokens
  } catch { /* DB not available */ }
}

async function createToken() {
  try {
    const data = await $fetch<{ token: string }>('/api/tokens', {
      method: 'POST',
      body: { description: `web-${new Date().toISOString().slice(0, 10)}` },
    })
    newToken.value = data.token
    await loadTokens()
  } catch { /* error */ }
}

async function revoke(id: string) {
  try {
    await $fetch(`/api/tokens/${id}`, { method: 'DELETE' })
    newToken.value = ''
    await loadTokens()
  } catch { /* error */ }
}

loadTokens()
</script>
