import * as React from "react"
import { cn } from "@/utils/cn"

const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    className={cn(
      "umm-flex umm-h-9 umm-w-full umm-rounded-md umm-border umm-border-input umm-bg-transparent umm-px-3 umm-py-1 umm-text-sm umm-shadow-sm umm-transition-colors file:umm-border-0 file:umm-bg-transparent file:umm-text-sm file:umm-font-medium file:umm-text-foreground placeholder:umm-text-muted-foreground focus-visible:umm-outline-none focus-visible:umm-ring-1 focus-visible:umm-ring-ring disabled:umm-cursor-not-allowed disabled:umm-opacity-50",
      className
    )}
    ref={ref}
    {...props}
  />
))
Input.displayName = "Input"

export { Input }
