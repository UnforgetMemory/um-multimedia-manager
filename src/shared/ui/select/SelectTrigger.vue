<script setup lang="ts">
import type { SelectTriggerProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { reactiveOmit } from "@vueuse/core"
import { ChevronDown } from "lucide-vue-next"
import { SelectIcon, SelectTrigger, useForwardProps } from "reka-ui"
import { cn } from "@/utils/cn"

const props = defineProps<SelectTriggerProps & { class?: HTMLAttributes["class"] }>()

const delegatedProps = reactiveOmit(props, "class")

const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
  <SelectTrigger
    v-bind="forwardedProps"
    :class="
  cn(
      'umm:flex umm:h-10 umm:w-full umm:items-center umm:justify-between umm:rounded-md umm:border umm:border-input umm:bg-background umm:px-3 umm:py-2 umm:text-sm umm:ring-offset-background umm:data-[placeholder]:text-muted-foreground umm:focus:outline-none umm:focus:ring-2 umm:focus:ring-ring umm:focus:ring-offset-2 umm:disabled:cursor-not-allowed umm:disabled:opacity-50 umm:[&>span]:truncate umm:text-start',
      props.class,
    )
"
  >
    <slot />
    <SelectIcon as-child>
      <ChevronDown class="umm:w-4 umm:h-4 umm:opacity-50 umm:shrink-0" />
    </SelectIcon>
  </SelectTrigger>
</template>

