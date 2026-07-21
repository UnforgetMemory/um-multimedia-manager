import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'

export default function App() {
  return (
    <UmmPageLayout type="music">
      <div className="umm-page-root">
        <div className="umm-section">
          <h2 className="umm-section-title">豆瓣音乐</h2>
          <p className="umm-text-muted">新碟榜、音乐人、分类浏览...</p>
        </div>
      </div>
    </UmmPageLayout>
  )
}
