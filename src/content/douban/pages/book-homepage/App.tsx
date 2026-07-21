import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'

export default function App() {
  return (
    <UmmPageLayout type="book">
      <div className="umm-page-root">
        <div className="umm-section">
          <h2 className="umm-section-title">豆瓣读书</h2>
          <p className="umm-text-muted">新书速递、排行榜、分类浏览...</p>
        </div>
      </div>
    </UmmPageLayout>
  )
}
