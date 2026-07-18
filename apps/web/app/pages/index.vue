<template>
  <div class="flex flex-col items-center justify-center min-h-[70vh] text-center">
    <div class="mb-6">
      <div class="mx-auto w-12 h-12 rounded-full bg-primary flex items-center justify-center mb-4">
        <UIcon name="i-lucide-layout-grid" class="w-6 h-6 text-primary-foreground" />
      </div>
      <h1 class="text-3xl font-semibold text-umm-text-primary">UMM 多媒体管理器</h1>
      <p class="mt-2 text-sm text-umm-text-secondary">统一管理你的观影、收听、阅读记录</p>
    </div>

    <div class="flex flex-col sm:flex-row gap-3">
      <UButton
        to="/auth/login"
        label="开始使用"
        icon="i-lucide-arrow-right"
        size="lg"
      />
    </div>

    <!-- Feature Highlights -->
    <div class="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-2xl">
      <div class="text-center">
        <div class="mx-auto w-10 h-10 rounded-full bg-info/10 flex items-center justify-center mb-3">
          <UIcon name="i-lucide-globe" class="w-5 h-5 text-info" />
        </div>
        <p class="text-sm font-medium text-umm-text-primary">多平台支持</p>
        <p class="mt-1 text-xs text-umm-text-muted">豆瓣 · IMDb · NeoDB · Bilibili · YouTube</p>
      </div>
      <div class="text-center">
        <div class="mx-auto w-10 h-10 rounded-full bg-success/10 flex items-center justify-center mb-3">
          <UIcon name="i-lucide-refresh-cw" class="w-5 h-5 text-success" />
        </div>
        <p class="text-sm font-medium text-umm-text-primary">自动同步</p>
        <p class="mt-1 text-xs text-umm-text-muted">跨设备 · 跨平台 · 实时同步</p>
      </div>
      <div class="text-center">
        <div class="mx-auto w-10 h-10 rounded-full bg-warning/10 flex items-center justify-center mb-3">
          <UIcon name="i-lucide-database" class="w-5 h-5 text-warning" />
        </div>
        <p class="text-sm font-medium text-umm-text-primary">数据管控</p>
        <p class="mt-1 text-xs text-umm-text-muted">WebDAV 备份 · 导入/导出</p>
      </div>
    </div>
  </div>
</template>
