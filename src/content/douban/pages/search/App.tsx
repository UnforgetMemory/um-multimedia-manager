import { useState } from 'react'
import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'
import { UmmImageWrapper } from '@/content/douban/components/UmmImageWrapper'
import { UmmRating } from '@/content/douban/components/UmmRating'
import { ASPECT_RATIO } from '@/content/douban/shared/constants'
import type { DoubanSearchData } from './types'

interface PageProps {
  searchData: DoubanSearchData
  recordMap: Map<string, any>
  type: string
}

const TABS = [
  { key: 'movie', label: '电影' },
  { key: 'music', label: '音乐' },
  { key: 'book', label: '图书' },
]

export default function App({ searchData, type }: PageProps) {
  const [filterText, setFilterText] = useState('')
  const [activeTab, setActiveTab] = useState(type)
  const filtered = searchData.items.filter((item) => {
    if (activeTab !== type && !item.tpl_name?.includes(activeTab)) return false
    return !filterText || item.title.toLowerCase().includes(filterText.toLowerCase())
  })

  return (
    <UmmPageLayout type={type === 'music' ? 'music' : type === 'book' ? 'book' : 'movie'} initialQuery={searchData.text}>
      <div className="umm-search-root">
        {/* Category tabs */}
        <div className="umm-search-tabs">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              className={'umm-search-tab' + (activeTab === tab.key ? ' umm-search-tab--active' : '')}
              onClick={() => setActiveTab(tab.key)}
            >{tab.label}</button>
          ))}
        </div>

        {/* Search filter */}
        <div className="umm-search-filter">
          <input
            type="text"
            className="umm-search-input"
            placeholder="筛选结果..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
          />
        </div>

        {searchData.total > 0 && (
          <p className="umm-search-summary">找到 {searchData.total} 个结果</p>
        )}

        {filtered.length === 0 ? (
          <div className="umm-empty-state">
            <p className="umm-empty-text">没有匹配的结果</p>
          </div>
        ) : (
          <div className="umm-search-results">
            {filtered.map((item) => (
              <a key={item.id} href={item.url} target="_blank" rel="noopener noreferrer" className="umm-search-item">
                <div className="umm-search-item-cover">
                  <UmmImageWrapper src={item.cover_url} alt={item.title} aspectRatio={ASPECT_RATIO.POSTER} />
                </div>
                <div className="umm-search-item-info">
                  <h3 className="umm-search-item-title">{item.title}</h3>
                  {item.rating.value > 0 && <UmmRating score={String(item.rating.value)} count={item.rating.count} />}
                  {item.abstract && <p className="umm-search-item-abstract">{item.abstract}</p>}
                  {item.labels.length > 0 && (
                    <div className="umm-search-item-labels">
                      {item.labels.map((l: any, i: number) => <span key={i} className="umm-search-item-label">{l.text}</span>)}
                    </div>
                  )}
                </div>
              </a>
            ))}
          </div>
        )}

        {searchData.total > searchData.count && (
          <div className="umm-search-pagination">
            <div className="umm-search-page-buttons">
              <button
                className="umm-search-page-btn"
                disabled={searchData.start === 0}
                onClick={() => window.location.assign(window.location.href.replace(/start=\d+/, 'start=' + Math.max(0, searchData.start - searchData.count)))}
              >上一页</button>
              <span className="umm-search-page-info">
                {Math.floor(searchData.start / searchData.count) + 1}/{Math.ceil(searchData.total / searchData.count)}
              </span>
              <button
                className="umm-search-page-btn"
                disabled={searchData.start + searchData.count >= searchData.total}
                onClick={() => window.location.assign(window.location.href.replace(/start=\d+/, 'start=' + (searchData.start + searchData.count)))}
              >下一页</button>
            </div>
          </div>
        )}
      </div>
    </UmmPageLayout>
  )
}
