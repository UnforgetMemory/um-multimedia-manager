<template>
  <div class="min-h-screen flex items-center justify-center bg-umm-bg">
    <div class="w-full max-w-md px-4">
      <UCard>
        <div class="p-2">
          <h1 class="text-2xl font-bold text-umm-text-primary mb-4">注册</h1>

          <div class="rounded-lg bg-info/10 px-4 py-3 mb-6">
            <p class="text-sm text-info">
              注册功能需要后端实现用户创建逻辑。请先通过管理员添加用户。
            </p>
          </div>

          <NuxtLink
            to="/auth/login"
            class="inline-flex items-center text-sm text-primary hover:text-primary/80 transition-colors"
          >
            <UIcon name="i-lucide-arrow-left" class="w-4 h-4 mr-1" />
            返回登录
          </NuxtLink>
        </div>
      </UCard>
    </div>
  </div>
</template>
