<template>
  <div class="min-h-screen flex items-center justify-center bg-umm-bg px-4">
    <div class="w-full max-w-md">
      <!-- Logo / Brand -->
      <div class="text-center mb-8">
        <div class="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-4">
          <UIcon name="i-lucide-wand-2" class="w-7 h-7 text-primary" />
        </div>
        <h1 class="text-xl font-semibold text-umm-text-primary">初始化系统</h1>
        <p class="mt-1 text-sm text-umm-text-secondary">创建第一个管理员账号</p>
      </div>

      <!-- Step Indicator -->
      <div class="flex items-center justify-center gap-2 mb-6">
        <span
          v-for="s in steps"
          :key="s.id"
          class="flex items-center gap-1.5 text-xs font-medium"
          :class="s.id === currentStep ? 'text-primary' : s.id < currentStep ? 'text-success' : 'text-umm-text-muted'"
        >
          <UIcon
            v-if="s.id < currentStep"
            name="i-lucide-check-circle"
            class="w-4 h-4"
          />
          <span
            v-else
            class="flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold border"
            :class="s.id === currentStep ? 'border-primary bg-primary/10 text-primary' : 'border-umm-border text-umm-text-muted'"
          >{{ s.id + 1 }}</span>
          {{ s.label }}
        </span>
      </div>

      <!-- Step 1: Welcome + D1 Check -->
      <UCard v-if="currentStep === 0" :padding="false">
        <div class="px-6 pt-6 pb-4">
          <div class="flex items-center gap-3 mb-4">
            <div class="flex items-center justify-center w-10 h-10 rounded-lg bg-info/10">
              <UIcon name="i-lucide-database" class="w-5 h-5 text-info" />
            </div>
            <div>
              <p class="text-sm font-medium text-umm-text-primary">数据库连接</p>
              <p class="text-xs text-umm-text-muted">检查 D1 数据库状态</p>
            </div>
          </div>

          <div v-if="dbLoading" class="flex items-center gap-2 text-sm text-umm-text-secondary">
            <UIcon name="i-lucide-loader-circle" class="w-4 h-4 animate-spin" />
            检测数据库连接...
          </div>

          <UAlert v-else-if="dbError" color="error" variant="subtle" title="数据库连接失败" class="mb-4">
            <template #description>
              <p class="text-xs">{{ dbError }}</p>
              <UButton size="xs" color="neutral" variant="ghost" class="mt-2" @click="checkDb">
                重新检测
              </UButton>
            </template>
          </UAlert>

          <UAlert v-else-if="dbConnected" color="success" variant="subtle" title="数据库连接正常" class="mb-4" />

          <UAlert v-else color="warning" variant="subtle" title="等待检测..." class="mb-4" />

          <div class="flex items-center gap-3">
            <div class="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
              <UIcon name="i-lucide-shield" class="w-5 h-5 text-primary" />
            </div>
            <div>
              <p class="text-sm font-medium text-umm-text-primary">创建管理员账号</p>
              <p class="text-xs text-umm-text-muted">作为系统第一个用户，你将获得管理员权限</p>
            </div>
          </div>
        </div>

        <template #footer>
          <div class="px-6 py-3 border-t border-umm-border flex justify-end">
            <UButton
              color="primary"
              :disabled="!dbConnected || dbLoading"
              @click="currentStep = 1"
            >
              开始设置
              <template #trailing>
                <UIcon name="i-lucide-arrow-right" class="w-4 h-4" />
              </template>
            </UButton>
          </div>
        </template>
      </UCard>

      <!-- Step 2: Create Admin -->
      <UCard v-if="currentStep === 1">
        <form @submit.prevent="submitSetup" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-umm-text-primary mb-1.5">姓名</label>
            <UInput v-model="form.name" placeholder="管理员" icon="i-lucide-user" />
            <p class="mt-1 text-xs text-umm-text-muted">可选，用于显示名称</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-umm-text-primary mb-1.5">用户名</label>
            <UInput v-model="form.username" placeholder="6-16 位字母或数字" icon="i-lucide-at-sign" autocomplete="username" />
            <p class="mt-1 text-xs text-umm-text-muted">6-16 位字母、数字或下划线</p>
            <p v-if="errors.username" class="mt-1 text-xs text-error">{{ errors.username }}</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-umm-text-primary mb-1.5">密码</label>
            <UInput v-model="form.password" type="password" placeholder="至少 8 位字符" icon="i-lucide-lock" autocomplete="new-password" />
            <p v-if="errors.password" class="mt-1 text-xs text-error">{{ errors.password }}</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-umm-text-primary mb-1.5">确认密码</label>
            <UInput v-model="form.confirm" type="password" placeholder="再次输入密码" icon="i-lucide-lock" autocomplete="new-password" />
            <p v-if="errors.confirm" class="mt-1 text-xs text-error">{{ errors.confirm }}</p>
          </div>

          <UAlert v-if="submitError" color="error" variant="subtle" :title="submitError" />

          <div class="flex items-center justify-between pt-2">
            <UButton color="neutral" variant="ghost" @click="currentStep = 0">
              <UIcon name="i-lucide-arrow-left" class="w-4 h-4" />返回
            </UButton>
            <UButton type="submit" color="primary" :loading="submitting" :disabled="submitting">
              {{ submitting ? '创建中...' : '创建管理员并登录' }}
            </UButton>
          </div>
        </form>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: false })

const currentStep = ref(0)
const steps = [
  { id: 0, label: '检测' },
  { id: 1, label: '设置' },
]

// Step 1: DB check
const dbLoading = ref(true)
const dbConnected = ref(false)
const dbError = ref('')

async function checkDb() {
  dbLoading.value = true
  dbError.value = ''
  try {
    const data = await $fetch<{ database: { connected: boolean; error?: string }; initialized: boolean }>('/api/system/init')
    dbConnected.value = data.database?.connected ?? false
    if (!dbConnected.value) {
      dbError.value = data.database?.error || '连接失败'
    }
  } catch (e: any) {
    dbConnected.value = false
    dbError.value = e?.message || '无法连接到服务器'
  }
  finally { dbLoading.value = false }
}
checkDb()

// Step 2: Create admin
const form = ref({ name: '', username: '', password: '', confirm: '' })
const errors = ref({ username: '', password: '', confirm: '' })
const submitting = ref(false)
const submitError = ref('')

function validate(): boolean {
  errors.value = { username: '', password: '', confirm: '' }
  let valid = true

  if (!form.value.username || !/^[a-zA-Z0-9_]{6,16}$/.test(form.value.username)) {
    errors.value.username = '用户名需要 6-16 位字母、数字或下划线'
    valid = false
  }
  if (!form.value.password || form.value.password.length < 8) {
    errors.value.password = '密码至少需要 8 位字符'
    valid = false
  }
  if (form.value.password !== form.value.confirm) {
    errors.value.confirm = '两次密码输入不一致'
    valid = false
  }
  return valid
}

async function submitSetup() {
  if (!validate()) return
  submitting.value = true
  submitError.value = ''

  try {
    const result = await $fetch<{ success: boolean }>('/api/system/init', {
      method: 'POST',
      body: {
        name: form.value.name || undefined,
        username: form.value.username,
        password: form.value.password,
      },
    })

    if (result.success) {
      // Refresh auth state
      const { fetchSession } = useAuth()
      await fetchSession()
      await navigateTo('/dashboard')
    }
  } catch (e: any) {
    submitError.value = e?.data?.message || e?.message || '创建失败'
  }
  finally { submitting.value = false }
}
</script>