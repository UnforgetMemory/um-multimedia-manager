import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/stores/use-app-store'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Star, Search, Filter } from 'lucide-react'
import { PLATFORM_OPTIONS } from '@/entrypoints/options/constants'

const MEDIA_TYPE_OPTIONS = [
  { value: '', labelKey: 'common.all' },
  { value: 'movie', labelKey: 'common.movie' },
  { value: 'tv', labelKey: 'common.tv' },
  { value: 'music', labelKey: 'common.music' },
  { value: 'book', labelKey: 'common.book' },
  { value: 'game', labelKey: 'common.game' },
  { value: 'video', labelKey: 'common.video' },
] as const

function getStatusLabel(status: number, type: string, t: (key: string) => string): string {
  if (type === 'music') {
    const labels: Record<number, string> = {
      0: t('common.unlistened'),
      1: t('common.rating'),
      2: t('common.listened'),
    }
    return labels[status] || t('common.unknown')
  }
  const labels: Record<number, string> = {
    0: t('common.unwatched'),
    1: t('common.rating'),
    2: t('common.watched'),
  }
  return labels[status] || t('common.unknown')
}

function getStatusVariant(status: number): 'outline' | 'secondary' | 'default' {
  if (status === 2) return 'default'
  if (status === 1) return 'secondary'
  return 'outline'
}

function getProviderLabel(provider: string, t: (key: string) => string): string {
  const labels: Record<string, string> = {
    douban: t('platform.douban'),
    imdb: t('platform.imdb'),
    neodb: t('platform.neodb'),
    tmdb: t('platform.tmdb'),
    bilibili: t('platform.bilibili'),
    youtube: t('platform.youtube'),
  }
  return labels[provider] || provider
}

function getTypeLabel(type: string, t: (key: string) => string): string {
  const labels: Record<string, string> = {
    movie: t('common.movie'),
    tv: t('common.tv'),
    music: t('common.music'),
    book: t('common.book'),
    game: t('common.game'),
    video: t('common.video'),
  }
  return labels[type] || type
}

function extractDisplayTitle(record: { url: string; providerId: string; comment?: string }): string {
  if (record.comment) return record.comment
  try {
    const url = new URL(record.url)
    const segments = url.pathname.split('/').filter(Boolean)
    if (segments.length > 0) return decodeURIComponent(segments[segments.length - 1])
  } catch {}
  return record.providerId
}

export default function RatingTab() {
  const { t } = useTranslation()
  const { records, loading, loadData } = useAppStore()

  const [searchText, setSearchText] = useState('')
  const [platformFilter, setPlatformFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')

  useEffect(() => {
    loadData()
  }, [loadData])

  const filteredRecords = useMemo(() => {
    return records.filter((record: any) => {
      if (platformFilter && record.provider !== platformFilter) return false
      if (typeFilter && record.type !== typeFilter) return false
      if (searchText) {
        const query = searchText.toLowerCase()
        const title = extractDisplayTitle(record).toLowerCase()
        const id = record.providerId?.toLowerCase() || ''
        const url = record.url?.toLowerCase() || ''
        return title.includes(query) || id.includes(query) || url.includes(query)
      }
      return true
    })
  }, [records, platformFilter, typeFilter, searchText])

  return (
    <div className="umm-space-y-6">
      <div className="umm-space-y-1">
        <h2 className="umm-text-2xl umm-font-bold umm-tracking-tight">
          {t('nav.rating')}
        </h2>
        <p className="umm-text-sm umm-text-muted-foreground">
          {t('rating.description') || 'Browse and filter all rated records'}
        </p>
      </div>

      <Separator />

      {/* Filters */}
      <div className="umm-flex umm-flex-wrap umm-items-center umm-gap-3">
        <div className="umm-flex umm-items-center umm-gap-2">
          <Filter className="umm-h-4 umm-w-4 umm-text-muted-foreground" />
          <Select value={platformFilter} onValueChange={setPlatformFilter}>
            <SelectTrigger className="umm-w-36">
              <SelectValue placeholder={t('common.all')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">{t('common.all')}</SelectItem>
              {PLATFORM_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {t(opt.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="umm-w-32">
            <SelectValue placeholder={t('common.all')} />
          </SelectTrigger>
          <SelectContent>
            {MEDIA_TYPE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {t(opt.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="umm-relative umm-flex-1 umm-min-w-[200px]">
          <Search className="umm-absolute umm-left-3 umm-top-1/2 umm--translate-y-1/2 umm-h-4 umm-w-4 umm-text-muted-foreground" />
          <Input
            placeholder={t('common.search') || 'Search...'}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="umm-pl-9"
          />
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="umm-flex umm-items-center umm-justify-center umm-py-12">
          <div className="umm-flex umm-flex-col umm-items-center umm-gap-2">
            <div className="umm-h-6 umm-w-6 umm-animate-spin umm-rounded-full umm-border-2 umm-border-primary umm-border-t-transparent" />
            <span className="umm-text-sm umm-text-muted-foreground">{t('common.loading')}</span>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredRecords.length === 0 && (
        <div className="umm-flex umm-flex-col umm-items-center umm-justify-center umm-py-16 umm-text-center">
          <Star className="umm-h-12 umm-w-12 umm-text-muted-foreground/40 umm-mb-4" />
          <p className="umm-text-lg umm-font-medium umm-text-muted-foreground">
            {t('common.noData')}
          </p>
          <p className="umm-text-sm umm-text-muted-foreground/60 umm-mt-1">
            {t('rating.noRecords') || 'No records found matching your filters'}
          </p>
        </div>
      )}

      {/* Records List */}
      {!loading && filteredRecords.length > 0 && (
        <div className="umm-space-y-3">
          <p className="umm-text-sm umm-text-muted-foreground">
            {filteredRecords.length} / {records.length} {t('common.records') || 'records'}
          </p>
          <div className="umm-grid umm-gap-3">
            {filteredRecords.map((record: any, idx: number) => {
              const rating = record.rating || 0
              const fullStars = Math.floor(rating / 2)
              const hasHalf = rating % 2 >= 1
              const emptyStars = 5 - fullStars - (hasHalf ? 1 : 0)
              const title = extractDisplayTitle(record)

              return (
                <Card key={`${record.provider}-${record.providerId}-${idx}`}>
                  <CardContent className="umm-p-4">
                    <div className="umm-flex umm-items-start umm-justify-between umm-gap-4">
                      <div className="umm-min-w-0 umm-flex-1">
                        <div className="umm-flex umm-items-center umm-gap-2 umm-mb-2">
                          <Badge variant="outline" className="umm-text-xs">
                            {getProviderLabel(record.provider, t)}
                          </Badge>
                          <Badge variant="secondary" className="umm-text-xs">
                            {getTypeLabel(record.type, t)}
                          </Badge>
                          <Badge variant={getStatusVariant(record.status)} className="umm-text-xs">
                            {getStatusLabel(record.status, record.type, t)}
                          </Badge>
                        </div>
                        <p className="umm-text-sm umm-font-medium umm-truncate" title={title}>
                          {title}
                        </p>
                        <p className="umm-text-xs umm-text-muted-foreground umm-font-mono umm-mt-0.5">
                          {record.providerId}
                        </p>
                        {record.url && (
                          <a
                            href={record.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="umm-text-xs umm-text-blue-500 hover:umm-underline umm-line-clamp-1 umm-mt-0.5"
                          >
                            {record.url}
                          </a>
                        )}
                        {record.comment && (
                          <p className="umm-text-xs umm-text-muted-foreground umm-mt-1 umm-italic">
                            &ldquo;{record.comment}&rdquo;
                          </p>
                        )}
                      </div>

                      {/* Rating Stars */}
                      <div className="umm-flex umm-flex-col umm-items-center umm-gap-1 umm-shrink-0">
                        <div className="umm-flex umm-items-center umm-gap-0.5">
                          {Array.from({ length: fullStars }).map((_, i) => (
                            <Star
                              key={`full-${i}`}
                              className="umm-h-4 umm-w-4 umm-fill-yellow-400 umm-text-yellow-400"
                            />
                          ))}
                          {hasHalf && (
                            <span className="umm-relative umm-h-4 umm-w-4">
                              <Star className="umm-absolute umm-inset-0 umm-h-4 umm-w-4 umm-text-muted-foreground/30" />
                              <span className="umm-absolute umm-inset-0 umm-overflow-hidden umm-w-2">
                                <Star className="umm-h-4 umm-w-4 umm-fill-yellow-400 umm-text-yellow-400" />
                              </span>
                            </span>
                          )}
                          {Array.from({ length: emptyStars }).map((_, i) => (
                            <Star
                              key={`empty-${i}`}
                              className="umm-h-4 umm-w-4 umm-text-muted-foreground/30"
                            />
                          ))}
                        </div>
                        <span className="umm-text-xs umm-font-medium umm-tabular-nums">
                          {rating.toFixed(1)}/10
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
