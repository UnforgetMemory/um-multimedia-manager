import * as React from "react"
import * as SelectPrimitive from "@radix-ui/react-select"
import { Check, ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "@/utils/cn"

const Select = SelectPrimitive.Root
const SelectGroup = SelectPrimitive.Group
const SelectValue = SelectPrimitive.Value

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      "umm-flex umm-h-9 umm-w-full umm-items-center umm-justify-between umm-whitespace-nowrap umm-rounded-md umm-border umm-border-input umm-bg-transparent umm-px-3 umm-py-2 umm-text-sm umm-shadow-sm umm-ring-offset-background placeholder:umm-text-muted-foreground focus:umm-outline-none focus:umm-ring-1 focus:umm-ring-ring disabled:umm-cursor-not-allowed disabled:umm-opacity-50 [&>span]:umm-line-clamp-1",
      className
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="umm-h-4 umm-w-4 umm-opacity-50" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
))
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = "popper", ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      className={cn(
        "umm-relative umm-z-50 umm-max-h-96 umm-min-w-32 umm-overflow-hidden umm-rounded-md umm-border umm-bg-popover umm-text-popover-foreground umm-shadow-md data-[state=open]:umm-animate-in data-[state=closed]:umm-animate-out data-[state=closed]:umm-fade-out-0 data-[state=open]:umm-fade-in-0 data-[state=closed]:umm-zoom-out-95 data-[state=open]:umm-zoom-in-95 data-[side=bottom]:umm-slide-in-from-top-2 data-[side=left]:umm-slide-in-from-right-2 data-[side=right]:umm-slide-in-from-left-2 data-[side=top]:umm-slide-in-from-bottom-2",
        position === "popper" &&
          "data-[side=bottom]:umm-translate-y-1 data-[side=left]:-umm-translate-x-1 data-[side=right]:umm-translate-x-1 data-[side=top]:-umm-translate-y-1",
        className
      )}
      position={position}
      {...props}
    >
      <SelectPrimitive.ScrollUpButton className="umm-flex umm-cursor-default umm-items-center umm-justify-center umm-py-1">
        <ChevronUp className="umm-h-4 umm-w-4" />
      </SelectPrimitive.ScrollUpButton>
      <SelectPrimitive.Viewport
        className={cn(
          "umm-p-1",
          position === "popper" &&
            "umm-h-[var(--radix-select-trigger-height)] umm-w-full umm-min-w-[var(--radix-select-trigger-width)]"
        )}
      >
        {children}
      </SelectPrimitive.Viewport>
      <SelectPrimitive.ScrollDownButton className="umm-flex umm-cursor-default umm-items-center umm-justify-center umm-py-1">
        <ChevronDown className="umm-h-4 umm-w-4" />
      </SelectPrimitive.ScrollDownButton>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
))
SelectContent.displayName = SelectPrimitive.Content.displayName

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "umm-relative umm-flex umm-w-full umm-cursor-default umm-select-none umm-items-center umm-rounded-sm umm-py-1.5 umm-pl-8 umm-pr-2 umm-text-sm umm-outline-none focus:umm-bg-accent focus:umm-text-accent-foreground data-[disabled]:umm-pointer-events-none data-[disabled]:umm-opacity-50",
      className
    )}
    {...props}
  >
    <span className="umm-absolute umm-left-2 umm-flex umm-h-3.5 umm-w-3.5 umm-items-center umm-justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="umm-h-4 umm-w-4" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
))
SelectItem.displayName = SelectPrimitive.Item.displayName

const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    className={cn("umm-px-2 umm-py-1.5 umm-text-sm umm-font-semibold", className)}
    {...props}
  />
))
SelectLabel.displayName = SelectPrimitive.Label.displayName

const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator
    ref={ref}
    className={cn("-umm-mx-1 umm-my-1 umm-h-px umm-bg-muted", className)}
    {...props}
  />
))
SelectSeparator.displayName = SelectPrimitive.Separator.displayName

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
}
