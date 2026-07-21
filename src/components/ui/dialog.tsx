import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { cn } from "@/utils/cn"

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogPortal = DialogPrimitive.Portal
const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "umm-fixed umm-inset-0 umm-z-50 umm-bg-black/80 data-[state=open]:umm-animate-in data-[state=closed]:umm-animate-out data-[state=closed]:umm-fade-out-0 data-[state=open]:umm-fade-in-0",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "umm-fixed umm-left-1/2 umm-top-1/2 umm-z-50 umm-grid umm-w-full umm-max-w-lg -umm-translate-x-1/2 -umm-translate-y-1/2 umm-gap-4 umm-border umm-bg-background umm-p-6 umm-shadow-lg umm-duration-200 data-[state=open]:umm-animate-in data-[state=closed]:umm-animate-out data-[state=closed]:umm-fade-out-0 data-[state=open]:umm-fade-in-0 data-[state=closed]:umm-zoom-out-95 data-[state=open]:umm-zoom-in-95 data-[state=closed]:umm-slide-out-to-left-1/2 data-[state=closed]:umm-slide-out-to-top-48 data-[state=open]:umm-slide-in-from-left-1/2 data-[state=open]:umm-slide-in-from-top-48 sm:umm-rounded-lg",
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="umm-absolute umm-right-4 umm-top-4 umm-rounded-sm umm-opacity-70 umm-ring-offset-background umm-transition-opacity hover:umm-opacity-100 focus:umm-outline-none focus:umm-ring-2 focus:umm-ring-ring focus:umm-ring-offset-2 disabled:umm-pointer-events-none data-[state=open]:umm-bg-accent data-[state=open]:umm-text-muted-foreground">
        <X className="umm-h-4 umm-w-4" />
        <span className="umm-sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "umm-flex umm-flex-col umm-space-y-1.5 umm-text-center sm:umm-text-left",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "umm-flex umm-flex-col-reverse sm:umm-flex-row sm:umm-justify-end sm:umm-space-x-2",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "umm-text-lg umm-font-semibold umm-leading-none umm-tracking-tight",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("umm-text-sm umm-text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
