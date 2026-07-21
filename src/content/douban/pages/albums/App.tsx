import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'
import { UmmImageWrapper } from '@/content/douban/components/UmmImageWrapper'
import { UmmRating } from '@/content/douban/components/UmmRating'
import { ASPECT_RATIO } from '@/content/douban/shared/constants'
import type { AlbumsPageData } from './types'

interface PageProps {
  data: AlbumsPageData
  recordMap: Map<string, unknown>
}

export default function App({ data }: PageProps) {
  return (
    <UmmPageLayout type="music">
      <div className="umm-page-root">
        <h2 className="umm-section-title">{data.albumTitle}</h2>
        <div className="umm-grid">
          {data.versions.map((item: any, i: number) => (
            <a key={i} href={item.url} target="_blank" rel="noopener noreferrer" className="umm-card">
              <UmmImageWrapper src={item.coverUrl} alt={item.title} aspectRatio={ASPECT_RATIO.SQUARE} />
              <span className="umm-card-title">{item.title}</span>
              {item.subTitle && <span className="umm-card-subtitle">{item.subTitle}</span>}
              {item.ratingValue > 0 && <UmmRating score={String(item.ratingValue)} count={item.ratingCount} />}
            </a>
          ))}
        </div>
      </div>
    </UmmPageLayout>
  )
}
