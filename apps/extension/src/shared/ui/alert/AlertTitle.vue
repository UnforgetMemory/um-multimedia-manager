<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { cn } from "@/utils/cn"

const props = defineProps<{
  class?: HTMLAttributes["class"]
}>()
</script>

<template>
  <h5 :class="cn('umm:mb-1 umm:font-medium umm:leading-none umm:tracking-tight', props.class)">
    <slot />
  </h5>
</template>

