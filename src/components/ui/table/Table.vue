<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { cn } from "@/utils/cn"

const props = defineProps<{
  class?: HTMLAttributes["class"]
}>()
</script>

<template>
  <div class="umm-relative umm-w-full umm-overflow-auto">
    <table :class="cn('w-full caption-bottom text-sm', props.class)">
      <slot />
    </table>
  </div>
</template>

