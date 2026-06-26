<script setup lang="ts">
import type { SelectContentEmits, SelectContentProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { reactiveOmit } from "@vueuse/core"
import {
  SelectContent,
  SelectPortal,
  SelectViewport,
  useForwardPropsEmits,
} from "reka-ui"
import { cn } from "@/utils/cn"
import { SelectScrollDownButton, SelectScrollUpButton } from "."

defineOptions({
  inheritAttrs: false,
})

const props = withDefaults(
  defineProps<SelectContentProps & { class?: HTMLAttributes["class"] }>(),
  {
    position: "popper",
  },
)
const emits = defineEmits<SelectContentEmits>()

const delegatedProps = reactiveOmit(props, "class")

const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <SelectPortal>
    <SelectContent
      v-bind="{ ...forwarded, ...$attrs }" :class="cn('umm:relative umm:z-50 umm:max-h-96 umm:min-w-32 umm:overflow-hidden umm:rounded-md umm:border umm:bg-popover umm:text-popover-foreground umm:shadow-md umm:data-[state=open]:animate-in umm:data-[state=closed]:animate-out umm:data-[state=closed]:fade-out-0 umm:data-[state=open]:fade-in-0 umm:data-[state=closed]:zoom-out-95 umm:data-[state=open]:zoom-in-95 umm:data-[side=bottom]:slide-in-from-top-2 umm:data-[side=left]:slide-in-from-right-2 umm:data-[side=right]:slide-in-from-left-2 umm:data-[side=top]:slide-in-from-bottom-2', position === 'popper' && 'umm:data-[side=bottom]:translate-y-1 umm:data-[side=left]:-translate-x-1 umm:data-[side=right]:translate-x-1 umm:data-[side=top]:-translate-y-1', props.class)"
    >
      <SelectScrollUpButton />
      <SelectViewport :class="cn('umm:p-1', position === 'popper' && 'umm:h-[--reka-select-trigger-height] umm:w-full umm:min-w-[--reka-select-trigger-width]')">
        <slot />
      </SelectViewport>
      <SelectScrollDownButton />
    </SelectContent>
  </SelectPortal>
</template>

