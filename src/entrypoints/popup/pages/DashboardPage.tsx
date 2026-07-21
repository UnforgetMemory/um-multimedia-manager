import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/stores/use-app-store'
import { useStats, type RecordWithType } from '@/hooks/useStats'
import { StatCard } from '@/shared/StatCard'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Settings, Film, Tv, Music, Book, Gamepad2, ShieldAlert, ArrowUpRight, Play,
} from 'lucide-react'

export function DashboardPage() {
  const { t } = useTranslation()
  const { dataReady, records, adultAvItems, appVersion, loadData } = useAppStore()
  const { stats } = useStats(
    () => records as RecordWithType[],
    () => adultAvItems,
  )

  useEffect(() => {
    loadData()
  }, [loadData])

  function openOptionsPage() {
    window.open(chrome.runtime.getURL('options.html'), '_blank')
  }

  return (
    <div className="umm:flex umm:flex-col umm:h-full">
      <div className="umm:flex umm:items-center umm:justify-between umm:px-5 umm:pt-4 umm:pb-2">
        <h1 className="umm:text-base umm:font-bold umm:tracking-tight">UMManager</h1>
        <span className="umm:text-sm umm:text-muted-foreground">v{appVersion}</span>
      </div>

      <Separator />

      <div className="umm:flex-1 umm:px-5 umm:py-4 umm:overflow-y-auto">
        <div className="umm:grid umm:grid-cols-4 umm:gap-3 umm:mb-4">
          <StatCard icon={<Film />} label={t('stats.movie')} value={dataReady ? stats.movie : '—'} />
          <StatCard icon={<Tv />} label={t('stats.tv')} value={dataReady ? stats.tv : '—'} />
          <StatCard icon={<Music />} label={t('stats.music')} value={dataReady ? stats.music : '—'} />
          <StatCard icon={<Book />} label={t('stats.book')} value={dataReady ? stats.book : '—'} />
          <StatCard icon={<Gamepad2 />} label={t('stats.game')} value={dataReady ? stats.game : '—'} />
          <StatCard icon={<ShieldAlert />} label={t('stats.jav')} value={dataReady ? stats.jav : '—'} />
          <StatCard icon={<Play />} label={t('stats.bilibili')} value={dataReady ? stats.bilibili : '—'} />
          <StatCard icon={<Play />} label={t('stats.youtube')} value={dataReady ? stats.youtube : '—'} />
        </div>

        <Card className="umm:mb-4 umm:overflow-hidden">
          <CardContent className="umm:flex umm:items-center umm:justify-between umm:py-3 umm:px-5">
            <span className="umm:text-sm umm:font-medium umm:text-muted-foreground">{t('stats.total')}</span>
            <span className={`umm:text-base sm:umm:text-lg umm:font-bold umm:tracking-tight umm:truncate umm:tabular-nums ${!dataReady ? 'umm:animate-pulse' : ''}`}>
              {dataReady ? stats.total.toLocaleString() : '—'}
            </span>
          </CardContent>
        </Card>

        <Button onClick={openOptionsPage} className="umm:w-full umm:gap-2" size="default">
          <Settings className="umm:w-4 umm:h-4" />
          {t('nav.managementPanel')}
          <ArrowUpRight className="umm:w-3.5 umm:h-3.5 umm:ml-1.5 umm:opacity-50" />
        </Button>
      </div>
    </div>
  )
}