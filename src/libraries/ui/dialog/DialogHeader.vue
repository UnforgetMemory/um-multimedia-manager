<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { cn } from "@/libraries/utils/cn"

const props = defineProps<{
  class?: HTMLAttributes["class"]
}>()
</script>

<template vapor>
  <div
    :class="cn('umm:flex umm:flex-col umm:gap-y-1.5 umm:text-center umm:sm:text-left', props.class)"
  >
    <slot />
  </div>
</template>

