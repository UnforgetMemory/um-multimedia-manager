import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'
import { UmmImageWrapper } from '@/content/douban/components/UmmImageWrapper'
import { ASPECT_RATIO } from '@/content/douban/shared/constants'
import type { PhotosPageData } from './photos-data'

interface PageProps {
  data: PhotosPageData
}

export default function App({ data }: PageProps) {
  const label = data.photoType === 'S' ? '剧照' : data.photoType === 'W' ? '壁纸' : '海报'
  return (
    <UmmPageLayout type="movie">
      <div className="umm-page-root">
        <h2 className="umm-section-title">{data.title || label}</h2>
        {data.filterTabs.length > 0 && (
          <div className="umm-nav-bar">
            {data.filterTabs.map((tab: any, i: number) =>
              tab.isCurrent ? (
                <span key={i} className="umm-nav-item umm-nav-item--active">{tab.label}</span>
              ) : (
                <a key={i} href={tab.url} className="umm-nav-item">{tab.label}</a>
              )
            )}
          </div>
        )}
        {data.subFilters.length > 0 && (
          <div className="umm-nav-bar umm-nav-bar--sub">
            {data.subFilters.map((tab: any, i: number) =>
              tab.isCurrent ? (
                <span key={i} className="umm-nav-item umm-nav-item--active">{tab.label}</span>
              ) : (
                <a key={i} href={tab.url} className="umm-nav-item">{tab.label}</a>
              )
            )}
          </div>
        )}
        <div className="umm-grid">
          {data.photos.map((photo: any, i: number) => (
            <a key={photo.id || i} href={photo.link} target="_blank" rel="noopener noreferrer" className="umm-card">
              <UmmImageWrapper src={photo.src} alt={photo.caption} aspectRatio={ASPECT_RATIO.POSTER} />
              {photo.caption && <span className="umm-card-title">{photo.caption}</span>}
            </a>
          ))}
        </div>
        {data.pageInfo && data.pageInfo.totalPages > 1 && (
          <div className="umm-pagination">
            {data.pageInfo.prevUrl && <a href={data.pageInfo.prevUrl} className="umm-pagination-prev">上一页</a>}
            <span className="umm-pagination-info">{data.pageInfo.currentPage} / {data.pageInfo.totalPages}</span>
            {data.pageInfo.nextUrl && <a href={data.pageInfo.nextUrl} className="umm-pagination-next">下一页</a>}
          </div>
        )}
      </div>
    </UmmPageLayout>
  )
}
