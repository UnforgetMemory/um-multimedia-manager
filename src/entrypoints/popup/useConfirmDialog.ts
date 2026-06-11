import { reactive } from 'vue'
import { AlertCircle } from 'lucide-vue-next'

interface ConfirmDialogState {
  open: boolean
  title: string
  description: string
  warning?: string
  details?: string
  icon: any
  confirmText?: string
  action: () => Promise<void>
  loading: boolean
}

const state = reactive<ConfirmDialogState>({
  open: false,
  title: '',
  description: '',
  warning: undefined,
  details: undefined,
  icon: AlertCircle,
  confirmText: '确认',
  action: async () => {},
  loading: false,
})

export function useConfirmDialog() {
  function showConfirmDialog(config: Omit<ConfirmDialogState, 'open' | 'loading'>) {
    state.open = true
    state.title = config.title
    state.description = config.description
    state.warning = config.warning
    state.details = config.details
    state.icon = config.icon
    state.confirmText = config.confirmText
    state.action = config.action
    state.loading = false
  }

  async function handleConfirmAction() {
    state.loading = true
    try {
      await state.action()
      state.open = false
    } catch (error) {
      console.error('[Popup] Confirm action failed:', error)
    } finally {
      state.loading = false
    }
  }

  return { state, showConfirmDialog, handleConfirmAction }
}
