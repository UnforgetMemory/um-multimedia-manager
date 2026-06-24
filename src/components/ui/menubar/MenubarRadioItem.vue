<script setup lang="ts">
import type { MenubarRadioItemEmits, MenubarRadioItemProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { reactiveOmit } from "@vueuse/core"
import { Circle } from "lucide-vue-next"
import {
  MenubarItemIndicator,
  MenubarRadioItem,
  useForwardPropsEmits,
} from "reka-ui"
import { cn } from "@/utils/cn"

const props = defineProps<MenubarRadioItemProps & { class?: HTMLAttributes["class"] }>()
const emits = defineEmits<MenubarRadioItemEmits>()

const delegatedProps = reactiveOmit(props, "class")

const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <MenubarRadioItem
    v-bind="forwarded"
    :class="cn(
      'relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      props.class,
    )"
  >
    <span class="umm-absolute umm-left-2 umm-flex umm-h-3.5 umm-w-3.5 umm-items-center umm-justify-center">
      <MenubarItemIndicator>
        <Circle class="umm-h-2 umm-w-2 fill-current" />
      </MenubarItemIndicator>
    </span>
    <slot />
  </MenubarRadioItem>
</template>

