import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'
import { UmmImageWrapper } from '@/content/douban/components/UmmImageWrapper'
import { UmmRating } from '@/content/douban/components/UmmRating'
import { ASPECT_RATIO } from '@/content/douban/shared/constants'


interface PageProps {
  exploreData: any
  recordMap: Map<string, unknown>
}

export default function App({ exploreData }: PageProps) {
  return (
    <UmmPageLayout type="game">
      <div className="umm-page-root">
        <h2 className="umm-section-title">{exploreData.title || '游戏探索'}</h2>
        <div className="umm-grid">
          {exploreData.items.map((item: any, i: number) => (
            <a key={i} href={item.link} target="_blank" rel="noopener noreferrer" className="umm-card">
              <UmmImageWrapper src={item.cover} alt={item.title} aspectRatio={ASPECT_RATIO.POSTER} />
              <span className="umm-card-title">{item.title}</span>
              {item.rating && <UmmRating score={item.rating} />}
              {item.tags && <div className="umm-tags">{item.tags.map((t: any, ti: number) => <span key={ti} className="umm-tag">{t}</span>)}</div>}
            </a>
          ))}
        </div>
      </div>
    </UmmPageLayout>
  )
}
