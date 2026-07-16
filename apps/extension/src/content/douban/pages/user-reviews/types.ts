export interface UserReviewItem {
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

export interface UserReviewsData {
  userId: string
  displayName: string
  avatarUrl: string
  navLinks: { label: string; url: string }[]
  total: number
  items: UserReviewItem[]
  pageLinks: { label: string; url: string; current: boolean }[]
  prevPageUrl: string
  nextPageUrl: string
}
