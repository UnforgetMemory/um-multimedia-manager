import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'
import { UmmImageWrapper } from '@/content/douban/components/UmmImageWrapper'
import { UmmRating } from '@/content/douban/components/UmmRating'
import { ASPECT_RATIO } from '@/content/douban/shared/constants'
import { EmptyState } from '@/shared/EmptyState'
import type { UserMediaPageData } from './types'

interface PageProps { data: UserMediaPageData }

export default function App({ data }: PageProps) {
  return (
    <UmmPageLayout type="movie">
      <div className="umm-page-root">
        <h2 className="umm-section-title">{data.userId} 的收藏</h2>
        {data.items?.length > 0 ? (
          <div className="umm-grid">
            {data.items.map((item, i) => (
              <a key={i} href={item.url} target="_blank" rel="noopener noreferrer" className="umm-card">
                <UmmImageWrapper src={item.posterUrl} alt={item.title} aspectRatio={ASPECT_RATIO.POSTER} />
                <span className="umm-card-title">{item.title}</span>
                {item.rating && <UmmRating score={item.rating} />}
                {item.comment && <span className="umm-card-subtitle">{item.comment}</span>}
              </a>
            ))}
          </div>
        ) : <EmptyState />}
      </div>
    </UmmPageLayout>
  )
}
