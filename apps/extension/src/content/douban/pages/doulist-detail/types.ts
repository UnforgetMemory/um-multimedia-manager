/**
 * Douban doulist detail page types
 *
 * The doulist detail page (www.douban.com/doulist/{id}/) shows a list of
 * media items (movies, music, books) collected in a specific doulist,
 * along with the creator's metadata and pagination.
 */

/** A single item within a doulist */
export interface DoulistDetailItem {
  /** Douban subject ID (from data-id on the "添加到豆列" button) */
  subjectId: string
  /** Item title (e.g., "寒战 寒戰") */
  title: string
  /** Poster image URL */
  posterUrl: string
  /** URL to the subject detail page */
  subjectUrl: string
  /** Rating score (0-10 scale, 0 if unrated) */
  rating: number
  /** Number of ratings (0 if unrated) */
  ratingCount: number
  /** Director names joined by " / " */
  director: string
  /** Actor names joined by " / " */
  actors: string
  /** Genre names joined by " / " */
  genres: string
  /** Country/region */
  region: string
  /** Year string */
  year: string
  /** Source label (e.g., "来自：豆瓣电影") */
  source: string
  /** Category code from data-cate attribute (1002=movie, 1003=music, etc.) */
  category: string
  /** Whether the item has playable video links */
  hasVideo: boolean
}

/** A filter tab (全部 / 我没看过的 / 我看过的) */
export interface DoulistFilter {
  label: string
  count: number
  url: string
  active: boolean
}

/** Paginator info */
export interface DoulistPaginator {
  currentPage: number
  totalPages: number
  prevUrl: string
  nextUrl: string
  pages: { label: string; url: string; current: boolean }[]
}

/** Top-level page data extracted from the doulist detail page DOM */
export interface DoulistDetailPageData {
  /** Doulist ID */
  id: string
  /** Doulist title (e.g., "片单｜犯罪") */
  title: string
  /** Cover image URL */
  coverUrl: string
  /** Creator info */
  creator: {
    id: string
    name: string
    location: string
    avatarUrl: string
  }
  /** Creation time string */
  createdTime: string
  /** Last update time string */
  updatedTime: string
  /** Optional description from the info BD section */
  description: string
  /** Total number of items */
  totalCount: number
  /** Filter tabs */
  filters: DoulistFilter[]
  /** Items on the current page */
  items: DoulistDetailItem[]
  /** Paginator info */
  paginator: DoulistPaginator
}
