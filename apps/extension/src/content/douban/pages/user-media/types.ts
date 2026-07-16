export interface UserMediaNavLink {
  label: string
  url: string
}

export interface UserMediaSortOption {
  label: string
  url: string
  active: boolean
}

export interface UserMediaFilterGroup {
  label: string
  current: string
  items: { label: string; url: string }[]
}

export interface UserMediaItem {
  subjectId: string
  title: string
  posterUrl: string
  rating: string
  date: string
  comment: string
  url: string
}

export interface UserMediaPageData {
  subType: 'collect' | 'wish' | 'doing'
  userId: string
  displayName: string
  avatarUrl: string
  navLinks: UserMediaNavLink[]
  sortOptions: UserMediaSortOption[]
  filterGroups: UserMediaFilterGroup[]
  currentPage: string   // e.g. "1-5"
  total: number
  mode: 'grid' | 'list'
  items: UserMediaItem[]
  pageLinks: { label: string; url: string; current: boolean }[]
  prevPageUrl: string
  nextPageUrl: string
}
