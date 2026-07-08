<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { Primitive, type PrimitiveProps } from 'reka-ui'
import { type VariantProps, cva } from 'class-variance-authority'
import { cn } from '@/utils/cn'

const buttonVariants = cva('umm:inline-flex umm:items-center umm:justify-center umm:whitespace-nowrap umm:rounded-md umm:text-sm umm:font-medium umm:ring-offset-background umm:transition-colors umm:focus-visible:outline-none umm:focus-visible:ring-2 umm:focus-visible:ring-ring umm:focus-visible:ring-offset-2 umm:disabled:pointer-events-none umm:disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'umm:bg-primary umm:text-primary-foreground umm:hover:bg-primary/90',
        destructive: 'umm:bg-destructive umm:text-destructive-foreground umm:hover:bg-destructive/90',
        outline: 'umm:border umm:border-input umm:bg-background umm:hover:bg-accent umm:hover:text-accent-foreground',
        secondary: 'umm:bg-secondary umm:text-secondary-foreground umm:hover:bg-secondary/80',
        ghost: 'umm:hover:bg-accent umm:hover:text-accent-foreground',
        link: 'umm:text-primary underline-offset-4 umm:hover:underline',
      },
      size: {
        default: 'umm:h-10 umm:px-4 umm:py-2',
        sm: 'umm:h-9 umm:rounded-md umm:px-3',
        lg: 'umm:h-11 umm:rounded-md umm:px-8',
        icon: 'umm:h-10 umm:w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

type ButtonVariants = VariantProps<typeof buttonVariants>

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
    :class="
  cn(buttonVariants({ variant, size }), props.class)
"
  >
    <slot />
  </Primitive>
</template>

