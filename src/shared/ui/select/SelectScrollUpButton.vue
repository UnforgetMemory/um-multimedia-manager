<script setup lang="ts">
import type { SelectScrollUpButtonProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { reactiveOmit } from "@vueuse/core"
import { ChevronUp } from "lucide-vue-next"
import { SelectScrollUpButton, useForwardProps } from "reka-ui"
import { cn } from "@/utils/cn"

const props = defineProps<SelectScrollUpButtonProps & { class?: HTMLAttributes["class"] }>()

const delegatedProps = reactiveOmit(props, "class")

const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
  <SelectScrollUpButton v-bind="forwardedProps" :class="cn('umm:flex umm:cursor-default umm:items-center umm:justify-center umm:py-1', props.class)">
    <slot>
      <ChevronUp class="umm:h-4 umm:w-4" />
    </slot>
  </SelectScrollUpButton>
</template>

