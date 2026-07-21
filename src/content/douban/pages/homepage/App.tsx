import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'

export default function App() {
  return (
    <UmmPageLayout type="movie">
      <div className="umm-page-root">
        <div className="umm-section">
          <h2 className="umm-section-title">豆瓣电影</h2>
          <p className="umm-text-muted">正在热映、即将上映、排行榜...</p>
        </div>
      </div>
    </UmmPageLayout>
  )
}
