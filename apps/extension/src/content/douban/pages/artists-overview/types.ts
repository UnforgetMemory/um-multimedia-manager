/** Recommended artist item from .guess-artists carousel */
export interface RecommendedArtist {
  name: string
  href: string
  avatarUrl: string
}

/** Event item from .artists-events */
export interface EventItem {
  title: string
  href: string
  imageUrl: string
  description: string
}

/** Video item from .artists-video */
export interface VideoItem {
  artistName: string
  title: string
  href: string
  imageUrl: string
}

/** Genre navigation link */
export interface GenreNavItem {
  name: string
  href: string
}

/** Full artists overview page data */
export interface ArtistsOverviewData {
  recommendedArtists: RecommendedArtist[]
  events: EventItem[]
  videos: VideoItem[]
  genreNav: GenreNavItem[]
}