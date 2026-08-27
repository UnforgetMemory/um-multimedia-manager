<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { Primitive, type PrimitiveProps } from 'reka-ui'
import { type VariantProps, cva } from 'class-variance-authority'
import { cn } from '@/utils/cn'

/**
 * Button — UMM variant system (ADR-018 D4).
 * default   solid brand · tonal  soft brand fill
 * gradient  vivid brand gradient · destructive/outline/secondary/ghost/link
 * Sizes include icon-only scales used by IconButton.
 */
const buttonVariants = cva(
  'umm:inline-flex umm:items-center umm:justify-center umm:gap-1.5 umm:whitespace-nowrap umm:rounded-md umm:text-sm umm:font-medium umm:transition-all umm:duration-150 umm:focus-visible:outline-none umm:focus-visible:ring-2 umm:focus-visible:ring-ring umm:focus-visible:ring-offset-2 umm:ring-offset-background umm:disabled:pointer-events-none umm:disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'umm:bg-primary umm:text-primary-foreground umm:hover:bg-primary/90 umm:active:bg-primary/80',
        destructive: 'umm:bg-destructive umm:text-destructive-foreground umm:hover:bg-destructive/90',
        outline: 'umm:border umm:border-input umm:bg-background umm:hover:bg-accent umm:hover:text-accent-foreground',
        secondary: 'umm:bg-secondary umm:text-secondary-foreground umm:hover:bg-secondary/80',
        ghost: 'umm:hover:bg-accent umm:hover:text-accent-foreground',
        link: 'umm:text-primary umm:underline-offset-4 umm:hover:underline',
        /* Soft brand fill — vivid yet quiet */
        tonal: 'umm:bg-primary/10 umm:text-primary umm:hover:bg-primary/16 umm:active:bg-primary/22 umm:dark:bg-primary/18 umm:dark:hover:bg-primary/26',
        /* Brand gradient — hero actions only */
        gradient: 'bg-brand-gradient umm:text-white umm:shadow-sm umm:hover:brightness-105 umm:active:brightness-95',
      },
      size: {
        xs: 'umm:h-7 umm:rounded-md umm:px-2 umm:text-xs',
        sm: 'umm:h-9 umm:rounded-md umm:px-3',
        default: 'umm:h-10 umm:px-4 umm:py-2',
        lg: 'umm:h-11 umm:rounded-md umm:px-8',
        icon: 'umm:h-10 umm:w-10',
        'icon-sm': 'umm:h-8 umm:w-8 umm:rounded-md',
        'icon-xs': 'umm:h-7 umm:w-7 umm:rounded-md',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export type ButtonVariants = VariantProps<typeof buttonVariants>

interface Props extends PrimitiveProps {
  variant?: ButtonVariants['variant']
  size?: ButtonVariants['size']
  class?: HTMLAttributes['class']
}

const props = withDefaults(defineProps<Props>(), {
  as: 'button',
})
</script>

<template>
  <Primitive
    :as="as"
    :as-child="asChild"
    :class="cn(buttonVariants({ variant, size }), props.class)"
  >
    <slot />
  </Primitive>
</template>
