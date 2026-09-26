export interface CelebrityItem {
  name: string
  photoUrl: string
  roles: string
  works: { title: string; url: string }[]
  url: string
}

export interface UserCelebritiesData {
  userId: string
  displayName: string
  avatarUrl: string
  navLinks: { label: string; url: string }[]
  total: number
  items: CelebrityItem[]
  pageLinks: { label: string; url: string; current: boolean }[]
  prevPageUrl: string
  nextPageUrl: string
}
