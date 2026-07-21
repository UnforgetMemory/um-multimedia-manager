import { useState, useMemo } from 'react'
import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'
import UmmSearchCard from './components/UmmSearchCard'
import UmmSearchFilter, { type FilterType } from './components/UmmSearchFilter'
import type { DoubanSearchData, SearchItem } from './types'

interface PageProps {
  searchData: DoubanSearchData
  recordMap: Map<string, any>
  type: string
}

/** Map page type to Douban cat query parameter */
function getCat(type: string): string {
  return type === 'book' ? '1001' : type === 'music' ? '1003' : '1002'
}

/** TV detection: check if item has a "剧集" label from Douban's own metadata */
function isTvItem(item: SearchItem): boolean {
  return item.labels?.some((l: { text: string }) => l.text === '剧集') ?? false
}

/** Build a full Douban search URL for a given page number */
function buildPageUrl(page: number, type: string, query: string, perPage: number, cat: string): string {
  const q = encodeURIComponent(query || '')
  const start = page > 1 ? (page - 1) * perPage : 0
  return `https://search.douban.com/${type}/subject_search?search_text=${q}&cat=${cat}${start > 0 ? `&start=${start}` : ''}`
}

export default function App({ searchData, recordMap, type }: PageProps) {
  const [filterType, setFilterType] = useState<FilterType>('all')
  const [jumpToPage, setJumpToPage] = useState('')

  const cat = getCat(type)
  const perPage = searchData?.count || 15
  const totalPages = searchData ? Math.ceil(searchData.total / perPage) : 0
  const currentPage = searchData ? Math.floor((searchData.start || 0) / perPage) + 1 : 1
  const queryText = searchData?.text || ''

  /** Filter items by movie/TV type when applicable */
  const filteredItems = useMemo(() => {
    if (!searchData?.items || filterType === 'all') return searchData?.items ?? []
    const wantTv = filterType === 'tv'
    return searchData.items.filter((i: SearchItem) => isTvItem(i) === wantTv)
  }, [searchData?.items, filterType])

  /** Page number window — show at most 9 pages around the current page */
  const pageWindow = useMemo(() => {
    const tp = totalPages
    const cp = currentPage
    const maxShow = 9
    if (tp <= maxShow) return Array.from({ length: tp }, (_, i) => i + 1)
    let start = Math.max(1, cp - 4)
    let end = start + maxShow - 1
    if (end > tp) {
      end = tp
      start = Math.max(1, end - maxShow + 1)
    }
    return Array.from({ length: end - start + 1 }, (_, i) => start + i)
  }, [totalPages, currentPage])

  function navigate(url: string): void {
    window.location.href = url
  }

  function handlePageJump(): void {
    const p = Math.round(Number(jumpToPage))
    if (!Number.isFinite(p)) {
      setJumpToPage('')
      return
    }
    const clamped = Math.max(1, Math.min(p, totalPages))
    setJumpToPage('')
    if (clamped === currentPage) return
    navigate(buildPageUrl(clamped, type, queryText, perPage, cat))
  }

  function clampJumpInput(): void {
    if (!jumpToPage) return
    const p = Math.round(Number(jumpToPage))
    if (!Number.isFinite(p)) { setJumpToPage(''); return }
    setJumpToPage(String(Math.max(1, Math.min(p, totalPages))))
  }

  return (
    <UmmPageLayout type={type === 'music' ? 'music' : type === 'book' ? 'book' : 'movie'} initialQuery={queryText}>
      <div className="umm-search-page">
        {/* Header with filter (movie only) or simple info (music/book) */}
        {searchData && type === 'movie' ? (
          <UmmSearchFilter
            filterType={filterType}
            onFilterChange={setFilterType}
            total={searchData.total}
            filtered={filteredItems.length}
            query={queryText}
          />
        ) : searchData ? (
          <div className="umm-search-hd">
            <div className="umm-search-hd-left">
              <h1 className="umm-search-title">
                {type === 'music' ? '音乐搜索' : type === 'book' ? '图书搜索' : '搜索结果'}
              </h1>
            </div>
            <span className="umm-search-hd-meta">
              &ldquo;{queryText}&rdquo; · {searchData.total} 个结果
            </span>
          </div>
        ) : null}

        {/* Results grid */}
        {filteredItems.length > 0 ? (
          <div className="umm-search-grid">
            {filteredItems.map((item: SearchItem) => (
              <UmmSearchCard
                key={item.id}
                item={item}
                records={recordMap || new Map()}
                type={type}
              />
            ))}
          </div>
        ) : (
          <div className="umm-search-empty">
            <p>无法获取搜索结果数据。</p>
          </div>
        )}

        {/* Full pagination */}
        {totalPages > 1 && (
          <div className="umm-paginator">
            {/* First page */}
            {currentPage > 1 && (
              <a
                href={buildPageUrl(1, type, queryText, perPage, cat)}
                onClick={(e) => { e.preventDefault(); navigate(buildPageUrl(1, type, queryText, perPage, cat)) }}
                className="umm-page-link"
              >首页</a>
            )}

            {/* Previous page */}
            {currentPage > 1 && (
              <a
                href={buildPageUrl(currentPage - 1, type, queryText, perPage, cat)}
                onClick={(e) => { e.preventDefault(); navigate(buildPageUrl(currentPage - 1, type, queryText, perPage, cat)) }}
                className="umm-page-link"
              >‹ 上一页</a>
            )}

            {/* Page number window */}
            {pageWindow.map((p) => (
              p === currentPage ? (
                <span key={p} className="umm-page-link umm-page-link--active">{p}</span>
              ) : (
                <a
                  key={p}
                  href={buildPageUrl(p, type, queryText, perPage, cat)}
                  onClick={(e) => { e.preventDefault(); navigate(buildPageUrl(p, type, queryText, perPage, cat)) }}
                  className="umm-page-link"
                >{p}</a>
              )
            ))}

            {/* Next page */}
            {currentPage < totalPages && (
              <a
                href={buildPageUrl(currentPage + 1, type, queryText, perPage, cat)}
                onClick={(e) => { e.preventDefault(); navigate(buildPageUrl(currentPage + 1, type, queryText, perPage, cat)) }}
                className="umm-page-link"
              >下一页 ›</a>
            )}

            {/* Last page */}
            {currentPage < totalPages && (
              <a
                href={buildPageUrl(totalPages, type, queryText, perPage, cat)}
                onClick={(e) => { e.preventDefault(); navigate(buildPageUrl(totalPages, type, queryText, perPage, cat)) }}
                className="umm-page-link"
              >末页</a>
            )}

            {/* Jump-to-page */}
            <span className="umm-page-jump">
              <input
                type="number"
                className="umm-page-input"
                placeholder={String(currentPage)}
                min={1}
                max={totalPages}
                title={'1～' + totalPages}
                value={jumpToPage}
                onChange={(e) => setJumpToPage(e.target.value)}
                onKeyUp={(e) => { if (e.key === 'Enter') handlePageJump() }}
                onBlur={() => clampJumpInput()}
              />
              <button className="umm-page-go" onClick={handlePageJump}>跳转</button>
            </span>
          </div>
        )}
      </div>
    </UmmPageLayout>
  )
}
