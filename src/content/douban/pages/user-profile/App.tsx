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
            {data.bio && <p className="umm-text">{data.bio}</p>}
          </div>
        </div>

        {data.sections?.map((sec: any, si: number) => (
          <div key={si} className="umm-section">
            <h2 className="umm-subsection-title">{sec.title}</h2>
            {sec.statLinks?.map((link: any, li: number) => (
              <a key={li} href={link.url} target="_blank" rel="noopener noreferrer" className="umm-link">{link.text}</a>
            ))}
            {sec.subsections?.map((sub: any, sui: number) => (
              <div key={sui} className="umm-grid">
                {sub.items.slice(0, 6).map((item: any, ii: number) => (
                  <a key={ii} href={item.url} target="_blank" rel="noopener noreferrer" className="umm-card">
                    <UmmImageWrapper src={item.posterUrl} alt={item.title} aspectRatio={ASPECT_RATIO.POSTER} />
                    <span className="umm-card-title">{item.title}</span>
                  </a>
                ))}
              </div>
            ))}
          </div>
        ))}

        {data.reviews?.length > 0 && (
          <div className="umm-section">
            <h2 className="umm-subsection-title">评论</h2>
            {data.reviews.slice(0, 5).map((r: any, i: number) => (
              <div key={i} className="umm-list-item">
                <span className="umm-list-item-title">{r.title}</span>
                <span className="umm-list-item-desc">{r.subjectTitle}</span>
                {r.excerpt && <p className="umm-text-sm">{r.excerpt}</p>}
              </div>
            ))}
          </div>
        )}

        {!data.sections?.length && !data.reviews?.length && <EmptyState />}
      </div>
    </UmmPageLayout>
  )
}
