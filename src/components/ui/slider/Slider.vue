<script setup lang="ts">
import type { SliderRootEmits, SliderRootProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { reactiveOmit } from "@vueuse/core"
import { SliderRange, SliderRoot, SliderThumb, SliderTrack, useForwardPropsEmits } from "reka-ui"
import { cn } from "@/utils/cn"

const props = defineProps<SliderRootProps & { class?: HTMLAttributes["class"] }>()
const emits = defineEmits<SliderRootEmits>()

const delegatedProps = reactiveOmit(props, "class")

const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <SliderRoot
    :class="cn(
      'relative flex w-full touch-none select-none items-center data-[orientation=vertical]:flex-col data-[orientation=vertical]:w-2 data-[orientation=vertical]:h-full',
      props.class,
    )"
    v-bind="forwarded"
  >
    <SliderTrack class="umm-relative umm-h-2 umm-w-full umm-data-[orientation=vertical]:w-2 grow umm-overflow-hidden umm-rounded-full bg-secondary">
      <SliderRange class="umm-absolute umm-h-full umm-data-[orientation=vertical]:w-full bg-primary" />
    </SliderTrack>
    <SliderThumb
      v-for="(_, key) in modelValue"
      :key="key"
      class="umm-block umm-h-5 umm-w-5 umm-rounded-full umm-border-2 border-primary bg-background ring-offset-background umm-transition-colors umm-focus-visible:outline-none umm-focus-visible:ring-2 umm-focus-visible:ring-ring umm-focus-visible:ring-offset-2 umm-disabled:pointer-events-none umm-disabled:opacity-50"
    />
  </SliderRoot>
</template>

