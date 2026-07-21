import { useTranslation } from 'react-i18next'
import { useThemeStore, type ThemeMode } from '@/stores/use-theme-store'
import { Card, CardContent } from '@/components/ui/card'
import { Sun, Moon, Monitor } from 'lucide-react'

const THEME_OPTIONS: { value: ThemeMode; icon: typeof Sun; labelKey: string }[] = [
  { value: 'light', icon: Sun, labelKey: 'appearance.light' },
  { value: 'dark', icon: Moon, labelKey: 'appearance.dark' },
  { value: 'auto', icon: Monitor, labelKey: 'appearance.auto' },
]

export function AppearanceTab() {
  const { t } = useTranslation()
  const { theme, applyTheme } = useThemeStore()

  return (
    <div className="umm:space-y-6">
      <h2 className="umm:text-lg umm:font-semibold">{t('nav.appearance')}</h2>

      <div className="umm:grid umm:grid-cols-3 umm:gap-4">
        {THEME_OPTIONS.map((opt) => {
          const Icon = opt.icon
          const isActive = theme === opt.value
          return (
            <Card
              key={opt.value}
              className={`umm:cursor-pointer umm:transition-all ${
                isActive
                  ? 'umm:ring-2 umm:ring-primary umm:border-primary'
                  : 'hover:umm:border-muted-foreground/50'
              }`}
              onClick={() => applyTheme(opt.value)}
            >
              <CardContent className="umm:flex umm:flex-col umm:items-center umm:gap-3 umm:py-6">
                <Icon className={`umm:h-8 umm:w-8 ${isActive ? 'umm:text-primary' : 'umm:text-muted-foreground'}`} />
                <span className={`umm:text-sm umm:font-medium ${isActive ? 'umm:text-primary' : ''}`}>
                  {t(opt.labelKey as any)}
                </span>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}