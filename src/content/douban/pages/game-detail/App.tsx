import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'
import { UmmImageWrapper } from '@/content/douban/components/UmmImageWrapper'
import { UmmRating } from '@/content/douban/components/UmmRating'
import { ASPECT_RATIO } from '@/content/douban/shared/constants'
import { EmptyState } from '@/shared/EmptyState'
interface GameDetailData { title: string; cover: string; rating: string; platform: string; desc: string; screenshots: string[]; developer: string; publisher: string; releaseDate: string }

interface PageProps { data: GameDetailData }

export default function App({ data }: PageProps) {
  return (
    <UmmPageLayout type="game">
      <div className="umm-page-root">
        <div className="umm-detail-header">
          <UmmImageWrapper src={data.cover} alt={data.title} aspectRatio={ASPECT_RATIO.POSTER} />
          <div>
            <h1 className="umm-section-title">{data.title}</h1>
            {data.rating && <UmmRating score={data.rating} />}
            {data.platform && <p className="umm-text-muted">{data.platform}</p>}
            {data.developer && <p className="umm-text-muted">开发: {data.developer}</p>}
            {data.publisher && <p className="umm-text-muted">发行: {data.publisher}</p>}
            {data.releaseDate && <p className="umm-text-muted">发行日期: {data.releaseDate}</p>}
          </div>
        </div>

        {data.desc && <div className="umm-section"><h2 className="umm-subsection-title">简介</h2><p className="umm-text">{data.desc}</p></div>}

        {data.screenshots?.length > 0 && (
          <div className="umm-section">
            <h2 className="umm-subsection-title">截图</h2>
            <div className="umm-grid">
              {data.screenshots.map((src: any, i: number) => (
                <UmmImageWrapper key={i} src={src} alt={`截图${i + 1}`} aspectRatio={ASPECT_RATIO.POSTER} />
              ))}
            </div>
          </div>
        )}

        {!data.cover && !data.desc && <EmptyState title="暂无数据" />}
      </div>
    </UmmPageLayout>
  )
}
