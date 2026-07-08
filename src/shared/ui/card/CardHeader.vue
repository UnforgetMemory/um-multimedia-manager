<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/utils/cn'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <div :class="
  cn('umm:flex umm:flex-col umm:gap-1.5 umm:p-[var(--umm-card-padding)] umm:pb-4', props.class)
">
    <slot />
  </div>
</template>

