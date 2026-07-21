import React, { useState, useEffect, useRef } from 'react'
import { normalizeSearchQuery } from '@/utils/search-normalizer'

/**
 * UmmDynamicIsland — unified search & navigation bar for all Douban pages.
 *
 * Renders a floating action island with nav buttons for movie/music/book/game
 * categories and a search input with normalized query handling.
 *
 * @prop newTab — Open links in new tab (default true). Search page uses false.
 * @prop type   — Search category 'movie' | 'music' | 'book' | 'game' (default 'movie').
 * @prop initialQuery — Pre-fill search input text.
 */

export interface UmmDynamicIslandProps {
  /** Open links in new tab (default: true). Search page uses false */
  newTab?: boolean
  /** Search category type */
  type?: 'movie' | 'music' | 'book' | 'game'
  /** Pre-fill search input */
  initialQuery?: string
}

const catMap: Record<string, string> = { movie: '1002', music: '1003', book: '1001', game: '3114' }
const labelMap: Record<string, string> = { movie: '电影', music: '音乐', book: '图书', game: '游戏' }

export function UmmDynamicIsland({
  newTab = true,
  type = 'movie',
  initialQuery = '',
}: UmmDynamicIslandProps): React.ReactElement {
  const [searchQuery, setSearchQuery] = useState(initialQuery)
  const [isSearching, setIsSearching] = useState(false)
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isNormalizingRef = useRef(false)

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    }
  }, [])

  function open(url: string): void {
    if (newTab) {
      window.open(url, '_blank', 'noopener,noreferrer')
    } else {
      location.href = url
    }
  }

  /** Debounced real-time normalization */
  function handleInput(value: string): void {
    setSearchQuery(value)
    if (isNormalizingRef.current) return
    isNormalizingRef.current = true
    const normalized = normalizeSearchQuery(value)
    if (normalized !== value) {
      setSearchQuery(normalized)
    }
    setTimeout(() => { isNormalizingRef.current = false }, 0)
  }

  function doSearch(): void {
    if (isSearching) return
    const normalized = normalizeSearchQuery(searchQuery)

    // Game search: always navigates, even with empty query (shows all games)
    if (type === 'game') {
      setIsSearching(true)
      const params = new URLSearchParams(location.search)
      params.set('q', normalized)
      location.href = `https://www.douban.com/game/explore?${params.toString()}`
      searchTimeoutRef.current = setTimeout(() => { setIsSearching(false) }, 800)
      return
    }

    if (!normalized) return
    setIsSearching(true)
    const cat = catMap[type]
    const url = `https://search.douban.com/${type}/subject_search?search_text=${encodeURIComponent(normalized)}&cat=${cat}`
    open(url)
    searchTimeoutRef.current = setTimeout(() => { setIsSearching(false) }, 800)
  }

  function handleSearch(e: React.FormEvent): void {
    e.preventDefault()
    doSearch()
  }

  const placeholder = type === 'game'
    ? '搜索游戏'
    : type === 'music'
    ? '搜索音乐、歌手、专辑'
    : type === 'book'
    ? '搜索图书、作者、出版社'
    : '搜索电影、电视剧、影人'

  return (
    <form className="umm-island" onSubmit={handleSearch}>
      <nav className="umm-island-nav" aria-label="豆瓣导航">
        <button
          type="button"
          className={`umm-island-nav-link${type === 'movie' ? ' umm-island-nav-link--active' : ''}`}
          aria-label="电影"
          onClick={() => open('https://movie.douban.com/')}
        >
          <svg className="umm-island-nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
          </svg>
          <span className="umm-island-nav-label">电影</span>
        </button>
        <button
          type="button"
          className={`umm-island-nav-link${type === 'music' ? ' umm-island-nav-link--active' : ''}`}
          aria-label="音乐"
          onClick={() => open('https://music.douban.com/')}
        >
          <svg className="umm-island-nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" />
          </svg>
          <span className="umm-island-nav-label">音乐</span>
        </button>
        <button
          type="button"
          className={`umm-island-nav-link${type === 'book' ? ' umm-island-nav-link--active' : ''}`}
          aria-label="图书"
          onClick={() => open('https://book.douban.com/')}
        >
          <svg className="umm-island-nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            <path d="M8 7h8M8 11h6" />
          </svg>
          <span className="umm-island-nav-label">图书</span>
        </button>
        <button
          type="button"
          className={`umm-island-nav-link${type === 'game' ? ' umm-island-nav-link--active' : ''}`}
          aria-label="游戏"
          onClick={() => open('https://www.douban.com/game/explore')}
        >
          <svg className="umm-island-nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 12h4m-2-2v4m4-2a2 2 0 1 0 4 0 2 2 0 0 0-4 0Z" />
            <rect x="2" y="6" width="20" height="12" rx="2" />
          </svg>
          <span className="umm-island-nav-label">游戏</span>
        </button>
        <div className="umm-island-divider" />
        <button
          type="button"
          className="umm-island-nav-link"
          aria-label="我的"
          onClick={() => open('https://www.douban.com/mine')}
        >
          <svg className="umm-island-nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <span className="umm-island-nav-label">我的</span>
        </button>
      </nav>
      <div className="umm-island-divider" />
      <div className="umm-island-search">
        <input
          value={searchQuery}
          name="search_text"
          type="search"
          className="umm-island-input"
          placeholder={placeholder}
          autoComplete="off"
          aria-label={`搜索豆瓣${labelMap[type]}`}
          onChange={(e) => handleInput(e.target.value)}
        />
        <button
          type="submit"
          className={`umm-island-submit${isSearching ? ' umm-island-submit--loading' : ''}`}
          aria-label="搜索"
          disabled={isSearching}
        >
          {isSearching ? (
            <svg className="umm-island-spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 2a10 10 0 0 1 10 10" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          )}
        </button>
      </div>
    </form>
  )
}
