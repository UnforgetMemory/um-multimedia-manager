/** A single book entry on a Douban user's collection page */
export interface BookCollectItem {
  subjectId: string
  title: string
  posterUrl: string
  date: string
  comment: string
  url: string
  pubInfo: string
}

/** Aggregated data extracted from a Douban user book collection (collect/wish/doing) page */
export interface BookCollectData {
  subType: 'collect' | 'wish' | 'doing'
  userId: string
  displayName: string
  avatarUrl: string
  navLinks: { label: string; url: string }[]
  sortOptions: { label: string; url: string; active: boolean }[]
  currentPage: string
  total: number
  mode: 'grid' | 'list'
  items: BookCollectItem[]
  pageLinks: { label: string; url: string; current: boolean }[]
  prevPageUrl: string
  nextPageUrl: string
}
