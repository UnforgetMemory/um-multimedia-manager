<script setup lang="ts">
import type { DialogContentEmits, DialogContentProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { reactiveOmit } from "@vueuse/core"
import { X } from "lucide-vue-next"
import {
  DialogClose,
  DialogContent,
  DialogOverlay,
  DialogPortal,
  useForwardPropsEmits,
} from "reka-ui"
import { cn } from "@/utils/cn"

const props = defineProps<DialogContentProps & { class?: HTMLAttributes["class"] }>()
const emits = defineEmits<DialogContentEmits>()

const delegatedProps = reactiveOmit(props, "class")

const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <DialogPortal>
    <DialogOverlay
      class="umm:fixed umm:inset-0 umm:z-50 umm:bg-black/80 umm:data-[state=open]:animate-in umm:data-[state=closed]:animate-out umm:data-[state=closed]:fade-out-0 umm:data-[state=open]:fade-in-0"
    />
    <DialogContent
      v-bind="forwarded"
      :class="cn('umm:fixed umm:left-1/2 umm:top-1/2 umm:z-50 umm:grid umm:w-full umm:max-w-lg umm:-translate-x-1/2 umm:-translate-y-1/2 umm:gap-4 umm:border umm:bg-background umm:p-6 umm:shadow-lg umm:duration-200 umm:data-[state=open]:animate-in umm:data-[state=closed]:animate-out umm:data-[state=closed]:fade-out-0 umm:data-[state=open]:fade-in-0 umm:data-[state=closed]:zoom-out-95 umm:data-[state=open]:zoom-in-95 umm:data-[state=closed]:slide-out-to-left-1/2 umm:data-[state=closed]:slide-out-to-top-[48%] umm:data-[state=open]:slide-in-from-left-1/2 umm:data-[state=open]:slide-in-from-top-[48%] umm:sm:rounded-lg', props.class,
        )
"
    >
      <slot />

      <DialogClose
        class="umm:absolute umm:right-4 umm:top-4 umm:rounded-sm umm:opacity-70 umm:ring-offset-background umm:transition-opacity umm:hover:opacity-100 umm:focus:outline-none umm:focus:ring-2 umm:focus:ring-ring umm:focus:ring-offset-2 umm:disabled:pointer-events-none umm:data-[state=open]:bg-accent umm:data-[state=open]:text-muted-foreground"
      >
        <X class="umm:w-4 umm:h-4" />
        <span class="umm:sr-only">Close</span>
      </DialogClose>
    </DialogContent>
  </DialogPortal>
</template>

