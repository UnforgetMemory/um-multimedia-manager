import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useThemeStore } from '@/stores/use-theme-store'
import { useAppStore } from '@/stores/use-app-store'
import { useLocaleSync } from '@/hooks/useLocaleSync'
import { useToast } from '@/hooks/useToast'
import { ConfirmDialog } from '@/shared/ConfirmDialog'
import { ToastContainer } from '@/shared/ToastContainer'
import { OptionsRouter } from './router'
import { Database, Star, Link, RefreshCw, Settings, Palette, Menu, X } from 'lucide-react'

const TABS = [
  { id: 'overview', labelKey: 'nav.overview', icon: Database, route: '/overview' },
  { id: 'rating', labelKey: 'nav.rating', icon: Star, route: '/rating' },
  { id: 'linked', labelKey: 'nav.linked', icon: Link, route: '/linked' },
  { id: 'sync', labelKey: 'nav.sync', icon: RefreshCw, route: '/sync' },
  { id: 'appearance', labelKey: 'nav.appearance', icon: Palette, route: '/appearance' },
  { id: 'settings', labelKey: 'nav.settings', icon: Settings, route: '/settings' },
]

export function OptionsApp() {
  const { t } = useTranslation()
  const { applyTheme, theme } = useThemeStore()
  const { appVersion } = useAppStore()
  const { toasts, dismiss } = useToast()
  useLocaleSync()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    applyTheme(theme)
  }, [theme, applyTheme])

  const currentTab = TABS.find(tab => location.pathname.startsWith(tab.route))?.id || 'overview'

  function navigateTo(path: string) {
    navigate(path)
    setSidebarOpen(false)
  }

  return (
    <div className="umm:h-screen umm:bg-background umm:text-foreground umm:flex umm:overflow-hidden">
      {/* Mobile drawer overlay */}
      {sidebarOpen && (
        <div
          className="umm:xl:hidden umm:fixed umm:inset-0 umm:bg-black/50 umm:z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <nav
        className={`umm:fixed umm:xl:static umm:inset-y-0 umm:left-0 umm:z-50 umm:w-64 umm:bg-card umm:border-r umm:border-border umm:flex umm:flex-col umm:shrink-0 umm:transition-transform umm:duration-300 umm:pt-5 umm:pb-5 ${
          sidebarOpen ? 'umm:translate-x-0' : '-umm:translate-x-full umm:xl:translate-x-0'
        }`}
      >
        {/* Sidebar header */}
        <div className="umm:flex umm:items-center umm:justify-between umm:px-5 umm:mb-6">
          <div>
            <h1 className="umm:text-base umm:font-bold umm:tracking-tight">UMManager</h1>
            <span className="umm:text-sm umm:text-muted-foreground">v{appVersion}</span>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="umm:xl:hidden umm:p-1 umm:rounded-md hover:umm:bg-muted">
            <X className="umm:w-4 umm:h-4" />
          </button>
        </div>

        {/* Nav items */}
        <div className="umm:flex-1 umm:px-3 umm:flex umm:flex-col umm:gap-1 umm:overflow-y-auto">
          {TABS.map((tab) => {
            const Icon = tab.icon
            const isActive = currentTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => navigateTo(tab.route)}
                className={`umm:flex umm:items-center umm:gap-3 umm:px-3 umm:py-2 umm:rounded-lg umm:text-sm umm:font-medium umm:transition-colors ${
                  isActive
                    ? 'umm:bg-primary umm:text-primary-foreground'
                    : 'hover:umm:bg-muted umm:text-muted-foreground hover:umm:text-foreground'
                }`}
              >
                <Icon className="umm:w-4 umm:h-4" />
                {t(tab.labelKey as any)}
              </button>
            )
          })}
        </div>
      </nav>

      {/* Main content area */}
      <div className="umm:flex-1 umm:flex umm:flex-col umm:min-w-0">
        {/* Mobile menu button */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="umm:xl:hidden umm:fixed umm:top-3 umm:left-3 umm:z-30 umm:p-2 umm:rounded-lg umm:bg-card umm:border umm:border-border umm:shadow-sm hover:umm:bg-muted umm:transition-colors"
        >
          <Menu className="umm:w-4 umm:h-4" />
        </button>

        {/* Page content */}
        <main
          className="umm:flex-1 umm:overflow-y-auto"
          style={{ padding: 'var(--umm-card-padding)', paddingTop: 'calc(var(--umm-card-padding) + 40px)' }}
        >
          <div className="umm:mx-auto" style={{ maxWidth: 1200 }}>
            <OptionsRouter />
          </div>
        </main>
      </div>

      {/* Global Confirm Dialog */}
      <ConfirmDialog />

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </div>
  )
}