<script setup lang="ts">
import type { SwitchRootEmits, SwitchRootProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import {
  SwitchRoot,
  SwitchThumb,
  useForwardPropsEmits,
} from "reka-ui"
import { cn } from "@/utils/cn"

const props = defineProps<SwitchRootProps & { class?: HTMLAttributes["class"] }>()

const emits = defineEmits<SwitchRootEmits>()

const forwarded = useForwardPropsEmits(props, emits)
</script>

<template>
  <SwitchRoot
    v-bind="forwarded"
    :class="
  cn(
      'umm:peer umm:inline-flex umm:h-6 umm:w-11 umm:shrink-0 umm:cursor-pointer umm:items-center umm:rounded-full umm:border-2 umm:border-transparent umm:transition-colors umm:focus-visible:outline-none umm:focus-visible:ring-2 umm:focus-visible:ring-ring umm:focus-visible:ring-offset-2 umm:focus-visible:ring-offset-background umm:disabled:cursor-not-allowed umm:disabled:opacity-50 umm:data-[state=checked]:bg-primary umm:data-[state=unchecked]:bg-input',
      props.class,
    )
"
  >
    <SwitchThumb
      :class="
  cn('umm:pointer-events-none umm:block umm:h-5 umm:w-5 umm:rounded-full umm:bg-background umm:shadow-lg umm:ring-0 umm:transition-transform umm:data-[state=checked]:translate-x-5')
"
    >
      <slot name="thumb" />
    </SwitchThumb>
  </SwitchRoot>
</template>

