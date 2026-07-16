<template>
  <div>
    <h1 class="text-2xl font-bold mb-6">个人设置</h1>

    <section class="mb-8">
      <h2 class="text-lg font-semibold mb-3">API 令牌</h2>
      <p class="text-sm text-gray-500 mb-3">用于浏览器扩展与 Worker API 的认证。</p>

      <div v-if="tokens.length > 0" class="space-y-2 mb-4">
        <div v-for="token in tokens" :key="token.id"
          class="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded shadow-sm text-sm">
          <span>{{ token.description || '未命名' }}</span>
          <span class="text-xs text-gray-400">{{ new Date(token.createdAt).toLocaleDateString() }}</span>
          <button @click="revoke(token.id)" class="text-red-600 hover:text-red-800 text-sm">吊销</button>
        </div>
      </div>

      <button @click="createToken" class="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
        创建新令牌
      </button>

      <div v-if="newToken" class="mt-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded text-sm break-all border dark:border-yellow-700">
        <strong class="text-yellow-800 dark:text-yellow-300">令牌（仅显示一次）：</strong>
        <code class="block mt-1 font-mono text-xs">{{ newToken }}</code>
        <p class="text-yellow-700 dark:text-yellow-400 mt-1">请立即保存此令牌，关闭后将无法再次查看。</p>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: 'auth', layout: 'dashboard' })

const tokens = ref<any[]>([])
const newToken = ref('')

async function loadTokens() {
  try {
    const data = await $fetch('/api/tokens')
    tokens.value = data.tokens
  } catch { /* DB not available */ }
}

async function createToken() {
  try {
    const data = await $fetch('/api/tokens', { method: 'POST', body: { description: `web-${new Date().toISOString().slice(0, 10)}` } })
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