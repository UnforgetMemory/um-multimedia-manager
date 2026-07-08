<script setup lang="ts">
import type { FunctionalComponent, SVGAttributes } from 'vue'
import { Card, CardContent } from '@/shared/ui/card'

defineProps<{
  icon: FunctionalComponent<SVGAttributes>
  label: string
  value: number
  loading?: boolean
}>()
</script>

<template>
  <Card class="umm:p-3 umm:text-center umm:overflow-hidden">
    <CardContent class="umm:p-0">
      <component :is="icon" class="umm:w-5 umm:h-5 umm:mx-auto umm:mb-1.5 umm:text-secondary-content" />
      <div
        class="umm:text-base umm:sm:text-lg umm:font-bold umm:tracking-tight umm:text-primary-content umm:truncate umm:tabular-nums"
        :class="
  { 'umm:animate-pulse': loading }
"
      >
        {{ loading ? '—' : value.toLocaleString() }}
      </div>
      <div class="umm:text-sm umm:text-secondary-content umm:mt-1">{{ label }}</div>
    </CardContent>
  </Card>
</template>
