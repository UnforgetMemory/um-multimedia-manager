import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'
import { UmmImageWrapper } from '@/content/douban/components/UmmImageWrapper'
import { UmmRating } from '@/content/douban/components/UmmRating'
import { ASPECT_RATIO } from '@/content/douban/shared/constants'
import { EmptyState } from '@/shared/EmptyState'
import type { PersonagePageData } from './personage-data'

interface PageProps { data: PersonagePageData }

export default function App({ data }: PageProps) {
  return (
    <UmmPageLayout type="movie">
      <div className="umm-page-root">
        <div className="umm-detail-header">
          <UmmImageWrapper src={data.avatar} alt={data.name} aspectRatio={ASPECT_RATIO.SQUARE} />
          <div>
            <h1 className="umm-section-title">{data.name}</h1>
            {data.properties?.map((p: any, i: number) => (
              <p key={i} className="umm-text-muted">{p.label}: {p.value}</p>
            ))}
          </div>
        </div>

        {data.biography && (
          <div className="umm-section"><h2 className="umm-subsection-title">简介</h2><p className="umm-text">{data.biography}</p></div>
        )}

        {data.recentWorks?.length > 0 && (
          <div className="umm-section">
            <h2 className="umm-subsection-title">近期作品</h2>
            <div className="umm-grid">
              {data.recentWorks.map((w: any, i: number) => (
                <a key={i} href={w.url} target="_blank" rel="noopener noreferrer" className="umm-card">
                  <UmmImageWrapper src={w.poster} alt={w.title} aspectRatio={ASPECT_RATIO.POSTER} />
                  <span className="umm-card-title">{w.title}</span>
                  {w.rating && <UmmRating score={w.rating} />}
                </a>
              ))}
            </div>
          </div>
        )}

        {data.popularWorks?.length > 0 && (
          <div className="umm-section">
            <h2 className="umm-subsection-title">最受欢迎</h2>
            <div className="umm-grid">
              {data.popularWorks.map((w: any, i: number) => (
                <a key={i} href={w.url} target="_blank" rel="noopener noreferrer" className="umm-card">
                  <UmmImageWrapper src={w.poster} alt={w.title} aspectRatio={ASPECT_RATIO.POSTER} />
                  <span className="umm-card-title">{w.title}</span>
                  {w.rating && <UmmRating score={w.rating} />}
                </a>
              ))}
            </div>
          </div>
        )}

        {data.partners?.length > 0 && (
          <div className="umm-section">
            <h2 className="umm-subsection-title">合作影人</h2>
            <div className="umm-grid">
              {data.partners.map((p: any, i: number) => (
                <a key={i} href={p.url} target="_blank" rel="noopener noreferrer" className="umm-card umm-card--sm">
                  <img src={p.avatar} alt={p.name} className="umm-avatar" />
                  <span className="umm-card-title">{p.name}</span>
                  <span className="umm-card-subtitle">{p.workCount} 次合作</span>
                </a>
              ))}
            </div>
          </div>
        )}

        {!data.recentWorks?.length && !data.popularWorks?.length && (
          <EmptyState title="暂无作品数据" />
        )}
      </div>
    </UmmPageLayout>
  )
}
