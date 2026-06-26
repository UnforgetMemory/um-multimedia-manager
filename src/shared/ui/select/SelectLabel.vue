<script setup lang="ts">
import type { SelectLabelProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { SelectLabel } from "reka-ui"
import { cn } from "@/utils/cn"

const props = defineProps<SelectLabelProps & { class?: HTMLAttributes["class"] }>()
</script>

<template>
  <SelectLabel :class="cn('umm:py-1.5 umm:pl-8 umm:pr-2 umm:text-sm umm:font-semibold', props.class)">
    <slot />
  </SelectLabel>
</template>

