export interface UserProfileSectionItem {
  title: string
  url: string
  posterUrl: string
}

export interface UserProfileSectionSubsection {
  label: string
  items: UserProfileSectionItem[]
}

export interface UserProfileSection {
  id: string
  title: string
  statLinks: { text: string; url: string }[]
  subsections: UserProfileSectionSubsection[]
}

export interface UserProfileData {
  userId: string
  displayName: string
  avatarUrl: string
  location: string
  bio: string
  signature: string
  joinDate: string
  movieStats: { watching: number; wish: number; collect: number; doulist: number }
  musicStats: { collect: number }
  bookStats: { wish: number; collect: number; doulist: number }
  gameStats: { playing: number; played: number }
  sections: UserProfileSection[]
}
