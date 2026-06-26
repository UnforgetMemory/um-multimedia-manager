<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { cn } from "@/utils/cn"

const props = defineProps<{ class?: HTMLAttributes["class"] }>()
</script>

<template>
  <div
    :class="cn('umm:flex umm:flex-col-reverse umm:sm:flex-row umm:sm:justify-end umm:sm:gap-x-2', props.class,
      )
"
  >
    <slot />
  </div>
</template>

