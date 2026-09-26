<script setup lang="ts">
import { forwardProps } from '@/libraries/ui/forward-props'
import type { DialogDescriptionProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { reactiveOmit } from "@vueuse/core"
import { DialogDescription } from "reka-ui"
import { cn } from "@/libraries/utils/cn"

const props = defineProps<DialogDescriptionProps & { class?: HTMLAttributes["class"] }>()

const delegatedProps = reactiveOmit(props, "class")

const forwardedProps = forwardProps(delegatedProps)
</script>

<template vapor>
  <DialogDescription
    v-bind="forwardedProps"
    :class="cn('umm:text-sm umm:text-muted-foreground', props.class)"
  >
    <slot />
  </DialogDescription>
</template>

