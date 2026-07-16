/**
 * Book homepage data types.
 *
 * Parsed from book.douban.com/ native DOM structure.
 */

/** A book item in the 新书速递 (New Books Express) carousel */
export interface BookExpressItem {
  subjectId: string
  title: string
  author: string
  coverUrl: string
  posterUrl: string
  href: string
  year?: string
  publisher?: string
  rate: string
}

/** A book in the 每月热门图书榜 (Monthly Popular Books) ranking */
export interface PopularBookItem {
  rank: number
  subjectId: string
  title: string
  author: string
  rating: string
  coverUrl: string
  href: string
  tags: string[]
  trend: 'up' | 'down' | 'new' | 'same'
  prevRank?: number
}

/** A reading activity in the 读书活动 carousel */
export interface BookActivityItem {
  title: string
  href: string
  coverUrl: string
  label: string
  date: string
}
