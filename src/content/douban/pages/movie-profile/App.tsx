import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'
import { UmmImageWrapper } from '@/content/douban/components/UmmImageWrapper'
import { ASPECT_RATIO } from '@/content/douban/shared/constants'
import { EmptyState } from '@/shared/EmptyState'


interface PageProps { data: any }

export default function App({ data }: PageProps) {
  return (
    <UmmPageLayout type="movie">
      <div className="umm-page-root">
        <div className="umm-profile-header">
          <img src={data.avatarUrl} alt={data.displayName} className="umm-avatar umm-avatar--lg" />
          <div>
            <h1 className="umm-section-title">{data.displayName}</h1>
            {data.stats && (
              <div className="umm-stats-row">
                {data.stats.map((s: any, i: number) => (
                  <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" className="umm-stat-chip">
                    <span className="umm-stat-chip-count">{s.count}</span>
                    <span className="umm-stat-chip-label">{s.label}</span>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>

        {data.sections?.map((sec: any, si: number) => (
          <div key={si} className="umm-section">
            <h2 className="umm-subsection-title">{sec.label} ({sec.count})</h2>
            {sec.items.length > 0 ? (
              <div className="umm-grid">
                {sec.items.slice(0, 12).map((item: any, ii: number) => (
                  <a key={ii} href={item.url} target="_blank" rel="noopener noreferrer" className="umm-card">
                    <UmmImageWrapper src={item.posterUrl} alt={item.title} aspectRatio={ASPECT_RATIO.POSTER} />
                    <span className="umm-card-title">{item.title}</span>
                  </a>
                ))}
              </div>
            ) : <EmptyState title="暂无" />}
            {sec.count > 12 && (
              <a href={sec.url} target="_blank" rel="noopener noreferrer" className="umm-more-link">查看全部 {sec.count} 部</a>
            )}
          </div>
        ))}

        {data.doulists?.length > 0 && (
          <div className="umm-section">
            <h2 className="umm-subsection-title">我的豆列</h2>
            {data.doulists.map((d: any, i: number) => (
              <a key={i} href={d.url} target="_blank" rel="noopener noreferrer" className="umm-list-item">
                <span className="umm-list-item-title">{d.title}</span>
                <span className="umm-list-item-desc">{d.followers} 关注</span>
              </a>
            ))}
          </div>
        )}

        {!data.sections?.length && !data.doulists?.length && (
          <EmptyState title="暂无数据" />
        )}
      </div>
    </UmmPageLayout>
  )
}
