import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'
import { UmmImageWrapper } from '@/content/douban/components/UmmImageWrapper'
import { ASPECT_RATIO } from '@/content/douban/shared/constants'
import { EmptyState } from '@/shared/EmptyState'

interface PageProps { data: any }

export default function App({ data }: PageProps) {
  return (
    <UmmPageLayout type="book">
      <div className="umm-page-root">
        <div className="umm-profile-header">
          {data.avatarUrl && <img src={data.avatarUrl} alt={data.displayName} className="umm-avatar umm-avatar--lg" />}
          <h1 className="umm-section-title">{data.displayName || '读书主页'}</h1>
        </div>

        {data.readBooks?.length > 0 && (
          <div className="umm-section">
            <h2 className="umm-subsection-title">读过 ({data.readBooks.length})</h2>
            <div className="umm-grid">
              {data.readBooks.slice(0, 12).map((b: any, i: number) => (
                <a key={i} href={b.href} target="_blank" rel="noopener noreferrer" className="umm-card">
                  <UmmImageWrapper src={b.coverUrl} alt={b.title} aspectRatio={ASPECT_RATIO.POSTER} />
                  <span className="umm-card-title">{b.title}</span>
                </a>
              ))}
            </div>
          </div>
        )}

        {data.wishBooks?.length > 0 && (
          <div className="umm-section">
            <h2 className="umm-subsection-title">想读 ({data.wishBooks.length})</h2>
            <div className="umm-grid">
              {data.wishBooks.slice(0, 12).map((b: any, i: number) => (
                <a key={i} href={b.href} target="_blank" rel="noopener noreferrer" className="umm-card">
                  <UmmImageWrapper src={b.coverUrl} alt={b.title} aspectRatio={ASPECT_RATIO.POSTER} />
                  <span className="umm-card-title">{b.title}</span>
                </a>
              ))}
            </div>
          </div>
        )}

        {data.reviews?.length > 0 && (
          <div className="umm-section">
            <h2 className="umm-subsection-title">书评</h2>
            {data.reviews.map((r: any, i: number) => (
              <a key={i} href={r.url} target="_blank" rel="noopener noreferrer" className="umm-list-item">
                <span className="umm-list-item-title">{r.title}</span>
                <span className="umm-list-item-desc">{r.subjectTitle}</span>
              </a>
            ))}
          </div>
        )}

        {data.authors?.length > 0 && (
          <div className="umm-section">
            <h2 className="umm-subsection-title">关注作者</h2>
            <div className="umm-grid">
              {data.authors.map((a: any, i: number) => (
                <a key={i} href={a.href} target="_blank" rel="noopener noreferrer" className="umm-card umm-card--sm">
                  <img src={a.avatarUrl} alt={a.name} className="umm-avatar" />
                  <span className="umm-card-title">{a.name}</span>
                </a>
              ))}
            </div>
          </div>
        )}

        {!data.readBooks?.length && !data.wishBooks?.length && (
          <EmptyState title="暂无数据" />
        )}
      </div>
    </UmmPageLayout>
  )
}
