import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/utils/cn"

const buttonVariants = cva(
  "umm-inline-flex umm-items-center umm-justify-center umm-gap-2 umm-whitespace-nowrap umm-rounded-md umm-text-sm umm-font-medium umm-transition-colors focus-visible:umm-outline-none focus-visible:umm-ring-1 focus-visible:umm-ring-ring disabled:umm-pointer-events-none disabled:umm-opacity-50 [&_svg]:umm-pointer-events-none [&_svg]:umm-size-4 [&_svg]:umm-shrink-0",
  {
    variants: {
      variant: {
        default:
          "umm-bg-primary umm-text-primary-foreground umm-shadow hover:umm-bg-primary/90",
        destructive:
          "umm-bg-destructive umm-text-destructive-foreground umm-shadow-sm hover:umm-bg-destructive/90",
        outline:
          "umm-border umm-border-input umm-bg-background umm-shadow-sm hover:umm-bg-accent hover:umm-text-accent-foreground",
        secondary:
          "umm-bg-secondary umm-text-secondary-foreground umm-shadow-sm hover:umm-bg-secondary/80",
        ghost: "hover:umm-bg-accent hover:umm-text-accent-foreground",
        link: "umm-text-primary umm-underline-offset-4 hover:umm-underline",
      },
      size: {
        default: "umm-h-9 umm-px-4 umm-py-2",
        sm: "umm-h-8 umm-rounded-md umm-px-3 umm-text-xs",
        lg: "umm-h-10 umm-rounded-md umm-px-8",
        icon: "umm-h-9 umm-w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
