export interface MusicProfileStat {
  label: string
  count: number
  url: string
}

export interface MusicProfileAlbumItem {
  title: string
  posterUrl: string
  url: string
}

export interface MusicProfileMusician {
  name: string
  url: string
}

export interface MusicProfileSection {
  label: string
  count: number
  url: string
  items: MusicProfileAlbumItem[]
}

export interface MusicProfileDoulist {
  title: string
  url: string
  followers: number
}

export interface MusicProfileData {
  userId: string
  displayName: string
  avatarUrl: string
  stats: MusicProfileStat[]
  albumSection: MusicProfileSection | null
  musicians: MusicProfileMusician[]
  doulists: MusicProfileDoulist[]
}
