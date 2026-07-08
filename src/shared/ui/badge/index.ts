import type { VariantProps } from "class-variance-authority"
import { cva } from "class-variance-authority"

export { default as Badge } from "./Badge.vue"

export const badgeVariants = cva(
  "umm:inline-flex umm:gap-1 umm:items-center umm:rounded-full umm:border umm:px-2.5 umm:py-0.5 umm:text-xs umm:font-semibold umm:transition-colors umm:focus:outline-none umm:focus:ring-2 umm:focus:ring-ring umm:focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "umm:border-transparent umm:bg-primary umm:text-primary-foreground umm:hover:bg-primary/80",
        secondary:
          "umm:border-transparent umm:bg-secondary umm:text-secondary-foreground umm:hover:bg-secondary/80",
        destructive:
          "umm:border-transparent umm:bg-destructive umm:text-destructive-foreground umm:hover:bg-destructive/80",
        outline: "umm:text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

export type BadgeVariants = VariantProps<typeof badgeVariants>
