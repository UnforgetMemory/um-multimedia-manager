import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'
import { UmmImageWrapper } from '@/content/douban/components/UmmImageWrapper'
import { UmmRating } from '@/content/douban/components/UmmRating'
import { ASPECT_RATIO } from '@/content/douban/shared/constants'
import { EmptyState } from '@/shared/EmptyState'
import type { UserReviewsData } from './types'

interface PageProps { data: UserReviewsData }

export default function App({ data }: PageProps) {
  return (
    <UmmPageLayout type="movie">
      <div className="umm-page-root">
        <h2 className="umm-section-title">{data.displayName} 的评论</h2>
        {data.items?.length > 0 ? (
          <div className="umm-list">
            {data.items.map((item, i) => (
              <a key={i} href={item.reviewUrl} target="_blank" rel="noopener noreferrer" className="umm-list-item">
                <UmmImageWrapper src={item.posterUrl} alt={item.subjectTitle} aspectRatio={ASPECT_RATIO.POSTER} />
                <div className="umm-list-item-info">
                  <span className="umm-list-item-title">{item.title}</span>
                  <span className="umm-list-item-desc">{item.subjectTitle}</span>
                  {item.rating > 0 && <UmmRating score={String(item.rating)} />}
                  {item.content && <p className="umm-text-sm">{item.content}</p>}
                </div>
              </a>
            ))}
          </div>
        ) : <EmptyState />}
      </div>
    </UmmPageLayout>
  )
}
