/** A single music album entry on a Douban user's music collection page */
export interface MusicCollectItem {
  subjectId: string
  title: string
  subtitle: string
  posterUrl: string
  intro: string
  rating: string   // '0' | '1' | '2' | '3'
  date: string
  url: string
}

/** Aggregated data extracted from a Douban user music collection (collect/wish/do) page */
export interface MusicCollectData {
  subType: 'collect' | 'wish' | 'doing'
  userId: string
  displayName: string
  avatarUrl: string
  navLinks: { label: string; url: string }[]
  sortOptions: { label: string; url: string; active: boolean }[]
  currentPage: string
  total: number
  mode: 'grid' | 'list'
  items: MusicCollectItem[]
  pageLinks: { label: string; url: string; current: boolean }[]
  prevPageUrl: string
  nextPageUrl: string
}
