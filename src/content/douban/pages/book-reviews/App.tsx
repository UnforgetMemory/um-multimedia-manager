import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'
import { UmmRating } from '@/content/douban/components/UmmRating'
import { EmptyState } from '@/shared/EmptyState'

interface PageProps { data: any }

export default function App({ data }: PageProps) {
  return (
    <UmmPageLayout type="book">
      <div className="umm-page-root">
        <h2 className="umm-section-title">{data.title || '书评'}</h2>
        {data.items?.length > 0 ? (
          <div className="umm-list">
            {data.items.map((item: any, i: number) => (
              <a key={i} href={item.link} target="_blank" rel="noopener noreferrer" className="umm-list-item">
                <div className="umm-list-item-info">
                  <span className="umm-list-item-title">{item.title}</span>
                  <span className="umm-list-item-desc">{item.author}</span>
                  {item.rating > 0 && <UmmRating score={String(item.rating)} />}
                  {item.summary && <p className="umm-text-sm">{item.summary}</p>}
                </div>
              </a>
            ))}
          </div>
        ) : <EmptyState />}
      </div>
    </UmmPageLayout>
  )
}
