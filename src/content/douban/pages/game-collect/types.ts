export interface GameItem {
  subjectId: string
  title: string
  posterUrl: string
  rating: string
  date: string
  comment: string
  url: string
  platforms: string
}

export interface GameCollectData {
  subType: 'collect' | 'wish' | 'do'
  userId: string
  displayName: string
  avatarUrl: string
  navLinks: { label: string; url: string }[]
  currentPage: string
  total: number
  items: GameItem[]
  pageLinks: { label: string; url: string; current: boolean }[]
  prevPageUrl: string
  nextPageUrl: string
}
