/**
 * Book profile page data types.
 *
 * Parsed from book.douban.com/people/{uid}/ native DOM structure.
 */

/** A single book card in the 读过/想读 grid */
export interface BookItem {
  subjectId: string
  title: string
  coverUrl: string
  href: string
}

/** A collected author card */
export interface AuthorItem {
  authorId: string
  name: string
  avatarUrl: string
  href: string
}

/** A recent-reading entry in the timeline */
export interface RecentReadingItem {
  date: string
  action: 'read' | 'wish' | 'review'
  subjectId: string
  title: string
  href: string
  rating: number
  quote: string
}

/** A book review snippet */
export interface ReviewItem {
  id: string
  title: string
  url: string
  subjectTitle: string
  subjectUrl: string
  coverUrl: string
  rating: number
  excerpt: string
}

/** A book doulist entry */
export interface DoulistItem {
  title: string
  url: string
  recommendCount: number
}

/** A navigation tab item from #db-usr-profile .nav-list */
export interface NavItem {
  label: string
  url: string
  active: boolean
}

/** User basic info from sidebar */
export interface UserInfo {
  userId: string
  displayName: string
  avatarUrl: string
  joinDate: string
  readCount: number
  reviewCount: number
}

/** Full book profile page data */
export interface BookProfileData {
  user: UserInfo
  navItems: NavItem[]
  readBooks: BookItem[]
  readTotal: number
  wishBooks: BookItem[]
  wishTotal: number
  authors: AuthorItem[]
  recentReading: RecentReadingItem[]
  reviews: ReviewItem[]
  doulists: DoulistItem[]
}
