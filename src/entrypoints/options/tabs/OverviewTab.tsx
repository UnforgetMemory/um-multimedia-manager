import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/stores/use-app-store'
import { useStats, type RecordWithType } from '@/hooks/useStats'
import { PLATFORM_HUES } from '@/hooks/usePlatformMeta'
import { HeatmapCalendar } from '@/shared/HeatmapCalendar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AlertCircle, RefreshCw, Database, Film, Tv, Music, Book, Gamepad2, ShieldAlert, Play } from 'lucide-react'

const SUB_TABS = [
  { id: 'overview' as const, labelKey: 'tab.overview' },
  { id: 'weekly' as const, labelKey: 'tab.weekly' },
  { id: 'platform' as const, labelKey: 'tab.platform' },
]

const WEEKDAY_KEYS = [
  'weekday.sunday', 'weekday.monday', 'weekday.tuesday', 'weekday.wednesday',
  'weekday.thursday', 'weekday.friday', 'weekday.saturday',
]

// ---- stat card definitions (keep parallel) ----
const STAT_ICONS = [Film, Tv, Music, Book, Gamepad2, ShieldAlert, Play]
const STAT_LABEL_KEYS = ['stats.movie', 'stats.tv', 'stats.music', 'stats.book', 'stats.game', 'stats.jav', 'stats.bilibili']
const STAT_KEYS = ['movie', 'tv', 'music', 'book', 'game', 'jav', 'bilibili'] as const

// ---- helpers ----
function platformHsl(hue: number, isDark: boolean, type: 'bar' | 'icon') {
  const l = type === 'bar' ? (isDark ? 50 : 45) : (isDark ? 42 : 38)
  return `hsl(${hue}, 55%, ${l}%)`
}

function barColor(count: number, maxCount: number) {
  if (count === 0) return 'hsl(var(--muted))'
  const ratio = maxCount > 0 ? count / maxCount : 0
  if (ratio < 0.25) return 'hsl(142, 45%, 60%)'
  if (ratio < 0.5) return 'hsl(142, 50%, 50%)'
  if (ratio < 0.75) return 'hsl(142, 55%, 42%)'
  return 'hsl(142, 58%, 32%)'
}

// ---- types ----
interface DailyItem {
  source: string
  label: string
  count: number
}
interface DailyStat {
  date: string
  dateStr: string
  weekday: string
  total: number
  items: DailyItem[]
  isToday: boolean
}
interface PlatformStat {
  provider: string
  count: number
  types: { label: string; count: number }[]
}

// ===================== COMPONENT =====================

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

  const handleRetry = () => {
    setErrorState(null)
    loadData()
  }

  // Detect current theme once (updates are handled via CSS variables)
  const isDark = document.documentElement.classList.contains('dark')

  // ---- Platform stats with type breakdowns ----
  const platformStats = useMemo<PlatformStat[]>(() => {
    const map: Record<string, PlatformStat> = {}
    const rawRecords = records as RecordWithType[]
    for (const r of rawRecords) {
      const provider = r.provider || 'unknown'
      if (!map[provider]) map[provider] = { provider, count: 0, types: [] }
      map[provider].count++
      const rawType = r.type || 'movie'
      const type = provider === 'bilibili' || provider === 'youtube' ? 'video' : rawType
      const existing = map[provider].types.find(t => t.label === type)
      if (existing) existing.count++
      else map[provider].types.push({ label: type, count: 1 })
    }
    for (const item of adultAvItems) {
      const provider = item.source
      if (!map[provider]) map[provider] = { provider, count: 0, types: [] }
      map[provider].count++
      const existing = map[provider].types.find(t => t.label === 'jav')
      if (existing) existing.count++
      else map[provider].types.push({ label: 'jav', count: 1 })
    }
    return Object.values(map).sort((a, b) => b.count - a.count)
  }, [records, adultAvItems])

  const maxPlatformCount = useMemo(() => Math.max(1, ...platformStats.map(p => p.count)), [platformStats])

  // ---- Weekly stats ----
  const weeklyStats = useMemo(() => {
    const rawRecords = records as RecordWithType[]
    const now = new Date()
    const dayMs = 86400000
    const days: DailyStat[] = []
    let weekTotal = 0

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * dayMs)
      const dateStr = `${d.getMonth() + 1}/${d.getDate()}`
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const isToday = i === 0

      const sourceCounts: Record<string, number> = {}
      for (const r of rawRecords) {
        if (!r.updatedAt) continue
        const rd = new Date(r.updatedAt)
        const rKey = `${rd.getFullYear()}-${String(rd.getMonth() + 1).padStart(2, '0')}-${String(rd.getDate()).padStart(2, '0')}`
        if (rKey !== key) continue
        const provider = r.provider || 'unknown'
        sourceCounts[provider] = (sourceCounts[provider] || 0) + 1
      }
      for (const item of adultAvItems) {
        if (!item.updatedAt) continue
        const rd = new Date(item.updatedAt)
        const rKey = `${rd.getFullYear()}-${String(rd.getMonth() + 1).padStart(2, '0')}-${String(rd.getDate()).padStart(2, '0')}`
        if (rKey !== key) continue
        sourceCounts[item.source] = (sourceCounts[item.source] || 0) + 1
      }

      const total = Object.values(sourceCounts).reduce((a, b) => a + b, 0)
      weekTotal += total

      const items = Object.entries(sourceCounts)
        .map(([source, count]) => ({ source, label: t(`platform.${source}`, source), count }))
        .sort((a, b) => b.count - a.count)

      days.push({ date: key, dateStr, weekday: t(WEEKDAY_KEYS[d.getDay()]), total, items, isToday })
    }

    const maxDaily = Math.max(1, ...days.map(d => d.total))
    const avgDaily = Math.round(weekTotal / 7)
    const peakDay = days.reduce((max, d) => (d.total > max.total ? d : max), days[0]).weekday

    return { days, total: weekTotal, maxDaily, avgDaily, peakDay }
  }, [records, adultAvItems, t])

  // ---- Weekly data for HeatmapCalendar ----
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

  // ---- Loading skeleton ----
  if (!dataReady && !errorState) {
    return (
      <div className="umm:flex umm:flex-col umm:gap-[var(--umm-section-gap)]">
        {/* Sub-tab skeleton */}
        <div className="umm:flex umm:gap-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="umm:h-8 umm:w-20 umm:rounded-md umm:bg-muted umm:animate-pulse" />
          ))}
        </div>

        {/* Cards skeleton */}
        <div className="umm:grid umm:grid-cols-2 sm:umm:grid-cols-3 lg:umm:grid-cols-4 umm:gap-3">
          {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
            <Card key={i} className="umm:items-center umm:justify-center umm:py-4 umm:text-center umm:gap-1">
              <CardContent>
                <div className="umm:h-5 umm:w-5 umm:mx-auto umm:mb-1 umm:rounded umm:bg-muted umm:animate-pulse" />
                <div className="umm:h-7 umm:w-12 umm:mx-auto umm:mb-1 umm:rounded umm:bg-muted umm:animate-pulse" />
                <div className="umm:h-4 umm:w-16 umm:mx-auto umm:rounded umm:bg-muted umm:animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  // ---- Error state ----
  if (errorState && !dataReady) {
    return (
      <div className="umm:flex umm:flex-col umm:gap-[var(--umm-section-gap)]">
        <Alert variant="destructive">
          <AlertCircle className="umm:h-4 umm:w-4" />
          <AlertTitle>{t('common.error')}</AlertTitle>
          <AlertDescription>{errorState}</AlertDescription>
        </Alert>
        <Button variant="outline" size="sm" onClick={handleRetry}>
          <RefreshCw className="umm:h-4 umm:w-4 umm:mr-2" />
          {t('common.retry')}
        </Button>
      </div>
    )
  }

  return (
    <div className="umm:flex umm:flex-col umm:gap-[var(--umm-section-gap)]">
      {/* =========== Sub-tab navigation =========== */}
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

      {/* =========== OVERVIEW TAB =========== */}
      {activeSubTab === 'overview' && (
        <div className="umm:flex umm:flex-col umm:gap-[var(--umm-section-gap)]">
          {/* Stats grid */}
          <div className="umm:grid umm:grid-cols-2 sm:umm:grid-cols-3 lg:umm:grid-cols-4 umm:gap-3">
            {/* Total card */}
            <Card className="umm:items-center umm:justify-center umm:py-4 umm:text-center umm:gap-1">
              <CardContent>
                <Database className="umm:h-5 umm:w-5 umm:mx-auto umm:mb-1 umm:text-primary" />
                <div className="umm:text-2xl umm:font-bold umm:tabular-nums">
                  {stats.total.toLocaleString()}
                </div>
                <div className="umm:text-xs umm:text-muted-foreground">{t('stats.total')}</div>
              </CardContent>
            </Card>
            {/* Typed stat cards */}
            {STAT_KEYS.map((key, i) => {
              const Icon = STAT_ICONS[i]
              const hue = key === 'movie' ? PLATFORM_HUES.douban
                : key === 'tv' ? PLATFORM_HUES.imdb
                : key === 'music' ? PLATFORM_HUES.neodb
                : key === 'book' ? PLATFORM_HUES.neodb
                : key === 'jav' ? PLATFORM_HUES.javdb
                : key === 'bilibili' ? PLATFORM_HUES.bilibili
                : 0
              const val = stats[key as keyof typeof stats] as number
              return (
                <Card key={key} className="umm:items-center umm:justify-center umm:py-4 umm:text-center umm:gap-1">
                  <CardContent>
                    <Icon
                      className="umm:h-5 umm:w-5 umm:mx-auto umm:mb-1"
                      style={{ color: platformHsl(hue, isDark, 'icon') }}
                    />
                    <div className="umm:text-2xl umm:font-bold umm:tabular-nums">
                      {val.toLocaleString()}
                    </div>
                    <div className="umm:text-xs umm:text-muted-foreground">
                      {t(STAT_LABEL_KEYS[i])}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {/* Heatmap */}
          <Card>
            <CardHeader>
              <CardTitle className="umm:text-lg">{t('common.activity')}</CardTitle>
            </CardHeader>
            <CardContent>
              <HeatmapCalendar data={weeklyActivity} />
            </CardContent>
          </Card>

          {/* Refresh */}
          <Button variant="outline" size="sm" onClick={loadData}>
            <RefreshCw className="umm:h-4 umm:w-4 umm:mr-2" />
            {t('common.refresh')}
          </Button>
        </div>
      )}

      {/* =========== WEEKLY TAB =========== */}
      {activeSubTab === 'weekly' && (
        <div className="umm:flex umm:flex-col umm:gap-6">
          {/* Weekly summary stats */}
          <div className="umm:grid umm:grid-cols-3" style={{ gap: 'var(--umm-section-gap)' }}>
            <Card className="umm:text-center">
              <CardContent>
                <div className="umm:font-bold umm:tabular-nums umm:text-primary-content" style={{ fontSize: '1.5rem' }}>
                  {weeklyStats.total}
                </div>
                <div className="umm:font-caption umm:text-secondary-content umm:mt-1">{t('stats.weeklyTotal')}</div>
              </CardContent>
            </Card>
            <Card className="umm:text-center">
              <CardContent>
                <div className="umm:font-bold umm:tabular-nums umm:text-primary-content" style={{ fontSize: '1.5rem' }}>
                  {weeklyStats.avgDaily}
                </div>
                <div className="umm:font-caption umm:text-secondary-content umm:mt-1">{t('stats.dailyAvg')}</div>
              </CardContent>
            </Card>
            <Card className="umm:text-center">
              <CardContent>
                <div className="umm:font-bold umm:tabular-nums umm:text-primary-content" style={{ fontSize: '1.5rem' }}>
                  {weeklyStats.peakDay}
                </div>
                <div className="umm:font-caption umm:text-secondary-content umm:mt-1">{t('stats.peakDay')}</div>
              </CardContent>
            </Card>
          </div>

          {/* Daily bar chart (log scale) */}
          <Card>
            <CardHeader>
              <h3 className="umm:font-h2 umm:text-primary-content">{t('stats.dailyRecords')}</h3>
            </CardHeader>
            <CardContent>
              <div className="umm:flex umm:gap-2" style={{ height: '8rem' }}>
                {weeklyStats.days.map((day) => {
                  const barH = day.total === 0
                    ? 10
                    : Math.max(10, (Math.log(day.total + 1) / Math.log(weeklyStats.maxDaily + 1)) * 100)
                  return (
                    <div key={day.date} className="umm:flex-1 umm:flex umm:flex-col umm:items-center umm:gap-1" style={{ height: '100%' }}>
                      <div className="umm:flex-1 umm:w-full umm:flex umm:flex-col umm:justify-end umm:min-h-0">
                        <div
                          className="umm:w-full umm:rounded-t-lg umm:transition-all umm:duration-300 umm:relative group umm:cursor-default"
                          style={{
                            height: `${barH}%`,
                            backgroundColor: day.isToday ? 'hsl(var(--primary))' : barColor(day.total, weeklyStats.maxDaily),
                            minHeight: '10px',
                            opacity: day.total === 0 ? 0.3 : 1,
                          }}
                        >
                          <div className="umm:absolute umm:-top-6 umm:left-1/2 umm:-translate-x-1/2 umm:text-xs umm:font-bold umm:text-primary-content umm:opacity-0 umm:group-hover:opacity-100 umm:transition-opacity umm:whitespace-nowrap">
                            {day.total}
                          </div>
                        </div>
                      </div>
                      <div className="umm:text-center">
                        <div className="umm:font-caption umm:text-secondary-content" style={{ fontSize: '0.625rem' }}>
                          {day.weekday.substring(0, 1)}
                        </div>
                        <div
                          className="umm:font-caption umm:text-secondary-content"
                          style={{ fontSize: '0.625rem', color: day.isToday ? 'hsl(var(--primary))' : undefined }}
                        >
                          {day.dateStr}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {/* Daily detail list */}
          <Card>
            <CardHeader>
              <h3 className="umm:font-h2 umm:text-primary-content">{t('stats.dailyDetail')}</h3>
            </CardHeader>
            <CardContent>
              <div className="umm:flex umm:flex-col umm:gap-3">
                {weeklyStats.days.map((day) => (
                  <div
                    key={day.date}
                    className={`umm:rounded-xl umm:border umm:transition-all ${
                      day.isToday
                        ? 'umm:border-primary/30 umm:bg-primary/[0.03] umm:shadow-sm'
                        : 'umm:border-border hover:umm:border-muted hover:umm:shadow-sm'
                    }`}
                    style={{ padding: 'var(--umm-card-padding)' }}
                  >
                    {/* Day header row */}
                    <div className="umm:flex umm:items-center umm:justify-between umm:mb-3">
                      <div className="umm:flex umm:items-center umm:gap-3">
                        <div
                          className="umm:w-10 umm:h-10 umm:rounded-xl umm:flex umm:flex-col umm:items-center umm:justify-center"
                          style={{
                            backgroundColor: day.isToday ? 'hsl(var(--primary))' : 'hsl(var(--muted))',
                            color: day.isToday ? 'hsl(var(--primary-foreground))' : 'hsl(var(--muted-foreground))',
                          }}
                        >
                          <span className="umm:font-bold umm:leading-none" style={{ fontSize: '0.9rem' }}>
                            {day.weekday.charAt(0)}
                          </span>
                          <span className="umm:leading-none umm:text-secondary-content" style={{ fontSize: '0.7rem' }}>
                            {day.dateStr}
                          </span>
                        </div>
                      </div>
                      <div className="umm:flex umm:items-center" style={{ gap: 'var(--umm-spacing-2)' }}>
                        {day.isToday && (
                          <span className="umm:text-xs umm:font-medium umm:px-2 umm:py-0.5 umm:rounded-full umm:bg-primary/10 umm:text-primary">
                            {t('common.today')}
                          </span>
                        )}
                        <div className="umm:font-bold umm:tabular-nums umm:text-primary-content" style={{ fontSize: '1.125rem' }}>
                          {day.total}
                        </div>
                      </div>
                    </div>

                    {/* Source breakdown with mini progress bars */}
                    {day.items.length > 0 ? (
                      <div className="umm:flex umm:flex-col umm:gap-2">
                        {day.items.map((item, i) => (
                          <div key={i} className="umm:flex umm:items-center" style={{ gap: 'var(--umm-spacing-2)' }}>
                            <span className="umm:font-body umm:text-secondary-content umm:shrink-0" style={{ width: '80px', fontSize: '0.75rem' }}>
                              {item.label}
                            </span>
                            <div className="umm:flex-1 umm:h-2 umm:rounded-full umm:bg-muted umm:overflow-hidden">
                              <div
                                className="umm:h-full umm:rounded-full umm:transition-all umm:duration-500"
                                style={{
                                  width: `${(item.count / day.total) * 100}%`,
                                  backgroundColor: platformHsl(
                                    PLATFORM_HUES[item.source] || 0,
                                    isDark,
                                    'bar',
                                  ),
                                }}
                              />
                            </div>
                            <span className="umm:font-body umm:font-medium umm:tabular-nums umm:text-primary-content umm:shrink-0" style={{ width: '32px', textAlign: 'right', fontSize: '0.75rem' }}>
                              {item.count}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="umm:py-2 umm:text-center umm:font-caption umm:text-secondary-content">
                        {t('common.noRecords')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* =========== PLATFORM TAB =========== */}
      {activeSubTab === 'platform' && (
        <div className="umm:flex umm:flex-col umm:gap-6">
          <div>
            <h3 className="umm:font-h2 umm:text-primary-content umm:mb-3">{t('tab.platformDistribution')}</h3>

            {/* Summary bar chart */}
            <Card className="umm:mb-4">
              <div style={{ padding: 'var(--umm-card-padding)' }}>
                <div className="umm:flex umm:items-end" style={{ gap: 'var(--umm-spacing-1)', height: '5rem' }}>
                  {platformStats.map((info) => (
                    <div
                      key={info.provider}
                      className="umm:flex-1 umm:rounded-t-md umm:transition-all umm:duration-500 umm:relative group umm:cursor-default"
                      style={{
                        height: `${Math.max(8, (info.count / maxPlatformCount) * 100)}%`,
                        backgroundColor: platformHsl(PLATFORM_HUES[info.provider] || 0, isDark, 'bar'),
                      }}
                    >
                      <div className="umm:absolute umm:-top-6 umm:left-1/2 umm:-translate-x-1/2 umm:text-xs umm:font-bold umm:text-primary-content umm:opacity-0 umm:group-hover:opacity-100 umm:transition-opacity umm:whitespace-nowrap umm:tabular-nums">
                        {info.count.toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="umm:flex umm:items-end" style={{ gap: 'var(--umm-spacing-1)', marginTop: 'var(--umm-spacing-1)' }}>
                  {platformStats.map((info) => (
                    <div
                      key={`${info.provider}-label`}
                      className="umm:flex-1 umm:text-center umm:font-caption umm:text-secondary-content umm:truncate"
                    >
                      {t(`platform.${info.provider}`, info.provider)}
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            {/* Detailed platform cards with type breakdowns */}
            <div className="umm:flex umm:flex-col umm:gap-3">
              {platformStats.map((info) => {
                const pHue = PLATFORM_HUES[info.provider] || 0
                return (
                  <Card key={info.provider} className="umm:overflow-hidden">
                    <div style={{ padding: 'var(--umm-card-padding)' }}>
                      <div className="umm:flex umm:items-center umm:justify-between umm:mb-3">
                        <div className="umm:flex umm:items-center umm:gap-2">
                          <div
                            className="umm:w-3 umm:h-3 umm:rounded-full"
                            style={{ backgroundColor: platformHsl(pHue, isDark, 'bar') }}
                          />
                          <span className="umm:font-medium umm:text-primary-content">
                            {t(`platform.${info.provider}`, info.provider)}
                          </span>
                        </div>
                        <span className="umm:text-sm umm:font-bold umm:tabular-nums umm:text-primary-content">
                          {info.count.toLocaleString()}
                        </span>
                      </div>
                      <div className="umm:flex umm:flex-wrap umm:gap-2">
                        {info.types.map((type) => {
                          const typeLabel = t(
                            type.label === 'video' ? 'stats.video'
                              : type.label === 'jav' ? 'stats.jav'
                              : `stats.${type.label}`,
                            type.label,
                          )
                          return (
                            <div
                              key={type.label}
                              className="umm:inline-flex umm:items-center umm:gap-1 umm:px-2 umm:py-1 umm:rounded-full umm:text-xs"
                              style={{
                                backgroundColor: platformHsl(pHue, isDark, 'bar').replace('50%', '20%').replace('45%', '18%'),
                                color: platformHsl(pHue, isDark, 'bar'),
                              }}
                            >
                              <span>{typeLabel}</span>
                              <span className="umm:font-bold umm:tabular-nums">{type.count}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </Card>
                )
              })}
            </div>

            {platformStats.length === 0 && (
              <div className="umm:py-8 umm:text-center umm:font-body umm:text-secondary-content">
                {t('common.noData')}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
