export interface DoulistItem {
  id: string
  title: string
  coverUrl: string
  itemCount: number
  updateTime: string
  followerCount: number
  url: string
}

export interface DoulistsPageData {
  userId: string
  displayName: string
  avatarUrl: string
  navLinks: { label: string; url: string }[]
  createdCount: number
  createdUrl: string
  collectedCount: number
  collectedUrl: string
  activeTab: 'created' | 'collected'
  items: DoulistItem[]
  pageLinks: { label: string; url: string; current: boolean }[]
  prevPageUrl: string
  nextPageUrl: string
}
