<template>
  <div class="min-h-screen flex items-center justify-center bg-umm-bg">
    <div class="w-full max-w-md px-4">
      <UCard>
        <div class="p-8 text-center">
          <div class="mx-auto w-16 h-16 rounded-full bg-error/10 flex items-center justify-center mb-6">
            <UIcon name="i-lucide-alert-triangle" class="w-8 h-8 text-error" />
          </div>

          <h1 class="text-6xl font-bold text-umm-text-primary mb-4">
            {{ props.error.statusCode }}
          </h1>

          <p class="text-lg font-medium text-umm-text-secondary mb-2">
            {{ props.error.statusCode === 404 ? '页面不存在' : '出错了' }}
          </p>

          <p class="text-sm text-umm-text-muted mb-8">
            {{ props.error.message }}
          </p>

          <UButton
            label="返回首页"
            icon="i-lucide-home"
            @click="handleError"
          />
        </div>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  error: {
    statusCode: number
    statusMessage: string
    message: string
  }
}

const props = defineProps<Props>()

const handleError = () => clearNuxtError({ redirect: '/' })
</script>
