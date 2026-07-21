import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'
import { EmptyState } from '@/shared/EmptyState'

interface PageProps { data: any }

export default function App({ data }: PageProps) {
  return (
    <UmmPageLayout type="movie">
      <div className="umm-page-root">
        <h2 className="umm-section-title">{data.title || '预告片'}</h2>
        {data.description && <p className="umm-text-muted">{data.description}</p>}
        {data.items?.length > 0 ? (
          <div className="umm-grid">
            {data.items.map((item: any, i: number) => (
              <a key={i} href={item.link} target="_blank" rel="noopener noreferrer" className="umm-card">
                <img src={item.thumbnail} alt={item.title} className="umm-card-cover" />
                <span className="umm-card-title">{item.title}</span>
                {item.duration && <span className="umm-card-subtitle">{item.duration}</span>}
              </a>
            ))}
          </div>
        ) : <EmptyState />}
      </div>
    </UmmPageLayout>
  )
}
