import { create } from 'zustand'
import type { ComponentType } from 'react'
import { AlertCircle } from 'lucide-react'

interface ConfirmDialogState {
  open: boolean
  title: string
  description: string
  warning?: string
  details?: string
  icon: ComponentType<{ className?: string }>
  confirmText?: string
  loading: boolean
  action: () => Promise<void>
}

interface ConfirmStore {
  state: ConfirmDialogState
  show: (config: Omit<ConfirmDialogState, 'open' | 'loading'>) => void
  confirm: () => Promise<void>
}

const defaultIcon = AlertCircle as ComponentType<{ className?: string }>

const defaultState: ConfirmDialogState = {
  open: false,
  title: '',
  description: '',
  icon: defaultIcon,
  confirmText: '确认',
  loading: false,
  action: async () => {},
}

export const useConfirmStore = create<ConfirmStore>((set, get) => ({
  state: { ...defaultState },
  show: (config) => {
    set({ state: { ...config, open: true, loading: false } })
  },
  confirm: async () => {
    set({ state: { ...get().state, loading: true } })
    try {
      await get().state.action()
      set({ state: { ...get().state, open: false } })
    } catch {
      // handled by caller
    } finally {
      set({ state: { ...get().state, loading: false } })
    }
  },
}))
