<template>
  <div class="min-h-screen flex items-center justify-center bg-umm-bg">
    <div class="w-full max-w-md px-4">
      <UCard>
        <div class="p-2">
          <h1 class="text-2xl font-bold text-umm-text-primary mb-6">登录</h1>

          <form @submit.prevent="handleLogin" class="space-y-4">
            <UInput
              v-model="username"
              placeholder="用户名"
              icon="i-lucide-at-sign"
              size="lg"
              autocomplete="username"
            />

            <UInput
              v-model="password"
              type="password"
              placeholder="密码"
              icon="i-lucide-lock"
              size="lg"
            />

            <UButton
              type="submit"
              label="登录"
              :loading="loading"
              block
              size="lg"
            />

            <p v-if="error" class="rounded-lg bg-error/10 px-4 py-3 text-sm text-error">
              {{ error }}
            </p>
          </form>

          <p class="mt-6 text-center text-sm text-umm-text-muted">
            还没有账号？
            <NuxtLink to="/auth/register" class="text-primary hover:text-primary/80 transition-colors">
              注册
            </NuxtLink>
          </p>
        </div>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
const username = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)
const { signIn } = useAuth()

async function handleLogin() {
  loading.value = true
  error.value = ''
  try {
    await signIn('credentials', {
      username: username.value,
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
