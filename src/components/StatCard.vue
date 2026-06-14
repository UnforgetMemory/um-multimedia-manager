<script setup lang="ts">
import type { FunctionalComponent, SVGAttributes } from 'vue'
import { Card, CardContent } from '@/components/ui/card'

defineProps<{
  icon: FunctionalComponent<SVGAttributes>
  label: string
  value: number
  loading?: boolean
}>()
</script>

<template>
  <Card class="p-3 text-center overflow-hidden">
    <CardContent class="p-0">
      <component :is="icon" class="w-5 h-5 mx-auto mb-1.5 text-secondary-content" />
      <div
        class="text-xl sm:text-2xl font-bold tracking-tight text-primary-content truncate tabular-nums"
        :class="{ 'animate-pulse': loading }"
      >
        {{ loading ? '—' : value.toLocaleString() }}
      </div>
      <div class="text-xs-scaled text-secondary-content mt-1">{{ label }}</div>
    </CardContent>
  </Card>
</template>
