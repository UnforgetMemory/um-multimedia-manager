import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'
import { UmmImageWrapper } from '@/content/douban/components/UmmImageWrapper'
import { ASPECT_RATIO } from '@/content/douban/shared/constants'
import type { ArtistsOverviewData } from './types'

interface PageProps {
  data: ArtistsOverviewData
}

export default function App({ data }: PageProps) {
  return (
    <UmmPageLayout type="music">
      <div className="umm-page-root">
        <h2 className="umm-section-title">音乐人概览</h2>
        {data.genreNav.length > 0 && (
          <div className="umm-nav-bar">
            {data.genreNav.map((g: any, i: number) => (
              <a key={i} href={g.href} className="umm-nav-item">{g.name}</a>
            ))}
          </div>
        )}
        {data.recommendedArtists.length > 0 && (
          <div className="umm-section">
            <h3 className="umm-subsection-title">推荐音乐人</h3>
            <div className="umm-grid">
              {data.recommendedArtists.map((artist: any, i: number) => (
                <a key={i} href={artist.href} target="_blank" rel="noopener noreferrer" className="umm-card umm-card--sm">
                  <UmmImageWrapper src={artist.avatarUrl} alt={artist.name} aspectRatio={ASPECT_RATIO.SQUARE} />
                  <span className="umm-card-title">{artist.name}</span>
                </a>
              ))}
            </div>
          </div>
        )}
        {data.events.length > 0 && (
          <div className="umm-section">
            <h3 className="umm-subsection-title">演出活动</h3>
            <div className="umm-grid">
              {data.events.map((event: any, i: number) => (
                <a key={i} href={event.href} target="_blank" rel="noopener noreferrer" className="umm-card">
                  <UmmImageWrapper src={event.imageUrl} alt={event.title} aspectRatio={ASPECT_RATIO.WIDE} />
                  <span className="umm-card-title">{event.title}</span>
                  {event.description && <span className="umm-card-desc">{event.description}</span>}
                </a>
              ))}
            </div>
          </div>
        )}
        {data.videos.length > 0 && (
          <div className="umm-section">
            <h3 className="umm-subsection-title">视频</h3>
            <div className="umm-grid">
              {data.videos.map((video: any, i: number) => (
                <a key={i} href={video.href} target="_blank" rel="noopener noreferrer" className="umm-card">
                  <UmmImageWrapper src={video.imageUrl} alt={video.title} aspectRatio={ASPECT_RATIO.WIDE} />
                  <span className="umm-card-title">{video.title}</span>
                  {video.artistName && <span className="umm-card-desc">{video.artistName}</span>}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </UmmPageLayout>
  )
}
