import type { VariantProps } from "class-variance-authority"
import { cva } from "class-variance-authority"

export { default as Badge } from "./Badge.vue"

export const badgeVariants = cva(
  "umm:inline-flex umm:gap-1 umm:items-center umm:rounded-full umm:border umm:px-2.5 umm:py-0.5 umm:text-xs umm:font-semibold umm:transition-colors umm:focus:outline-none",
  {
    variants: {
      variant: {
        default:
          "umm:border-transparent umm:bg-primary umm:text-primary-foreground",
        secondary:
          "umm:border-transparent umm:bg-secondary umm:text-secondary-foreground",
        destructive:
          "umm:border-transparent umm:bg-destructive umm:text-destructive-foreground",
        outline: "umm:border-border umm:text-foreground",
        /* Tonal status variants — soft fill + strong text, vivid but minimal */
        success:
          "umm:border-transparent umm:bg-state-success/12 umm:text-state-success umm:dark:bg-state-success/20",
        warning:
          "umm:border-transparent umm:bg-state-warning/15 umm:text-state-warning umm:dark:bg-state-warning/25",
        info:
          "umm:border-transparent umm:bg-state-info/10 umm:text-state-info umm:dark:bg-state-info/20",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

export type BadgeVariants = VariantProps<typeof badgeVariants>
