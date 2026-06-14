/**
 * Toast notification composable for options page
 *
 * Displays floating notifications in the bottom-right corner.
 * Works independently of the content script FloatingToast.
 */

import { ref } from 'vue'

interface Toast {
  id: number
  type: 'success' | 'error' | 'info' | 'loading'
  title: string
  message?: string
}

const toasts = ref<Toast[]>([])
let nextId = 0

function addToast(type: Toast['type'], title: string, message?: string): number {
  const id = nextId++
  toasts.value.push({ id, type, title, message })

  // Auto-remove after 3 seconds (except loading)
  if (type !== 'loading') {
    setTimeout(() => removeToast(id), 3000)
  }

  return id
}

function removeToast(id: number): void {
  const idx = toasts.value.findIndex(t => t.id === id)
  if (idx !== -1) {
    toasts.value.splice(idx, 1)
  }
}

export function useToast() {
  function success(title: string, message?: string) {
    addToast('success', title, message)
  }

  function error(title: string, message?: string) {
    addToast('error', title, message)
  }

  function info(title: string, message?: string) {
    addToast('info', title, message)
  }

  function loading(title: string, message?: string): number {
    return addToast('loading', title, message)
  }

  function dismiss(id: number) {
    removeToast(id)
  }

  return { toasts, success, error, info, loading, dismiss }
}
