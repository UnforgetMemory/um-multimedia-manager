import { defineStore } from 'pinia'
import { reactive } from 'vue'
import type { Component } from 'vue'
import { AlertCircle } from 'lucide-vue-next'

interface ConfirmDialogState {
  open: boolean; title: string; description: string
  warning?: string; details?: string
  icon: Component
  confirmText?: string; loading: boolean
  action: () => Promise<void>
}

const defaultState: ConfirmDialogState = {
  open: false, title: '', description: '',
  icon: AlertCircle, confirmText: '确认', loading: false, action: async () => {},
}

export const useConfirmStore = defineStore('confirm', () => {
  const state = reactive<ConfirmDialogState>({ ...defaultState })

  function show(config: Omit<ConfirmDialogState, 'open' | 'loading'>) {
    Object.assign(state, { ...config, open: true, loading: false })
  }

  async function confirm() {
    state.loading = true
    try { await state.action(); state.open = false }
    catch { /* handled by caller */ }
    finally { state.loading = false }
  }

  return { state, show, confirm }
})