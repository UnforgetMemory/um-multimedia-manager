export type DoulistCategory = 'movie' | 'music' | 'book' | 'thing_place' | 'other'

export function parseCategory(cls: string): DoulistCategory {
  if (cls.includes('doulist-movie')) return 'movie'
  if (cls.includes('doulist-music')) return 'music'
  if (cls.includes('doulist-book')) return 'book'
  if (cls.includes('doulist-thing_place')) return 'thing_place'
  return 'other'
}

export const CATEGORY_LABELS: Record<DoulistCategory, string> = {
  movie: '片单',
  music: '音乐',
  book: '书单',
  thing_place: '地点',
  other: '豆列',
}

export interface DoulistItem {
  id: string
  title: string
  coverUrl: string
  itemCount: number
  /** Items the user has already watched (from "看过 X/Y部") */
  watchedCount: number
  updateTime: string
  followerCount: number
  url: string
  /** Optional intro/description text */
  intro: string
  /** Category derived from the doulist-category-icon class */
  category: DoulistCategory
}

export interface DoulistsPageData {
  userId: string
  displayName: string
  avatarUrl: string
  navLinks: { label: string; url: string }[]
  createdCount: number
  createdUrl: string
  collectedCount: number
  collectedUrl: string
  activeTab: 'created' | 'collected'
  items: DoulistItem[]
  pageLinks: { label: string; url: string; current: boolean }[]
  prevPageUrl: string
  nextPageUrl: string
}
