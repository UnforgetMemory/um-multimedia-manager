<script setup lang="ts">
/**
 * SettingRow — reusable row layout for settings toggles
 *
 * Renders label + description on the left, control slot on the right.
 * Replaces the repeated pattern:
 *   <div class="flex items-center justify-between rounded-lg border p-3">
 *     <FormField :label="..." :description="..." />
 *     <Switch ... />
 *   </div>
 */
import type { HTMLAttributes } from "vue"
import { Label } from '@/shared/ui/label'

interface Props {
  label: string
  description?: string
  class?: HTMLAttributes["class"]
}

const props = defineProps<Props>()
</script>

<template>
  <div
    :class="[
      'umm:flex umm:items-center umm:justify-between umm:rounded-lg umm:border umm:p-3',
      props.class,
    ]"
  >
    <div class="umm:flex umm:flex-col umm:gap-2">
      <Label>{{ label }}</Label>
      <p v-if="description" class="umm:font-caption umm:text-secondary-content">
        {{ description }}
      </p>
    </div>
    <div class="umm:shrink-0">
      <slot />
    </div>
  </div>
</template>