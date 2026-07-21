import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'
import { EmptyState } from '@/shared/EmptyState'

interface PageProps { data: any }

export default function App({ data }: PageProps) {
  return (
    <UmmPageLayout type="book">
      <div className="umm-page-root">
        <h2 className="umm-section-title">{data.title || '作者'}</h2>
        {data.authors?.length > 0 ? (
          <div className="umm-list">
            {data.authors.map((a: any, i: number) => (
              <a key={i} href={a.link} target="_blank" rel="noopener noreferrer" className="umm-list-item">
                <img src={a.avatar} alt={a.name} className="umm-avatar" />
                <div className="umm-list-item-info">
                  <span className="umm-list-item-title">{a.name}</span>
                  {a.works && <span className="umm-list-item-desc">{a.works}</span>}
                </div>
              </a>
            ))}
          </div>
        ) : <EmptyState />}
      </div>
    </UmmPageLayout>
  )
}
