/**
 * Type definitions for the game explore/search page.
 */

export interface GameExploreItem {
  id: number
  title: string
  url: string
  rating: string
  star: string
  cover: string
  genres: string[]
  platforms: string[]
  review: { content: string; author: string } | null
  nRatings: number
}

export interface GameExploreFilterOption {
  text: string
  value: string
  unique: boolean
  checked: boolean
}

export interface GameExploreFilterGroup {
  name: string
  text: string
  options: GameExploreFilterOption[]
}

export interface GameExplorePagination {
  nextPage: string | null
  hasMore: boolean
}

export interface GameExploreData {
  items: GameExploreItem[]
  pagination: GameExplorePagination
  filters: GameExploreFilterGroup[]
  searcher: { keyword: string }
  sorter: { value: string }
}
