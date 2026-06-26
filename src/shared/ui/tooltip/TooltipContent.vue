<script setup lang="ts">
import type { TooltipContentEmits, TooltipContentProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { reactiveOmit } from "@vueuse/core"
import { TooltipContent, TooltipPortal, useForwardPropsEmits } from "reka-ui"
import { cn } from "@/utils/cn"

defineOptions({
  inheritAttrs: false,
})

const props = withDefaults(defineProps<TooltipContentProps & { class?: HTMLAttributes["class"] }>(), {
  sideOffset: 4,
})

const emits = defineEmits<TooltipContentEmits>()

const delegatedProps = reactiveOmit(props, "class")

const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <TooltipPortal>
    <TooltipContent v-bind="{ ...forwarded, ...$attrs }" :class="cn('umm:z-50 umm:overflow-hidden umm:rounded-md umm:border umm:bg-popover umm:px-3 umm:py-1.5 umm:text-sm umm:text-popover-foreground umm:shadow-md umm:animate-in fade-in-0 zoom-in-95 umm:data-[state=closed]:animate-out umm:data-[state=closed]:fade-out-0 umm:data-[state=closed]:zoom-out-95 umm:data-[side=bottom]:slide-in-from-top-2 umm:data-[side=left]:slide-in-from-right-2 umm:data-[side=right]:slide-in-from-left-2 umm:data-[side=top]:slide-in-from-bottom-2', props.class)">
      <slot />
    </TooltipContent>
  </TooltipPortal>
</template>

