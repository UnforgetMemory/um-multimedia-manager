/**
 * UmmSearchFilter — search result filter bar with ALL/movie/TV toggle and result count.
 */
export type FilterType = 'all' | 'movie' | 'tv'

interface UmmSearchFilterProps {
  filterType: FilterType
  onFilterChange: (type: FilterType) => void
  total: number
  filtered: number
  query: string
}

export default function UmmSearchFilter({ filterType, onFilterChange, total, filtered, query }: UmmSearchFilterProps) {
  return (
    <div className="umm-search-hd">
      <div className="umm-search-hd-left">
        <h1 className="umm-search-title">搜索结果</h1>
        <div className="umm-search-type-group">
          <button
            className={'umm-type-btn' + (filterType === 'all' ? ' umm-type-btn--active' : '')}
            onClick={() => onFilterChange('all')}
          >全部</button>
          <button
            className={'umm-type-btn' + (filterType === 'movie' ? ' umm-type-btn--active' : '')}
            onClick={() => onFilterChange('movie')}
          >电影</button>
          <button
            className={'umm-type-btn' + (filterType === 'tv' ? ' umm-type-btn--active' : '')}
            onClick={() => onFilterChange('tv')}
          >剧集</button>
        </div>
      </div>
      <span className="umm-search-hd-meta">
        &ldquo;{query}&rdquo; · <strong>{filtered}</strong>{filtered !== total ? <span>/{total}</span> : null} 个结果
      </span>
    </div>
  )
}
