import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'
import { UmmImageWrapper } from '@/content/douban/components/UmmImageWrapper'
import { UmmStatusBadge } from '@/content/douban/components/UmmStatusBadge'
import { ASPECT_RATIO } from '@/content/douban/shared/constants'
import { EmptyState } from '@/shared/EmptyState'

interface PageProps { data: any }

export default function App({ data }: PageProps) {
  return (
    <UmmPageLayout type="game">
      <div className="umm-page-root">
        <h2 className="umm-section-title">{data.title || '游戏收藏'}</h2>
        {data.items?.length > 0 ? (
          <div className="umm-grid">
            {data.items.map((item: any, i: number) => (
              <a key={i} href={item.link} target="_blank" rel="noopener noreferrer" className="umm-card">
                <UmmImageWrapper src={item.cover} alt={item.title} aspectRatio={ASPECT_RATIO.POSTER} />
                <span className="umm-card-title">{item.title}</span>
                <UmmStatusBadge status={item.status || 0} variant="small" type="game" />
                {item.platform && <span className="umm-card-subtitle">{item.platform}</span>}
              </a>
            ))}
          </div>
        ) : <EmptyState />}
      </div>
    </UmmPageLayout>
  )
}
