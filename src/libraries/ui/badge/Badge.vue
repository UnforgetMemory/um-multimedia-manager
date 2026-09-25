<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import type { BadgeVariants } from "../../../libraries/ui/badge"
import { cn } from "@/libraries/utils/cn"
import { badgeVariants } from "../../../libraries/ui/badge"

const props = defineProps<{
  variant?: BadgeVariants["variant"]
  class?: HTMLAttributes["class"]
}>()
</script>

<template>
  <div :class="cn(badgeVariants({ variant }), props.class)">
    <slot />
  </div>
</template>

