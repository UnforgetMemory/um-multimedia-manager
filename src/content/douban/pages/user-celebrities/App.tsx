import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'
import { EmptyState } from '@/shared/EmptyState'
import type { UserCelebritiesData } from './types'

interface PageProps { data: UserCelebritiesData }

export default function App({ data }: PageProps) {
  return (
    <UmmPageLayout type="movie">
      <div className="umm-page-root">
        <h2 className="umm-section-title">{data.displayName} 关注的人</h2>
        {data.items?.length > 0 ? (
          <div className="umm-grid">
            {data.items.map((item, i) => (
              <a key={i} href={item.url} target="_blank" rel="noopener noreferrer" className="umm-card umm-card--sm">
                <img src={item.photoUrl} alt={item.name} className="umm-avatar" />
                <span className="umm-card-title">{item.name}</span>
                {item.roles && <span className="umm-card-subtitle">{item.roles}</span>}
              </a>
            ))}
          </div>
        ) : <EmptyState />}
      </div>
    </UmmPageLayout>
  )
}
