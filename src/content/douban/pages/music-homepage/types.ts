/** Banner carousel item on music homepage */
export interface BannerItem {
  imageUrl: string
  href: string
  alt: string
}

/** Popular artist item from .popular-artists section */
export interface PopularArtistItem {
  name: string
  genre: string
  href: string
  photoUrl: string
  isNew: boolean
}

/** New album item from [data-react-component="NewAlbums"] */
export interface NewAlbumItem {
  subjectId: string
  title: string
  artist: string
  posterUrl: string
  href: string
  rate: string
}

/** Genre tag from .tag-block table */
export interface GenreTag {
  name: string
  href: string
}
