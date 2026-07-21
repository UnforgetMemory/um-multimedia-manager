import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/utils/cn"

const badgeVariants = cva(
  "umm-inline-flex umm-items-center umm-rounded-md umm-border umm-px-2.5 umm-py-0.5 umm-text-xs umm-font-semibold umm-transition-colors focus:umm-outline-none focus:umm-ring-2 focus:umm-ring-ring focus:umm-ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "umm-border-transparent umm-bg-primary umm-text-primary-foreground umm-shadow",
        secondary:
          "umm-border-transparent umm-bg-secondary umm-text-secondary-foreground",
        destructive:
          "umm-border-transparent umm-bg-destructive umm-text-destructive-foreground umm-shadow",
        outline: "umm-text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
