<script setup lang="ts">
import { useTheme } from '@/composables/useTheme'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Sun, Moon, Monitor } from 'lucide-vue-next'

const { theme, fontSize, density } = useTheme()

const themeOptions = [
  { value: 'light' as const, label: '浅色', icon: Sun },
  { value: 'dark' as const, label: '深色', icon: Moon },
  { value: 'auto' as const, label: '跟随系统', icon: Monitor },
]

const fontSizeOptions = [
  { value: 'compact' as const, label: '紧凑', desc: '更小的字体' },
  { value: 'default' as const, label: '标准', desc: '默认大小' },
  { value: 'comfortable' as const, label: '宽松', desc: '更大的字体' },
]

const densityOptions = [
  { value: 'compact' as const, label: '紧凑', desc: '更小的间距' },
  { value: 'default' as const, label: '标准', desc: '默认间距' },
  { value: 'comfortable' as const, label: '宽松', desc: '更大的间距' },
]
</script>

<template>
  <div class="space-y-6">
    <!-- Theme -->
    <Card>
      <CardHeader class="pb-3">
        <CardTitle class="font-h2 text-primary-content">主题</CardTitle>
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
            <span class="text-sm-scaled font-medium">{{ opt.label }}</span>
          </button>
        </div>
      </CardContent>
    </Card>

    <!-- Font Size -->
    <Card>
      <CardHeader class="pb-3">
        <CardTitle class="font-h2 text-primary-content">字体大小</CardTitle>
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
            <span class="text-sm-scaled font-medium">{{ opt.label }}</span>
            <span class="text-xs-scaled text-muted-foreground">{{ opt.desc }}</span>
          </button>
        </div>
      </CardContent>
    </Card>

    <!-- Density -->
    <Card>
      <CardHeader class="pb-3">
        <CardTitle class="font-h2 text-primary-content">间距密度</CardTitle>
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
            <span class="text-sm-scaled font-medium">{{ opt.label }}</span>
            <span class="text-xs-scaled text-muted-foreground">{{ opt.desc }}</span>
          </button>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
