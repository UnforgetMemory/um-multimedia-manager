<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { Button } from '@/shared/ui/button'
import type { ButtonVariants } from '@/shared/ui/button'
import { cn } from '@/utils/cn'

/**
 * IconButton — accessible icon-only button (ADR-018 D4).
 *
 * Enforces an accessible name: `label` becomes aria-label + native tooltip.
 * Pair with a Tooltip component for discoverability when the action is not
 * obvious. Icon content goes into the default slot (lucide-vue-next).
 */
interface Props {
  /** Accessible name — required, rendered as aria-label + native tooltip */
  label: string
  variant?: ButtonVariants['variant']
  size?: Extract<ButtonVariants['size'], 'icon' | 'icon-sm' | 'icon-xs'>
  class?: HTMLAttributes['class']
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'ghost',
  size: 'icon-sm',
})
</script>

<template>
  <Button
    :variant="props.variant"
    :size="props.size"
    :aria-label="props.label"
    :title="props.label"
    :class="cn('umm:shrink-0', props.class)"
  >
    <slot />
  </Button>
</template>
