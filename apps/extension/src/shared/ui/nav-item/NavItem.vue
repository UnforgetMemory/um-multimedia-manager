<script setup lang="ts">
import type { FunctionalComponent, SVGAttributes } from 'vue'

defineProps<{
  icon: FunctionalComponent<SVGAttributes>
  label: string
  active?: boolean
}>()

const emit = defineEmits<{
  click: []
}>()
</script>

<template>
  <button
    @click="emit('click')"
    :class="[
      'umm:w-full umm:flex umm:items-center umm:gap-3 umm:rounded-lg umm:font-medium umm:transition-all umm:duration-200 umm:px-3 umm:py-2',
      active
        ? 'umm:bg-primary umm:text-primary-foreground umm:shadow-sm'
        : 'umm:text-secondary-content umm:hover:bg-muted umm:hover:text-primary-content'
    ]"
    style="font-size: var(--umm-font-body-size)"
  >
    <component :is="icon" class="umm:h-4 umm:w-4 umm:shrink-0" />
    <span>{{ label }}</span>
  </button>
</template>
