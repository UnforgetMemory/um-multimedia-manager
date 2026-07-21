import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/stores/use-app-store'
import { useStats, type RecordWithType } from '@/hooks/useStats'
import { PLATFORM_HUES } from '@/hooks/usePlatformMeta'
import { HeatmapCalendar } from '@/shared/HeatmapCalendar'
import { PlatformDistribution } from '@/shared/PlatformDistribution'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AlertCircle, Database, RefreshCw, Film, Tv, Music, Book, Gamepad2, ShieldAlert, Play } from 'lucide-react'

const SUB_TABS = [
  { id: 'overview' as const, labelKey: 'tab.overview' },
  { id: 'weekly' as const, labelKey: 'tab.weekly' },
  { id: 'platform' as const, labelKey: 'tab.platform' },
]

export function OverviewTab() {
  const { t } = useTranslation()
  const { dataReady, records, adultAvItems, loadData, error } = useAppStore()
  const { stats } = useStats(
    () => records as RecordWithType[],
    () => adultAvItems,
  )
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'weekly' | 'platform'>('overview')
  const [errorState, setErrorState] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    if (error) {
      setErrorState(error)
    }
  }, [error])

  const platformData = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const r of records) {
      const p = (r as any).provider || 'unknown'
      counts[p] = (counts[p] || 0) + 1
    }
    return Object.entries(counts).map(([name, count]) => ({
      name,
      count,
      color: PLATFORM_HUES[name] ? `hsl(${PLATFORM_HUES[name]}, 55%, 45%)` : 'hsl(0, 0%, 50%)',
    }))
  }, [records])

  const weeklyActivity = useMemo(() => {
    const data: Record<string, number> = {}
    for (const r of records) {
      if (r.updatedAt) {
        const date = r.updatedAt.split('T')[0]
        data[date] = (data[date] || 0) + 1
      }
    }
    return data
  }, [records])

  const STYLE_CARD = 'umm:items-center umm:justify-center umm:py-4 umm:text-center umm:gap-1'

  return (
    <div className="umm:flex umm:flex-col umm:gap-[var(--umm-section-gap)]">
      {/* Sub-tab navigation */}
      <div className="umm:flex umm:gap-2">
        {SUB_TABS.map((tab) => (
          <Button
            key={tab.id}
            variant={activeSubTab === tab.id ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveSubTab(tab.id)}
          >
            {t(tab.labelKey as any)}
          </Button>
        ))}
      </div>

      {/* Error state */}
      {errorState && !dataReady && (
        <Alert variant="destructive">
          <AlertCircle className="umm:h-4 umm:w-4" />
          <AlertTitle>{t('common.error')}</AlertTitle>
          <AlertDescription>{errorState}</AlertDescription>
        </Alert>
      )}

      {/* Overview tab */}
      {activeSubTab === 'overview' && (
        <div className="umm:space-y-[var(--umm-section-gap)]">
          {/* Stats grid */}
          <div className="umm:grid umm:grid-cols-2 sm:umm:grid-cols-3 lg:umm:grid-cols-4 umm:gap-3">
            <Card className={STYLE_CARD}>
              <CardContent>
                <Database className="umm:h-5 umm:w-5 umm:mx-auto umm:mb-1 umm:text-primary" />
                <div className="umm:text-2xl umm:font-bold">{dataReady ? stats.total.toLocaleString() : '—'}</div>
                <div className="umm:text-xs umm:text-muted-foreground">{t('stats.total')}</div>
              </CardContent>
            </Card>
            <Card className={STYLE_CARD}>
              <CardContent>
                <Film className="umm:h-5 umm:w-5 umm:mx-auto umm:mb-1" style={{ color: `hsl(${PLATFORM_HUES.douban}, 55%, 45%)` }} />
                <div className="umm:text-2xl umm:font-bold">{dataReady ? stats.movie : '—'}</div>
                <div className="umm:text-xs umm:text-muted-foreground">{t('stats.movie')}</div>
              </CardContent>
            </Card>
            <Card className={STYLE_CARD}>
              <CardContent>
                <Tv className="umm:h-5 umm:w-5 umm:mx-auto umm:mb-1" style={{ color: `hsl(${PLATFORM_HUES.imdb}, 55%, 45%)` }} />
                <div className="umm:text-2xl umm:font-bold">{dataReady ? stats.tv : '—'}</div>
                <div className="umm:text-xs umm:text-muted-foreground">{t('stats.tv')}</div>
              </CardContent>
            </Card>
            <Card className={STYLE_CARD}>
              <CardContent>
                <Music className="umm:h-5 umm:w-5 umm:mx-auto umm:mb-1" style={{ color: `hsl(${PLATFORM_HUES.neodb}, 55%, 45%)` }} />
                <div className="umm:text-2xl umm:font-bold">{dataReady ? stats.music : '—'}</div>
                <div className="umm:text-xs umm:text-muted-foreground">{t('stats.music')}</div>
              </CardContent>
            </Card>
            <Card className={STYLE_CARD}>
              <CardContent>
                <Book className="umm:h-5 umm:w-5 umm:mx-auto umm:mb-1" style={{ color: `hsl(${PLATFORM_HUES.neodb}, 45%, 35%)` }} />
                <div className="umm:text-2xl umm:font-bold">{dataReady ? stats.book : '—'}</div>
                <div className="umm:text-xs umm:text-muted-foreground">{t('stats.book')}</div>
              </CardContent>
            </Card>
            <Card className={STYLE_CARD}>
              <CardContent>
                <Gamepad2 className="umm:h-5 umm:w-5 umm:mx-auto umm:mb-1" />
                <div className="umm:text-2xl umm:font-bold">{dataReady ? stats.game : '—'}</div>
                <div className="umm:text-xs umm:text-muted-foreground">{t('stats.game')}</div>
              </CardContent>
            </Card>
            <Card className={STYLE_CARD}>
              <CardContent>
                <ShieldAlert className="umm:h-5 umm:w-5 umm:mx-auto umm:mb-1" />
                <div className="umm:text-2xl umm:font-bold">{dataReady ? stats.jav : '—'}</div>
                <div className="umm:text-xs umm:text-muted-foreground">{t('stats.jav')}</div>
              </CardContent>
            </Card>
            <Card className={STYLE_CARD}>
              <CardContent>
                <Play className="umm:h-5 umm:w-5 umm:mx-auto umm:mb-1" />
                <div className="umm:text-2xl umm:font-bold">{dataReady ? stats.bilibili : '—'}</div>
                <div className="umm:text-xs umm:text-muted-foreground">B站</div>
              </CardContent>
            </Card>
          </div>

          {/* Refresh button */}
          <Button variant="outline" size="sm" onClick={loadData} disabled={!dataReady}>
            <RefreshCw className="umm:h-4 umm:w-4 umm:mr-2" />
            {t('common.refresh')}
          </Button>
        </div>
      )}

      {/* Weekly activity tab */}
      {activeSubTab === 'weekly' && (
        <Card>
          <CardHeader>
            <CardTitle className="umm:text-lg">{t('tab.weekly')}</CardTitle>
          </CardHeader>
          <CardContent>
            {dataReady ? (
              <HeatmapCalendar data={weeklyActivity} />
            ) : (
              <div className="umm:h-32 umm:flex umm:items-center umm:justify-center umm:text-muted-foreground">
                {t('common.loading')}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Platform distribution tab */}
      {activeSubTab === 'platform' && (
        <Card>
          <CardHeader>
            <CardTitle className="umm:text-lg">{t('tab.platform')}</CardTitle>
          </CardHeader>
          <CardContent>
            {dataReady ? (
              <PlatformDistribution data={platformData} />
            ) : (
              <div className="umm:h-32 umm:flex umm:items-center umm:justify-center umm:text-muted-foreground">
                {t('common.loading')}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}