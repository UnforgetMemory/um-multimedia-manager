import { useState, useCallback } from 'react'
import type { ToastType } from '@/shared/toast'
import { TOAST_AUTO_DISMISS_MS } from '@/shared/toast'

interface Toast {
  id: number
  type: ToastType
  title: string
  message?: string
}

let nextId = 0

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const addToast = useCallback((type: Toast['type'], title: string, message?: string): number => {
    const id = nextId++
    setToasts(prev => [...prev, { id, type, title, message }])

    if (type !== 'loading') {
      setTimeout(() => removeToast(id), TOAST_AUTO_DISMISS_MS)
    }

    return id
  }, [removeToast])

  const success = useCallback((title: string, message?: string) => {
    addToast('success', title, message)
  }, [addToast])

  const error = useCallback((title: string, message?: string) => {
    addToast('error', title, message)
  }, [addToast])

  const info = useCallback((title: string, message?: string) => {
    addToast('info', title, message)
  }, [addToast])

  const loading = useCallback((title: string, message?: string): number => {
    return addToast('loading', title, message)
  }, [addToast])

  const dismiss = useCallback((id: number) => {
    removeToast(id)
  }, [removeToast])

  return { toasts, success, error, info, loading, dismiss }
}
