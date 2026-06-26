<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/utils/cn'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <div :class="
  cn('umm:text-2xl umm:font-semibold umm:leading-none umm:tracking-tight', props.class)
">
    <slot />
  </div>
</template>

