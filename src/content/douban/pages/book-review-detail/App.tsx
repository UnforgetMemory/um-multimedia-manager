import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'
import { UmmImageWrapper } from '@/content/douban/components/UmmImageWrapper'
import { UmmRating } from '@/content/douban/components/UmmRating'
import { ASPECT_RATIO } from '@/content/douban/shared/constants'
import type { BookReviewDetailData } from './types'

interface PageProps { data: BookReviewDetailData }

export default function App({ data }: PageProps) {
  return (
    <UmmPageLayout type="book">
      <div className="umm-page-root">
        <div className="umm-detail-header">
          <UmmImageWrapper src={data.posterUrl} alt={data.subjectTitle} aspectRatio={ASPECT_RATIO.POSTER} />
          <div>
            <h1 className="umm-section-title">{data.title}</h1>
            <a href={data.subjectUrl} target="_blank" rel="noopener noreferrer" className="umm-link">{data.subjectTitle}</a>
            {data.rating > 0 && <UmmRating score={String(data.rating)} />}
            <p className="umm-text-muted">{data.authorName} · {data.date}</p>
          </div>
        </div>
        {data.paragraphs?.length > 0 && (
          <div className="umm-section">
            <h2 className="umm-subsection-title">正文</h2>
            {data.paragraphs.map((p, i) => (<p key={i} className="umm-text">{p}</p>))}
          </div>
        )}
      </div>
    </UmmPageLayout>
  )
}
