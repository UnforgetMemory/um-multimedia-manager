import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'
import { UmmImageWrapper } from '@/content/douban/components/UmmImageWrapper'
import { ASPECT_RATIO } from '@/content/douban/shared/constants'
import type { GenrePageData } from './types'

interface PageProps {
  data: GenrePageData
}

export default function App({ data }: PageProps) {
  return (
    <UmmPageLayout type="movie">
      <div className="umm-page-root">
        <h2 className="umm-section-title">{data.genreName}</h2>
        {data.navLinks.length > 0 && (
          <div className="umm-nav-bar">
            {data.navLinks.map((link: any, i: number) =>
              link.isCurrent ? (
                <span key={i} className="umm-nav-item umm-nav-item--active">{link.name}</span>
              ) : (
                <a key={i} href={link.href} className="umm-nav-item">{link.name}</a>
              )
            )}
          </div>
        )}
        <div className="umm-grid">
          {data.artists.map((artist: any, i: number) => (
            <a key={i} href={artist.href} target="_blank" rel="noopener noreferrer" className="umm-card umm-card--sm">
              <UmmImageWrapper src={artist.avatarUrl} alt={artist.name} aspectRatio={ASPECT_RATIO.SQUARE} />
              <span className="umm-card-title">{artist.name}</span>
              {artist.likes > 0 && <span className="umm-card-subtitle">{artist.likes} 人喜欢</span>}
            </a>
          ))}
        </div>
        {data.pagination && (
          <div className="umm-pagination">
            {data.pagination.prevUrl && <a href={data.pagination.prevUrl} className="umm-pagination-prev">上一页</a>}
            <span className="umm-pagination-info">{data.pagination.currentPage} / {data.pagination.totalPages}</span>
            {data.pagination.nextUrl && <a href={data.pagination.nextUrl} className="umm-pagination-next">下一页</a>}
          </div>
        )}
      </div>
    </UmmPageLayout>
  )
}
