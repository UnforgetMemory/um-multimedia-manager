/** Aggregated data extracted from a Douban book review detail page */
export interface BookReviewDetailData {
  id: string
  title: string
  reviewUrl: string
  authorName: string
  authorId: string
  authorUrl: string
  avatarUrl: string
  subjectTitle: string
  subjectUrl: string
  posterUrl: string
  rating: number
  paragraphs: string[]
  date: string
  location: string
  readCount: number
  source: string
  usefulCount: number
  uselessCount: number
  author: string
  publisher: string
  pages: string
}
