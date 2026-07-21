import React from 'react'
import { UmmScrollRow } from './UmmScrollRow'
import { UmmMediaCard } from '@/content/douban/components/UmmMediaCard'
import type { StoreRecord } from '@/types'

interface MediaRowItem {
  subjectId: string
  title: string
  rate: string
  posterUrl: string
  href: string
  intro?: string
  episodes?: string
  author?: string
}

interface UmmMediaRowProps {
  title: string
  items: MediaRowItem[]
  records: Map<string, StoreRecord>
  showEpisodes?: boolean
  type?: 'movie' | 'music' | 'book'
  grid?: boolean
}

/**
 * UmmMediaRow — scrollable media card row for homepage sections.
 * Combines UmmScrollRow + UmmMediaCard with automatic record lookup.
 * Ported from the Vue UmmMediaRow component.
 */
export const UmmMediaRow: React.FC<UmmMediaRowProps> = ({
  title,
  items,
  records,
  showEpisodes = false,
  type = 'movie',
  grid = false,
}) => {
  if (items.length === 0) return null

  const mode = grid ? 'grid' : 'scroll'

  return (
    <UmmScrollRow title={title} mode={mode}>
      {items.map(item => {
        const rec = records.get(item.subjectId)
        const status = rec?.status ?? 0
        const rating = rec?.rating ?? 0
        return (
          <UmmMediaCard
            key={`${item.subjectId}-${status}-${rating}`}
            mode={mode}
            posterUrl={item.posterUrl}
            title={item.title}
            href={item.href}
            rating={item.rate}
            intro={item.intro}
            author={item.author}
            episodes={showEpisodes ? item.episodes : undefined}
            badgeStatus={status}
            badgeRating={rating}
            type={type}
          />
        )
      })}
    </UmmScrollRow>
  )
}
