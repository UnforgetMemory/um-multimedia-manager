import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/stores/use-app-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Link, Link2Off, Search, ExternalLink } from 'lucide-react'

function getLinkedPlatforms(linkedIds: Record<string, string>): string[] {
  return Object.entries(linkedIds)
    .filter(([, value]) => Boolean(value))
    .map(([key]) => key)
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

function buildCanonicalUrl(provider: string, type: string, providerId: string): string {
  switch (provider) {
    case 'douban': {
      const subdomain = type === 'music' ? 'music' : type === 'book' ? 'book' : 'movie'
      const path = type === 'game' ? 'game' : 'subject'
      return `https://${subdomain}.douban.com/${path}/${providerId}/`
    }
    case 'imdb':
      return `https://www.imdb.com/title/${providerId}/`
    case 'neodb': {
      const path = type === 'tv' ? 'tv' : type === 'music' ? 'album' : 'movie'
      return `https://neodb.social/${path}/${providerId}/`
    }
    case 'tmdb':
      return type === 'tv'
        ? `https://www.themoviedb.org/tv/${providerId}/`
        : `https://www.themoviedb.org/movie/${providerId}/`
    case 'bilibili':
      return `https://www.bilibili.com/video/${providerId}/`
    case 'youtube':
      return `https://www.youtube.com/watch?v=${providerId}`
    default:
      return ''
  }
}

export default function LinkedTab() {
  const { t } = useTranslation()
  const { records, loading, loadData } = useAppStore()

  const [searchText, setSearchText] = useState('')
  const [platformFilter] = useState('')

  useEffect(() => {
    loadData()
  }, [loadData])

  const linkedRecords = useMemo(() => {
    return records.filter((record: any) => {
      if (!record.linkedIds) return false
      return Object.values(record.linkedIds).some((v) => Boolean(v))
    })
  }, [records])

  const filteredLinkedRecords = useMemo(() => {
    return linkedRecords.filter((record: any) => {
      if (platformFilter && record.provider !== platformFilter) return false
      if (searchText) {
        const query = searchText.toLowerCase()
        const title = extractDisplayTitle(record).toLowerCase()
        const id = record.providerId?.toLowerCase() || ''
        const url = record.url?.toLowerCase() || ''
        return title.includes(query) || id.includes(query) || url.includes(query)
      }
      return true
    })
  }, [linkedRecords, platformFilter, searchText])

  return (
    <div className="umm-space-y-6">
      <div className="umm-space-y-1">
        <h2 className="umm-text-2xl umm-font-bold umm-tracking-tight">
          {t('nav.linked')}
        </h2>
        <p className="umm-text-sm umm-text-muted-foreground">
          {t('linked.description') || 'Browse records with cross-platform links'}
        </p>
      </div>

      <Separator />

      {/* Filters */}
      <div className="umm-flex umm-flex-wrap umm-items-center umm-gap-3">
        <div className="umm-relative umm-flex-1 umm-min-w-[200px]">
          <Search className="umm-absolute umm-left-3 umm-top-1/2 umm--translate-y-1/2 umm-h-4 umm-w-4 umm-text-muted-foreground" />
          <input
            placeholder={t('common.search') || 'Search...'}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="umm-flex umm-h-9 umm-w-full umm-rounded-md umm-border umm-border-input umm-bg-transparent umm-px-3 umm-py-1 umm-pl-9 umm-text-sm umm-shadow-sm umm-transition-colors placeholder:umm-text-muted-foreground focus-visible:umm-outline-none focus-visible:umm-ring-1 focus-visible:umm-ring-ring disabled:umm-cursor-not-allowed disabled:umm-opacity-50"
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
      {!loading && linkedRecords.length === 0 && (
        <div className="umm-flex umm-flex-col umm-items-center umm-justify-center umm-py-16 umm-text-center">
          <Link2Off className="umm-h-12 umm-w-12 umm-text-muted-foreground/40 umm-mb-4" />
          <p className="umm-text-lg umm-font-medium umm-text-muted-foreground">
            {t('common.noData')}
          </p>
          <p className="umm-text-sm umm-text-muted-foreground/60 umm-mt-1">
            {t('linked.noLinkedRecords') || 'No cross-platform linked records found'}
          </p>
        </div>
      )}

      {/* Linked Records */}
      {!loading && filteredLinkedRecords.length > 0 && (
        <div className="umm-space-y-4">
          <p className="umm-text-sm umm-text-muted-foreground">
            {filteredLinkedRecords.length} {t('common.records') || 'records'}
          </p>

          <div className="umm-grid umm-gap-4">
            {filteredLinkedRecords.map((record: any, idx: number) => {
              const linkedPlatforms = getLinkedPlatforms(record.linkedIds)
              const title = extractDisplayTitle(record)

              return (
                <Card key={`linked-${record.provider}-${record.providerId}-${idx}`}>
                  <CardHeader className="umm-flex umm-flex-row umm-items-center umm-justify-between umm-gap-4 umm-pb-2">
                    <div className="umm-min-w-0 umm-flex-1">
                      <CardTitle className="umm-text-base umm-truncate">{title}</CardTitle>
                      <div className="umm-flex umm-items-center umm-gap-2 umm-mt-1.5">
                        <Badge variant="outline" className="umm-text-xs">
                          {getProviderLabel(record.provider, t)}
                        </Badge>
                        <Badge variant="secondary" className="umm-text-xs">
                          {getTypeLabel(record.type, t)}
                        </Badge>
                        <span className="umm-text-xs umm-text-muted-foreground umm-font-mono">
                          {record.providerId}
                        </span>
                      </div>
                    </div>
                    <div className="umm-flex umm-items-center umm-gap-1 umm-shrink-0">
                      <Link className="umm-h-4 umm-w-4 umm-text-primary" />
                      <span className="umm-text-xs umm-font-medium umm-text-primary">
                        {linkedPlatforms.length}
                      </span>
                    </div>
                  </CardHeader>

                  <CardContent className="umm-pt-2">
                    {/* Linked platforms */}
                    <div className="umm-flex umm-flex-wrap umm-gap-2 umm-mb-3">
                      {linkedPlatforms.map((platform) => (
                        <Badge
                          key={platform}
                          variant="secondary"
                          className="umm-text-xs umm-gap-1"
                        >
                          <ExternalLink className="umm-h-3 umm-w-3" />
                          {getProviderLabel(platform, t)}
                        </Badge>
                      ))}
                    </div>

                    {/* Linked IDs detail */}
                    <div className="umm-rounded-md umm-bg-muted/30 umm-p-3 umm-space-y-1.5">
                      {Object.entries(record.linkedIds).map(([platform, linkKey]) => {
                        if (!linkKey) return null
                        const [linkType, ...idParts] = (linkKey as string).split('::')
                        const linkProviderId = idParts.join('::')
                        const linkUrl = buildCanonicalUrl(platform, linkType, linkProviderId)

                        return (
                          <div
                            key={platform}
                            className="umm-flex umm-items-center umm-justify-between umm-gap-2 umm-text-xs"
                          >
                            <div className="umm-flex umm-items-center umm-gap-2 umm-min-w-0">
                              <Badge variant="outline" className="umm-text-[10px] umm-px-1">
                                {getProviderLabel(platform, t)}
                              </Badge>
                              <span className="umm-text-muted-foreground">{linkType}</span>
                              <span className="umm-font-mono umm-text-muted-foreground/70">
                                {linkProviderId}
                              </span>
                            </div>
                            {linkUrl && (
                              <a
                                href={linkUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="umm-text-primary hover:umm-underline umm-inline-flex umm-items-center umm-gap-0.5 umm-shrink-0"
                              >
                                <ExternalLink className="umm-h-3 umm-w-3" />
                                <span>{t('common.open')}</span>
                              </a>
                            )}
                          </div>
                        )
                      })}
                    </div>

                    {/* Comment */}
                    {record.comment && (
                      <p className="umm-text-xs umm-text-muted-foreground umm-mt-2 umm-italic">
                        &ldquo;{record.comment}&rdquo;
                      </p>
                    )}
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
