<script setup lang="ts">
/**
 * OptionPicker — grid of selectable option buttons (single-select)
 *
 * Extracts the repeated 3-column button grid pattern from AppearanceTab
 * (theme options + language options).
 */
import type { FunctionalComponent, SVGAttributes } from 'vue'
import { Button } from '@/shared/ui/button'

interface OptionPickerOption {
  value: string
  label: string
  icon?: FunctionalComponent<SVGAttributes>
}

defineProps<{
  options: OptionPickerOption[]
  modelValue: string
  columns?: number
  compact?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()
</script>

<template>
  <div
    class="umm:grid"
    :style="{ gridTemplateColumns: `repeat(${columns || 3}, minmax(0, 1fr))`, gap: 'var(--umm-spacing-3)' }"
  >
    <Button
      v-for="opt in options"
      :key="opt.value"
      variant="outline"
      @click="emit('update:modelValue', opt.value)"
      :class="[
        'umm:flex umm:flex-col umm:items-center umm:h-auto',
        compact
          ? 'umm:gap-1 umm:p-3 umm:text-center'
          : 'umm:gap-2 umm:p-4',
        modelValue === opt.value
          ? 'umm:border-primary umm:bg-primary/5'
          : '',
      ]"
    >
      <component
        v-if="opt.icon"
        :is="opt.icon"
        class="umm:w-5 umm:h-5"
        :class="modelValue === opt.value ? 'umm:text-primary' : 'umm:text-muted-foreground'"
      />
      <span class="umm:text-sm umm:font-medium">{{ opt.label }}</span>
    </Button>
  </div>
</template>
