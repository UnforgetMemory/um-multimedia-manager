import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'
import { UmmImageWrapper } from '@/content/douban/components/UmmImageWrapper'
import { UmmRating } from '@/content/douban/components/UmmRating'
import { ASPECT_RATIO } from '@/content/douban/shared/constants'
import type { DoulistDetailPageData } from './types'

interface PageProps {
  data: DoulistDetailPageData
  recordMap: Map<string, unknown>
}

export default function App({ data }: PageProps) {
  return (
    <UmmPageLayout type="movie">
      <div className="umm-page-root">
        <h2 className="umm-section-title">{data.title}</h2>
        {data.creator && typeof data.creator === 'string' ? <p className="umm-text-muted">by {data.creator}</p> : data.creator && typeof data.creator === 'object' ? <p className="umm-text-muted">by {(data.creator as any).name}</p> : null}
        {data.description && <p className="umm-text">{data.description}</p>}
        <div className="umm-list">
          {data.items.map((item: any, i: number) => (
            <a key={i} href={item.url} target="_blank" rel="noopener noreferrer" className="umm-list-item">
              <UmmImageWrapper src={item.coverUrl} alt={item.title} aspectRatio={ASPECT_RATIO.POSTER} />
              <div className="umm-list-item-info">
                <span className="umm-list-item-title">{item.title}</span>
                {item.rating && <UmmRating score={item.rating} />}
                {item.director && <span className="umm-list-item-desc">{item.director}</span>}
              </div>
            </a>
          ))}
        </div>
      </div>
    </UmmPageLayout>
  )
}
