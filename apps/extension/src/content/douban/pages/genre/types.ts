/** Genre artist item from artist grid */
export interface GenreArtistItem {
  name: string
  href: string
  avatarUrl: string
  likes: number
}

/** Genre navigation link */
export interface GenreNavItem {
  name: string
  href: string
  isCurrent: boolean
}

/** Full genre page data */
export interface GenrePageData {
  genreName: string
  artists: GenreArtistItem[]
  navLinks: GenreNavItem[]
  pagination: {
    currentPage: number
    totalPages: number
    prevUrl: string
    nextUrl: string
  }
}