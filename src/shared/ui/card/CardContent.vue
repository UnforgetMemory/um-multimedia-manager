<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/utils/cn'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <div :class="
  cn('umm:px-6 umm:pb-6', props.class)
">
    <slot />
  </div>
</template>

