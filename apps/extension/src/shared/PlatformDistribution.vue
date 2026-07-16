<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { PLATFORM_HUES, usePlatformColor } from '@/composables/usePlatformMeta'
import { Card, CardContent } from '@/shared/ui/card'

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
  <div class="umm:grid umm:grid-cols-1 umm:sm:grid-cols-2 umm:gap-3">
    <Card v-for="info in platformStats" :key="info.provider" class="umm:transition-all umm:hover:shadow-md umm:hover:border-primary/30">
      <CardContent class="umm:p-4">
        <div class="umm:flex umm:items-center umm:justify-between umm:mb-3">
          <div class="umm:flex umm:items-center umm:gap-3">
            <div class="umm:w-10 umm:h-10 umm:rounded-xl umm:flex umm:items-center umm:justify-center umm:text-sm umm:font-bold umm:text-white umm:shrink-0"
              :style="{ backgroundColor: usePlatformColor(PLATFORM_HUES[info.provider] || 0).icon }">
              {{ t('platform.' + info.provider, info.provider).charAt(0) }}
            </div>
            <div>
              <div class="umm:font-body umm:font-semibold umm:text-primary-content">{{ t('platform.' + info.provider, info.provider) }}</div>
              <div class="umm:font-caption umm:text-secondary-content umm:tabular-nums">{{ info.count.toLocaleString() }} {{ t('common.records') }}</div>
            </div>
          </div>
        </div>
        <div class="umm:flex umm:flex-wrap umm:gap-2">
          <span v-for="typeInfo in info.types" :key="typeInfo.label"
            class="umm:inline-flex umm:items-center umm:gap-1 umm:rounded-full umm:border umm:font-caption umm:px-3 umm:py-1"
            :style="{
              borderColor: usePlatformColor(PLATFORM_HUES[info.provider] || 0).chipBorder,
              color: usePlatformColor(PLATFORM_HUES[info.provider] || 0).chipText,
              backgroundColor: usePlatformColor(PLATFORM_HUES[info.provider] || 0).chipBg,
            }">
            <span class="umm:font-medium">{{ t('stats.' + typeInfo.label, typeInfo.label) }}</span>
            <span class="umm:opacity-70">{{ typeInfo.count }}</span>
          </span>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
