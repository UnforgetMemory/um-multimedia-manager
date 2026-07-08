<script setup lang="ts">
import { useThemeStore } from '@/stores/theme'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'
import { Sun, Moon, Monitor, Globe } from 'lucide-vue-next'
import { LOCALE_OPTIONS, persistLocale } from '@/shared/plugins/i18n'
import type { Locale } from '@/shared/locales'
import SectionContainer from '@/shared/ui/section-container/SectionContainer.vue'
import SectionHeader from '@/shared/ui/section-header/SectionHeader.vue'
import { OptionPicker } from '@/shared/ui/option-picker'

const { t, locale } = useI18n()
const themeStore = useThemeStore()
const { theme } = storeToRefs(themeStore)

const themeOptions = [
  { value: 'light' as const, key: 'appearance.light' as const, icon: Sun },
  { value: 'dark' as const, key: 'appearance.dark' as const, icon: Moon },
  { value: 'auto' as const, key: 'appearance.system' as const, icon: Monitor },
]

const localeOptions = LOCALE_OPTIONS.map(o => ({ value: o.value, label: o.label }))

function setLocale(value: Locale) {
  locale.value = value
  persistLocale(value)
}
</script>

<template>
  <SectionContainer>
    <!-- Theme -->
    <Card>
      <CardHeader class="umm:pb-3">
        <SectionHeader :title="t('appearance.theme')" />
      </CardHeader>
      <CardContent>
        <OptionPicker
          :options="themeOptions.map(o => ({ value: o.value, label: t(o.key), icon: o.icon }))"
          :modelValue="theme"
          @update:modelValue="theme = $event as 'light' | 'dark' | 'auto'"
        />
      </CardContent>
    </Card>

    <!-- Language -->
    <Card>
      <CardHeader class="umm:pb-3">
        <SectionHeader :title="t('appearance.language')">
          <template #icon>
            <Globe class="umm:w-5 umm:h-5" />
          </template>
        </SectionHeader>
      </CardHeader>
      <CardContent>
        <OptionPicker
          :options="localeOptions"
          :modelValue="locale"
          compact
          @update:modelValue="setLocale($event as Locale)"
        />
      </CardContent>
    </Card>
  </SectionContainer>
</template>
