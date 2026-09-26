export interface AlbumVersionItem {
  id: number
  title: string
  subTitle: string
  coverUrl: string
  url: string
  abstract: string
  ratingValue: number
  ratingCount: number
  ratingStars: number
}

export interface AlbumsPageData {
  albumTitle: string
  versions: AlbumVersionItem[]
}
