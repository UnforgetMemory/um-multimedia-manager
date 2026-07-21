/**
 * UmmSearchCard — search result card for Douban movie/TV/music/book search page.
 * Displays cover, title, status badge, rating, metadata, and media format chips (music only).
 */
import { UmmImageWrapper } from '@/content/douban/components/UmmImageWrapper'
import { UmmStatusBadge } from '@/content/douban/components/UmmStatusBadge'
import { UmmRating } from '@/content/douban/components/UmmRating'
import { ASPECT_RATIO, MEDIA_FORMATS, FORMAT_LABELS, FORMAT_COLORS } from '@/content/douban/shared/constants'
import type { SearchItem } from '../types'

interface UmmSearchCardProps {
  item: SearchItem
  records: Map<string, any>
  type?: string
}

/**
 * Extract media format from abstract metadata string (music only).
 * Returns the display label or null.
 */
function extractMediaFormat(abstract: string, isMusic: boolean): string | null {
  if (!isMusic || !abstract) return null
  const segments = abstract.split(' / ')
  for (const seg of segments) {
    const trimmed = seg.trim()
    if (MEDIA_FORMATS.has(trimmed)) {
      return FORMAT_LABELS[trimmed] || trimmed
    }
  }
  return null
}

export default function UmmSearchCard({ item, records, type = 'movie' }: UmmSearchCardProps) {
  const rec = records.get(String(item.id))
  const badgeStatus = rec?.status ?? 0
  const badgeRating = rec?.rating ?? 0
  const isMusic = type === 'music'
  const isBook = type === 'book'

  const mediaFormat = extractMediaFormat(item.abstract, isMusic)
  const firstLabel = item.labels?.length && !isBook ? item.labels[0].text : null

  const cardClass = 'umm-search-card' + (isMusic ? ' umm-search-card--music' : '')
  const coverAreaClass = 'umm-search-card-cover-area' + (isMusic ? ' umm-search-card-cover-area--music' : '')
  const coverClass = 'umm-search-card-cover' + (isMusic ? ' umm-search-card-cover--music' : '')
  const chipClass = 'umm-search-media-chip' + (mediaFormat && FORMAT_COLORS[mediaFormat] ? ' ' + FORMAT_COLORS[mediaFormat] : '')

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cardClass}
    >
      <div className={coverAreaClass}>
        <div className={coverClass}>
          <UmmImageWrapper
            src={item.cover_url}
            alt={item.title}
            aspectRatio={isMusic ? ASPECT_RATIO.SQUARE : ASPECT_RATIO.POSTER}
          />
          {firstLabel && <span className="umm-search-label">{firstLabel}</span>}
        </div>
        {isMusic && mediaFormat && (
          <div className="umm-search-media-row">
            <span className={chipClass}>{mediaFormat}</span>
          </div>
        )}
      </div>
      <div className="umm-search-card-body">
        <div className="umm-search-card-title-row">
          <span className="umm-search-card-title">{item.title}</span>
          <UmmStatusBadge status={badgeStatus} rating={badgeRating} variant="small" type={type as any} />
        </div>
        {item.rating.value > 0 && (
          <UmmRating score={item.rating.value.toFixed(1)} count={item.rating.count} />
        )}
        {item.abstract && <div className="umm-search-meta">{item.abstract}</div>}
        {item.abstract_2 && !isBook && <div className="umm-search-cast">{item.abstract_2}</div>}
      </div>
    </a>
  )
}
