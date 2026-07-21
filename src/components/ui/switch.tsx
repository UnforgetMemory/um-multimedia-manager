import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"
import { cn } from "@/utils/cn"

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "umm-peer umm-inline-flex umm-h-5 umm-w-9 umm-shrink-0 umm-cursor-pointer umm-items-center umm-rounded-full umm-border-2 umm-border-transparent umm-shadow-sm umm-transition-colors focus-visible:umm-outline-none focus-visible:umm-ring-2 focus-visible:umm-ring-ring focus-visible:umm-ring-offset-2 focus-visible:umm-ring-offset-background disabled:umm-cursor-not-allowed disabled:umm-opacity-50 data-[state=checked]:umm-bg-primary data-[state=unchecked]:umm-bg-input",
      className
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "umm-pointer-events-none umm-block umm-h-4 umm-w-4 umm-rounded-full umm-bg-background umm-shadow-lg umm-ring-0 umm-transition-transform data-[state=checked]:umm-translate-x-4 data-[state=unchecked]:umm-translate-x-0"
      )}
    />
  </SwitchPrimitives.Root>
))
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
