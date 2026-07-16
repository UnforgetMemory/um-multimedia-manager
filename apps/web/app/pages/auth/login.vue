<template>
  <div class="max-w-md mx-auto mt-20">
    <h1 class="text-2xl font-bold mb-6">登录</h1>
    <form @submit.prevent="handleLogin" class="space-y-4">
      <input v-model="email" type="email" placeholder="邮箱" class="w-full px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-700" />
      <input v-model="password" type="password" placeholder="密码" class="w-full px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-700" />
      <button type="submit" class="w-full py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50" :disabled="loading">
        {{ loading ? '登录中...' : '登录' }}
      </button>
      <p v-if="error" class="text-red-600 text-sm">{{ error }}</p>
    </form>
    <p class="mt-4 text-center text-sm text-gray-500">
      还没有账号？<NuxtLink to="/auth/register" class="text-blue-600">注册</NuxtLink>
    </p>
  </div>
</template>

<script setup lang="ts">
const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)
const { signIn } = useAuth()

async function handleLogin() {
  loading.value = true
  error.value = ''
  try {
    await signIn('credentials', {
      email: email.value,
      password: password.value,
      redirect: true,
      callbackUrl: '/dashboard',
    })
  } catch (e) {
    error.value = '登录失败，请重试'
  } finally {
    loading.value = false
  }
}
</script>