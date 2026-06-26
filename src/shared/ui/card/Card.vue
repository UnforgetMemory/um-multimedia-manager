<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/utils/cn'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <div
    :class="
  cn(
        'umm:rounded-lg umm:border umm:bg-card umm:text-card-foreground umm:shadow-sm',
        props.class,
      )
"
  >
    <slot />
  </div>
</template>

