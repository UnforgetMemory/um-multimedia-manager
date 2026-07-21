import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'
import { UmmImageWrapper } from '@/content/douban/components/UmmImageWrapper'
import { UmmRating } from '@/content/douban/components/UmmRating'
import { ASPECT_RATIO } from '@/content/douban/shared/constants'
import type { ReviewDetailData } from './types'

interface PageProps { data: ReviewDetailData }

export default function App({ data }: PageProps) {
  return (
    <UmmPageLayout type="movie">
      <div className="umm-page-root">
        {/* Header: subject info */}
        <div className="umm-detail-header">
          <UmmImageWrapper src={data.posterUrl} alt={data.subjectTitle} aspectRatio={ASPECT_RATIO.POSTER} />
          <div>
            <h1 className="umm-section-title">{data.title}</h1>
            <a href={data.subjectUrl} target="_blank" rel="noopener noreferrer" className="umm-link">
              {data.subjectTitle}
            </a>
            {data.rating > 0 && <UmmRating score={String(data.rating)} />}
            <p className="umm-text-muted">{data.authorName} · {data.date}</p>
            {data.location && <p className="umm-text-muted">{data.location}</p>}
          </div>
        </div>

        {/* Meta info */}
        <div className="umm-section">
          {data.director && <p className="umm-text-muted">导演: {data.director}</p>}
          {data.cast && <p className="umm-text-muted">主演: {data.cast}</p>}
          {data.genre && <p className="umm-text-muted">类型: {data.genre}</p>}
          {data.region && <p className="umm-text-muted">地区: {data.region}</p>}
          {data.releaseDate && <p className="umm-text-muted">上映: {data.releaseDate}</p>}
        </div>

        {/* Stats */}
        <div className="umm-section">
          <div className="umm-stats-row">
            <span className="umm-stat-chip">有用 {data.usefulCount}</span>
            <span className="umm-stat-chip">无用 {data.uselessCount}</span>
            {data.readCount > 0 && <span className="umm-stat-chip">阅读 {data.readCount}</span>}
          </div>
        </div>

        {/* Content */}
        {data.paragraphs?.length > 0 && (
          <div className="umm-section">
            <h2 className="umm-subsection-title">正文</h2>
            {data.paragraphs.map((p, i) => (
              <p key={i} className="umm-text">{p}</p>
            ))}
          </div>
        )}
      </div>
    </UmmPageLayout>
  )
}
