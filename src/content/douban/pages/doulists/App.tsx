import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'
import type { DoulistsPageData } from './types'

interface PageProps {
  data: DoulistsPageData
}

export default function App({ data }: PageProps) {
  return (
    <UmmPageLayout type="movie">
      <div className="umm-page-root">
        <div className="umm-profile-header">
          {data.avatarUrl && <img src={data.avatarUrl} alt={data.displayName} className="umm-avatar" />}
          <div>
            <h2 className="umm-section-title">{data.displayName} 的豆列</h2>
            <div className="umm-nav-bar">
              <a href={data.createdUrl} className={`umm-nav-item${data.activeTab === 'created' ? ' umm-nav-item--active' : ''}`}>
                创建 ({data.createdCount})
              </a>
              <a href={data.collectedUrl} className={`umm-nav-item${data.activeTab === 'collected' ? ' umm-nav-item--active' : ''}`}>
                关注 ({data.collectedCount})
              </a>
            </div>
          </div>
        </div>
        {data.xbarCategories.length > 0 && (
          <div className="umm-nav-bar">
            {data.xbarCategories.map((cat: any, i: number) => {
              const cls = cat.current ? 'umm-nav-item umm-nav-item--active' : 'umm-nav-item'
              return cat.current
                ? <span key={i} className={cls}>{cat.label} ({cat.count})</span>
                : <a key={i} href={cat.url} className={cls}>{cat.label} ({cat.count})</a>
            })}
          </div>
        )}
        <div className="umm-list">
          {data.items.map((item) => (
            <a key={item.id} href={item.url} target="_blank" rel="noopener noreferrer" className="umm-list-item">
              <div className="umm-list-item-info">
                <span className="umm-list-item-title">{item.title}</span>
                <div className="umm-list-item-meta">
                  <span>{item.itemCount} 项</span>
                  {item.followerCount > 0 && <span> · {item.followerCount} 人关注</span>}
                  {item.updateTime && <span> · {item.updateTime}</span>}
                </div>
                {item.intro && <span className="umm-list-item-desc">{item.intro}</span>}
              </div>
            </a>
          ))}
        </div>
        {data.pageLinks.length > 0 && (
          <div className="umm-pagination">
            {data.prevPageUrl && <a href={data.prevPageUrl} className="umm-pagination-prev">上一页</a>}
            {data.pageLinks.map((pl: any, i: number) =>
              pl.current
                ? <span key={i} className="umm-pagination-current">{pl.label}</span>
                : <a key={i} href={pl.url} className="umm-pagination-page">{pl.label}</a>
            )}
            {data.nextPageUrl && <a href={data.nextPageUrl} className="umm-pagination-next">下一页</a>}
          </div>
        )}
      </div>
    </UmmPageLayout>
  )
}
