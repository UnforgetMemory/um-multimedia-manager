/**
 * Douban book series page types
 *
 * The series page (book.douban.com/series/{id}/) shows a list of books
 * belonging to a publisher's series, with metadata and ratings.
 */

/** A single book entry within a series */
export interface SeriesItem {
  /** Douban subject ID extracted from the book URL */
  subjectId: string
  /** Book title */
  title: string
  /** Cover image URL (small thumbnail from DOM) */
  coverUrl: string
  /** URL to the book's subject detail page */
  subjectUrl: string
  /** Publication info — author / publisher / date / price */
  pubInfo: string
  /** Rating score (0-10 scale, 0 if unrated) */
  rating: number
  /** Number of ratings (0 if unrated) */
  ratingCount: number
  /** Book description blurb */
  description: string
}

/** Sort option in the series page header */
export interface SeriesSortOption {
  label: string
  url: string
  active: boolean
}

/** Paginator info for multi-page series */
export interface SeriesPaginator {
  currentPage: number
  totalPages: number
  prevUrl: string
  nextUrl: string
  pages: { label: string; url: string; current: boolean }[]
}

/** Top-level page data extracted from the series page DOM */
export interface SeriesPageData {
  /** Series ID from URL */
  id: string
  /** Series title (h1) */
  title: string
  /** Publisher name */
  publisher: string
  /** Number of volumes */
  volumes: number
  /** Series description */
  description: string
  /** Total number of books in the series */
  totalCount: number
  /** Sort options */
  sortOptions: SeriesSortOption[]
  /** Books on the current page */
  items: SeriesItem[]
  /** Paginator info */
  paginator: SeriesPaginator
}
