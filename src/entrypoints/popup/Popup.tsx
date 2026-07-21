import { useEffect } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { useThemeStore } from '@/stores/use-theme-store'
import { useLocaleSync } from '@/hooks/useLocaleSync'
import { useToast } from '@/hooks/useToast'
import { DashboardPage } from './pages/DashboardPage'
import { ConfirmDialog } from '@/shared/ConfirmDialog'
import { ToastContainer } from '@/shared/ToastContainer'

export function Popup() {
  const { applyTheme, theme } = useThemeStore()
  const { toasts, dismiss } = useToast()
  useLocaleSync()

  useEffect(() => {
    applyTheme(theme)
  }, [theme, applyTheme])

  return (
    <HashRouter>
      <Routes>
        <Route path="*" element={<DashboardPage />} />
      </Routes>
      <ConfirmDialog />
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </HashRouter>
  )
}