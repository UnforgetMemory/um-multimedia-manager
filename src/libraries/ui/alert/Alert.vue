<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import type { AlertVariants } from "../../../libraries/ui/alert"
import { cn } from "@/libraries/utils/cn"
import { alertVariants } from "../../../libraries/ui/alert"

const props = defineProps<{
  class?: HTMLAttributes["class"]
  variant?: AlertVariants["variant"]
}>()
</script>

<template vapor>
  <div :class="cn(alertVariants({ variant }), props.class)" role="alert">
    <slot />
  </div>
</template>

