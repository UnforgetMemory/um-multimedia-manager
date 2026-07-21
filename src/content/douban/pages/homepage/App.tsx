import { useEffect, useRef } from 'react'
import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'
import { useRecordCache } from './hooks/useRecordCache'
import { useDoubanSection } from './hooks/useDoubanSection'
import { useHomepageObserver } from './hooks/useHomepageObserver'
import { UmmMediaRow } from './components/UmmMediaRow'
import { UmmBillboardCard } from './components/UmmBillboardCard'
import { UmmScrollRow } from './components/UmmScrollRow'
import { UmmReviewsSection } from './components/UmmReviewsSection'
import {
  parseScreeningItems,
  parseBillboardItems,
  parseHotSection,
} from './extractors'

/**
 * App — douban.com homepage overlay.
 *
 * Features:
 * - "正在热映" (Now Showing) as a media grid
 * - "一周口碑榜" (Weekly Billboard) as a scrollable row with ranking numbers
 * - "最近热门电影"/"最近热门电视剧" (Recent Hot Movies/TV) as media grids
 * - Reviews section with status badges on existing Douban review DOM
 * - Record lookups from IndexedDB for badge status and rating
 *
 * Uses MutationObserver for dynamic content (Douban lazy-loads sections)
 * plus staggered re-parses (800ms, 2500ms, 6000ms) as safety net.
 */
export default function App() {
  const { records } = useRecordCache()

  const { items: screeningItems, refresh: refreshScreening } = useDoubanSection(parseScreeningItems, records)
  const { items: billboardItems, refresh: refreshBillboard } = useDoubanSection(parseBillboardItems, records)
  const { items: hotMovies, refresh: refreshHotMovies } = useDoubanSection(() => parseHotSection('.recent-hot-movie'), records)
  const { items: hotTv, refresh: refreshHotTv } = useDoubanSection(() => parseHotSection('.recent-hot-tv'), records)

  // Stable ref holding all section refresh functions so the observer
  // callback and staggered timeouts always have access to the latest fns.
  const refreshFnsRef = useRef<(() => void)[]>([])

  useEffect(() => {
    refreshFnsRef.current = [refreshScreening, refreshBillboard, refreshHotMovies, refreshHotTv]
  }, [refreshScreening, refreshBillboard, refreshHotMovies, refreshHotTv])

  function refreshFromDom() {
    refreshFnsRef.current.forEach(fn => fn())
  }

  // Staggered re-parses: content injected by Douban's JS may not be
  // ready when the observer first fires (Swiper lazy load, XHR race).
  // Each retry is a no-op if the observer already caught it.
  useEffect(() => {
    const s1 = setTimeout(() => refreshFromDom(), 800)
    const s2 = setTimeout(() => refreshFromDom(), 2500)
    const s3 = setTimeout(() => refreshFromDom(), 6000)
    return () => {
      clearTimeout(s1)
      clearTimeout(s2)
      clearTimeout(s3)
    }
  }, [])

  useHomepageObserver(refreshFromDom, {
    containerSelectors: '#screening, .recent-hot, #billboard, #reviews, .review',
  })

  return (
    <UmmPageLayout type="movie">
      <div className="umm-top-panel">
        <UmmMediaRow title="正在热映" items={screeningItems} records={records} grid />

        {billboardItems.length > 0 ? (
          <UmmScrollRow title="一周口碑榜">
            {billboardItems.map(item => {
              const rec = records.get(item.subjectId)
              const status = rec?.status ?? 0
              const rating = rec?.rating ?? 0
              return (
                <UmmBillboardCard
                  key={`${item.subjectId}-${status}-${rating}`}
                  order={item.order}
                  title={item.title}
                  href={item.href}
                  badgeStatus={status}
                  badgeRating={rating}
                />
              )
            })}
          </UmmScrollRow>
        ) : null}

        <UmmMediaRow title="最近热门电影" items={hotMovies} records={records} grid />
        <UmmMediaRow title="最近热门电视剧" items={hotTv} records={records} showEpisodes grid />

        <UmmReviewsSection records={records} />
      </div>
    </UmmPageLayout>
  )
}
