<script setup lang="ts">
import { useThemeStore } from '@/stores/theme'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Sun, Moon, Monitor, Globe } from 'lucide-vue-next'
import { LOCALE_OPTIONS, persistLocale } from '@/plugins/i18n'
import type { Locale } from '@/locales'

const { t, locale } = useI18n()
const themeStore = useThemeStore()
const { theme, fontSize, density } = storeToRefs(themeStore)

const themeOptions = [
  { value: 'light' as const, key: 'appearance.light' as const, icon: Sun },
  { value: 'dark' as const, key: 'appearance.dark' as const, icon: Moon },
  { value: 'auto' as const, key: 'appearance.system' as const, icon: Monitor },
]

const fontSizeOptions = [
  { value: 'compact' as const, labelKey: 'appearance.compact' as const, descKey: 'appearance.fontDesc.compact' as const },
  { value: 'default' as const, labelKey: 'appearance.default' as const, descKey: 'appearance.fontDesc.default' as const },
  { value: 'comfortable' as const, labelKey: 'appearance.comfortable' as const, descKey: 'appearance.fontDesc.comfortable' as const },
]

const densityOptions = [
  { value: 'compact' as const, labelKey: 'appearance.compact' as const, descKey: 'appearance.densityDesc.compact' as const },
  { value: 'default' as const, labelKey: 'appearance.default' as const, descKey: 'appearance.densityDesc.default' as const },
  { value: 'comfortable' as const, labelKey: 'appearance.comfortable' as const, descKey: 'appearance.densityDesc.comfortable' as const },
]

function setLocale(value: Locale) {
  locale.value = value
  persistLocale(value)
}
</script>

<template>
  <div class="space-y-6">
    <!-- Theme -->
    <Card>
      <CardHeader class="pb-3">
        <CardTitle class="font-h2 text-primary-content">{{ t('appearance.theme') }}</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="grid grid-cols-3 gap-3">
          <button
            v-for="opt in themeOptions"
            :key="opt.value"
            @click="theme = opt.value"
            :class="[
              'flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all',
              theme === opt.value
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            ]"
          >
            <component :is="opt.icon" class="w-5 h-5" :class="theme === opt.value ? 'text-primary' : 'text-muted-foreground'" />
            <span class="text-sm-scaled font-medium">{{ t(opt.key) }}</span>
          </button>
        </div>
      </CardContent>
    </Card>

    <!-- Font Size -->
    <Card>
      <CardHeader class="pb-3">
        <CardTitle class="font-h2 text-primary-content">{{ t('appearance.fontSize') }}</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="grid grid-cols-3 gap-3">
          <button
            v-for="opt in fontSizeOptions"
            :key="opt.value"
            @click="fontSize = opt.value"
            :class="[
              'flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all text-center',
              fontSize === opt.value
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            ]"
          >
            <span class="text-sm-scaled font-medium">{{ t(opt.labelKey) }}</span>
            <span class="text-xs-scaled text-muted-foreground">{{ t(opt.descKey) }}</span>
          </button>
        </div>
      </CardContent>
    </Card>

    <!-- Language -->
    <Card>
      <CardHeader class="pb-3">
        <CardTitle class="font-h2 text-primary-content flex items-center gap-2">
          <Globe class="w-5 h-5" />
          {{ t('appearance.language') }}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div class="grid grid-cols-3 gap-3">
          <button
            v-for="opt in LOCALE_OPTIONS"
            :key="opt.value"
            @click="setLocale(opt.value)"
            :class="[
              'flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all text-center',
              locale === opt.value
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            ]"
          >
            <span class="text-sm-scaled font-medium">{{ opt.label }}</span>
          </button>
        </div>
      </CardContent>
    </Card>

    <!-- Density -->
    <Card>
      <CardHeader class="pb-3">
        <CardTitle class="font-h2 text-primary-content">{{ t('appearance.density') }}</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="grid grid-cols-3 gap-3">
          <button
            v-for="opt in densityOptions"
            :key="opt.value"
            @click="density = opt.value"
            :class="[
              'flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all text-center',
              density === opt.value
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            ]"
          >
            <span class="text-sm-scaled font-medium">{{ t(opt.labelKey) }}</span>
            <span class="text-xs-scaled text-muted-foreground">{{ t(opt.descKey) }}</span>
          </button>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
