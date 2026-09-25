<script lang="ts">
export type Accent = 'brand' | 'violet' | 'rose' | 'amber' | 'gold' | 'teal' | 'blue' | 'green' | 'red'
</script>
<script setup lang="ts">
import type { FunctionalComponent, SVGAttributes } from 'vue'
import { computed } from 'vue'
import { Card, CardContent } from '@/shared/ui/card'

/** Categorical accents derived from tokens.static.css ramps (ADR-018 D3) */
const ACCENT_VARS: Record<Accent, string> = {
  brand: 'var(--umm-static-brand-500)',
  violet: 'var(--umm-static-violet-500)',
  rose: 'var(--umm-static-rose-500)',
  amber: 'var(--umm-static-amber-500)',
  gold: 'var(--umm-static-gold-500)',
  teal: 'var(--umm-static-teal-500)',
  blue: 'var(--umm-static-blue-500)',
  green: 'var(--umm-static-green-500)',
  red: 'var(--umm-static-red-500)',
}

const props = defineProps<{
  icon: FunctionalComponent<SVGAttributes>
  label: string
  value: number
  loading?: boolean
  /** Optional categorical accent for the icon (defaults to muted) */
  accent?: Accent
}>()

const iconColor = computed(() =>
  props.accent ? { color: ACCENT_VARS[props.accent] } : undefined,
)
</script>

<template>
  <Card class="umm:p-3 umm:text-center umm:overflow-hidden">
    <CardContent class="umm:p-0">
      <component
        :is="icon"
        class="umm:w-5 umm:h-5 umm:mx-auto umm:mb-1.5"
        :class="accent ? '' : 'umm:text-secondary-content'"
        :style="iconColor"
      />
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
