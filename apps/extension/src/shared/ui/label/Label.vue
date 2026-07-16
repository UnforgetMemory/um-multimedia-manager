<script setup lang="ts">
import type { LabelProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { reactiveOmit } from "@vueuse/core"
import { Label } from "reka-ui"
import { cn } from "@/utils/cn"

const props = defineProps<LabelProps & { class?: HTMLAttributes["class"] }>()

const delegatedProps = reactiveOmit(props, "class")
</script>

<template>
  <Label
    v-bind="delegatedProps"
    :class="cn('umm:text-sm umm:font-medium umm:leading-none umm:pb-1.5 umm:peer-disabled:cursor-not-allowed umm:peer-disabled:opacity-70', props.class,
      )
"
  >
    <slot />
  </Label>
</template>

