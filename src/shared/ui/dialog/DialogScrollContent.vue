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
      class="umm:fixed umm:inset-0 umm:z-50 umm:grid umm:place-items-center umm:overflow-y-auto umm:bg-black/80 umm:data-[state=open]:animate-in umm:data-[state=closed]:animate-out umm:data-[state=closed]:fade-out-0 umm:data-[state=open]:fade-in-0"
    >
      <DialogContent
        :class="cn('umm:relative umm:z-50 umm:grid umm:w-full umm:max-w-lg umm:my-8 umm:gap-4 umm:border umm:border-border umm:bg-background umm:p-6 umm:shadow-lg umm:duration-200 umm:sm:rounded-lg umm:md:w-full', props.class)"
        v-bind="forwarded"
        @pointer-down-outside="(event) => {
          const originalEvent = event.detail.originalEvent;
          const target = originalEvent.target as HTMLElement;
          if (originalEvent.offsetX > target.clientWidth || originalEvent.offsetY > target.clientHeight) {
            event.preventDefault();
          }
        }"
      >
        <slot />

        <DialogClose
          class="umm:absolute umm:top-3 umm:right-3 umm:p-0.5 umm:transition-colors umm:rounded-md umm:hover:bg-secondary"
        >
          <X class="umm:w-4 umm:h-4" />
          <span class="umm:sr-only">Close</span>
        </DialogClose>
      </DialogContent>
    </DialogOverlay>
  </DialogPortal>
</template>

