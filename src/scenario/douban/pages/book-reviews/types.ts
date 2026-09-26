/** A single book review on a user's book review list page */
export interface BookReviewItem {
  id: string
  title: string
  reviewUrl: string
  posterUrl: string
  subjectTitle: string
  subjectUrl: string
  rating: number
  content: string
  authorName: string
  usefulCount: number
  uselessCount: number
  readCount: number
  source: string
}

/** Aggregated data extracted from a Douban user book review list page */
export interface BookReviewsData {
  userId: string
  displayName: string
  avatarUrl: string
  navLinks: { label: string; url: string }[]
  total: number
  items: BookReviewItem[]
  pageLinks: { label: string; url: string; current: boolean }[]
  prevPageUrl: string
  nextPageUrl: string
}
