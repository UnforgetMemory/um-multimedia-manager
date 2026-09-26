/** A single author entry on a Douban user's followed authors page */
export interface AuthorItem {
  name: string
  photoUrl: string
  roles: string
  works: { title: string; url: string }[]
  url: string
}

/** Aggregated data extracted from a Douban user's followed authors page */
export interface BookAuthorsData {
  userId: string
  displayName: string
  avatarUrl: string
  navLinks: { label: string; url: string }[]
  total: number
  items: AuthorItem[]
  pageLinks: { label: string; url: string; current: boolean }[]
  prevPageUrl: string
  nextPageUrl: string
}
