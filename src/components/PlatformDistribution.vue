<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { PLATFORM_HUES, usePlatformColor } from '@/composables/usePlatformMeta'

const { t } = useI18n()

type PlatformInfo = {
  provider: string
  count: number
  types: { label: string; count: number }[]
}

defineProps<{
  platformStats: PlatformInfo[]
}>()
</script>

<template>
  <div class="grid grid-cols-1 sm:grid-cols-2" :style="{ gap: 'var(--space-3)' }">
    <div v-for="info in platformStats" :key="info.provider"
      class="rounded-xl border border-border bg-card transition-all hover:shadow-md hover:border-primary/30"
      :style="{ padding: 'var(--card-padding)' }">
      <div class="flex items-center justify-between" :style="{ marginBottom: 'var(--space-3)' }">
        <div class="flex items-center" :style="{ gap: 'var(--space-3)' }">
          <div class="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold text-white shrink-0"
            :style="{ backgroundColor: usePlatformColor(PLATFORM_HUES[info.provider] || 0).icon }">
            {{ t('platform.' + info.provider, info.provider).charAt(0) }}
          </div>
          <div>
            <div class="font-body font-semibold text-primary-content">{{ t('platform.' + info.provider, info.provider) }}</div>
            <div class="font-caption text-secondary-content tabular-nums">{{ info.count.toLocaleString() }} {{ t('common.records') }}</div>
          </div>
        </div>
      </div>
      <div class="flex flex-wrap" :style="{ gap: 'var(--space-2)' }">
        <span v-for="typeInfo in info.types" :key="typeInfo.label"
          class="inline-flex items-center gap-1 rounded-full border font-caption"
          :style="{
            padding: 'var(--space-1) var(--space-3)',
            borderColor: usePlatformColor(PLATFORM_HUES[info.provider] || 0).chipBorder,
            color: usePlatformColor(PLATFORM_HUES[info.provider] || 0).chipText,
            backgroundColor: usePlatformColor(PLATFORM_HUES[info.provider] || 0).chipBg,
          }">
          <span class="font-medium">{{ t('stats.' + typeInfo.label, typeInfo.label) }}</span>
          <span class="opacity-70">{{ typeInfo.count }}</span>
        </span>
      </div>
    </div>
  </div>
</template>
