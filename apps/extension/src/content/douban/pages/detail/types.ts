/**
 * Detail page data type definitions for Douban.
 */

export interface RatingBar {
  label: string
  pct: string
}

export interface MetaRow {
  label: string
  html: string
}

export interface CelebItem {
  name: string
  role: string
  avatar: string
  link: string
}

export interface AwardItem {
  festival: string
  category: string
  nominee: string
  nomineeLink: string
  isNomination: boolean
}

export interface PhotoItem {
  src: string
  link: string
  isVideo: boolean
}

export interface RecItem {
  title: string
  poster: string
  rating: string
  link: string
  subjectId: string
  recStatus: number    // 0=none 1=wish 2=done 3=doing
  personalRating?: number
}

export interface ShortComment {
  user: string
  userLink: string
  avatar: string
  rating: number
  content: string
  time: string
  votes: number
}

export interface BlockquoteItem {
  text: string
  user: string
  source: string
  votes: number
}

export interface EditionItem {
  title: string
  link: string
  rating: string
  count: string
}

export interface DetailData {
  identity: import('@/types').UrlIdentity
  title: string
  originalTitle: string
  year: string
  posterSrc: string
  posterAlt: string
  posterLink: string
  ratingNum: string
  ratingPeople: string
  bigstarNum: string
  ratingBars: RatingBar[]
  betterThan: string[]
  metaRows: MetaRow[]
  synopsisHeading: string
  synopsisHtml: string
  celebHeading: string
  celebItems: CelebItem[]
  celebCount: string
  awardItems: AwardItem[]
  photoItems: PhotoItem[]
  photoCount: string
  trailerCount: string
  recItems: RecItem[]
  shortComments: ShortComment[]
  rankNo: string
  rankText: string
  rankHref: string
  isMusic: boolean
  isBook: boolean
  subtitle: string
  authorBioHtml: string
  tocItems: string[]
  blockquoteItems: BlockquoteItem[]
  editionItems: EditionItem[]
  record: import('@/types').StoreRecord | null
  trackItems: string[]
}
