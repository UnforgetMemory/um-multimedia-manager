import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"
import { cn } from "@/utils/cn"

const TooltipProvider = TooltipPrimitive.Provider
const Tooltip = TooltipPrimitive.Root
const TooltipTrigger = TooltipPrimitive.Trigger

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "umm-z-50 umm-overflow-hidden umm-rounded-md umm-bg-primary umm-px-3 umm-py-1.5 umm-text-xs umm-text-primary-foreground umm-animate-in umm-fade-in-0 umm-zoom-in-95 data-[state=closed]:umm-animate-out data-[state=closed]:umm-fade-out-0 data-[state=closed]:umm-zoom-out-95 data-[side=bottom]:umm-slide-in-from-top-2 data-[side=left]:umm-slide-in-from-right-2 data-[side=right]:umm-slide-in-from-left-2 data-[side=top]:umm-slide-in-from-bottom-2",
        className
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
