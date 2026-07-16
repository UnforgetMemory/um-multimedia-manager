<script setup lang="ts">
import type { SeparatorProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { reactiveOmit } from "@vueuse/core"
import { Separator } from "reka-ui"
import { cn } from "@/utils/cn"

const props = withDefaults(defineProps<
  SeparatorProps & { class?: HTMLAttributes["class"] }
>(), {
  orientation: "horizontal",
  decorative: true,
})

const delegatedProps = reactiveOmit(props, "class")
</script>

<template>
  <Separator
    v-bind="delegatedProps"
    :class="
  cn(
        'umm:shrink-0 umm:bg-border',
        props.orientation === 'horizontal' ? 'umm:h-px umm:w-full' : 'umm:w-px umm:h-full',
        props.class,
      )
"
  />
</template>

