import { useEffect, useState } from "react"
import { cn } from "@/utils/cn"
import type { ToastType } from "@/shared/toast"
import { TOAST_AUTO_DISMISS_MS } from "@/shared/toast"

interface Toast {
  id: number
  type: ToastType
  title: string
  message?: string
}

interface ToastContainerProps {
  toasts: Toast[]
  onDismiss: (id: number) => void
  className?: string
}

const typeStyles: Record<ToastType, string> = {
  success: "umm-bg-green-50 umm-border-green-200 umm-text-green-800 dark:umm-bg-green-950 dark:umm-border-green-800 dark:umm-text-green-200",
  error: "umm-bg-red-50 umm-border-red-200 umm-text-red-800 dark:umm-bg-red-950 dark:umm-border-red-800 dark:umm-text-red-200",
  info: "umm-bg-blue-50 umm-border-blue-200 umm-text-blue-800 dark:umm-bg-blue-950 dark:umm-border-blue-800 dark:umm-text-blue-200",
  loading: "umm-bg-gray-50 umm-border-gray-200 umm-text-gray-800 dark:umm-bg-gray-950 dark:umm-border-gray-800 dark:umm-text-gray-200",
}

export function ToastContainer({ toasts, onDismiss, className }: ToastContainerProps) {
  if (toasts.length === 0) return null

  return (
    <div className={cn("umm-fixed umm-bottom-4 umm-right-4 umm-z-50 umm-flex umm-flex-col umm-gap-2", className)}>
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    if (toast.type !== 'loading') {
      const timer = setTimeout(() => {
        setExiting(true)
        setTimeout(() => onDismiss(toast.id), 300)
      }, TOAST_AUTO_DISMISS_MS)
      return () => clearTimeout(timer)
    }
  }, [toast, onDismiss])

  return (
    <div
      className={cn(
        "umm-rounded-lg umm-border umm-px-4 umm-py-3 umm-shadow-lg umm-transition-all umm-duration-300 umm-max-w-sm",
        typeStyles[toast.type],
        exiting ? "umm-opacity-0 umm-translate-x-4" : "umm-opacity-100 umm-translate-x-0"
      )}
    >
      <p className="umm-text-sm umm-font-medium">{toast.title}</p>
      {toast.message && <p className="umm-mt-1 umm-text-xs umm-opacity-80">{toast.message}</p>}
    </div>
  )
}
