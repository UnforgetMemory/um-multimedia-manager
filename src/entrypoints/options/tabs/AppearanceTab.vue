<script setup lang="ts">
import { useThemeStore } from '@/stores/theme'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'
import { Button } from '@/shared/ui/button'
import { Sun, Moon, Monitor, Globe } from 'lucide-vue-next'
import { LOCALE_OPTIONS, persistLocale } from '@/shared/plugins/i18n'
import type { Locale } from '@/shared/locales'
import SectionContainer from '@/shared/ui/section-container/SectionContainer.vue'
import SectionHeader from '@/shared/ui/section-header/SectionHeader.vue'

const { t, locale } = useI18n()
const themeStore = useThemeStore()
const { theme } = storeToRefs(themeStore)

const themeOptions = [
  { value: 'light' as const, key: 'appearance.light' as const, icon: Sun },
  { value: 'dark' as const, key: 'appearance.dark' as const, icon: Moon },
  { value: 'auto' as const, key: 'appearance.system' as const, icon: Monitor },
]

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
        <div class="umm:grid umm:grid-cols-3 umm:gap-3">
          <Button
            v-for="opt in themeOptions"
            :key="opt.value"
            variant="outline"
            @click="theme = opt.value"
            :class="['umm:flex umm:flex-col umm:items-center umm:gap-2 umm:p-4 umm:h-auto', theme === opt.value ? 'umm:border-primary umm:bg-primary/5' : '']"
          >
            <component :is="opt.icon" class="umm:w-5 umm:h-5" :class="theme === opt.value ? 'umm:text-primary' : 'umm:text-muted-foreground'" />
            <span class="umm:text-sm umm:font-medium">{{ t(opt.key) }}</span>
          </Button>
        </div>
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
        <div class="umm:grid umm:grid-cols-3 umm:gap-3">
          <Button
            v-for="opt in LOCALE_OPTIONS"
            :key="opt.value"
            variant="outline"
            @click="setLocale(opt.value)"
            :class="['umm:flex umm:flex-col umm:items-center umm:gap-1 umm:p-3 umm:h-auto umm:text-center', locale === opt.value ? 'umm:border-primary umm:bg-primary/5' : '']"
          >
            <span class="umm:text-sm umm:font-medium">{{ opt.label }}</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  </SectionContainer>
</template>
