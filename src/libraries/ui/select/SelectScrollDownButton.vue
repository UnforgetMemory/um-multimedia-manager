<script setup lang="ts">
import { forwardProps } from '@/libraries/ui/forward-props'
import type { SelectScrollDownButtonProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { reactiveOmit } from "@vueuse/core"
import { ChevronDown } from "lucide-vue-next"
import { SelectScrollDownButton } from "reka-ui"
import { cn } from "@/libraries/utils/cn"

const props = defineProps<SelectScrollDownButtonProps & { class?: HTMLAttributes["class"] }>()

const delegatedProps = reactiveOmit(props, "class")

const forwardedProps = forwardProps(delegatedProps)
</script>

<template vapor>
  <SelectScrollDownButton v-bind="forwardedProps" :class="cn('umm:flex umm:cursor-default umm:items-center umm:justify-center umm:py-1', props.class)">
    <slot>
      <ChevronDown class="umm:h-4 umm:w-4" />
    </slot>
  </SelectScrollDownButton>
</template>

