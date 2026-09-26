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

export interface ReviewItem {
  id: string
  title: string
  url: string
  subjectTitle: string
  subjectUrl: string
  posterUrl: string
  rating: number
  excerpt: string
}

export interface StatusItem {
  id: string
  action: string
  targetType: string
  targetTitle: string
  targetUrl: string
  rating: string
  content: string
  time: string
  timeUrl: string
}

export interface FollowingInfo {
  label: string
  url: string
  isFollowing: boolean
}

export interface DoulistSectionItem {
  title: string
  url: string
  itemCount: number
}

export interface DoulistSectionData {
  totalCount: number
  totalUrl: string
  items: DoulistSectionItem[]
}

export interface FollowingItem {
  name: string
  url: string
  avatarUrl: string
}

export interface FriendSectionData {
  totalCount: number
  totalUrl: string
  items: FollowingItem[]
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
  doulistSection: DoulistSectionData | null
  reviews: ReviewItem[]
  reviewCount: number
  statuses: StatusItem[]
  friendSection: FriendSectionData | null
  following: FollowingInfo | null
  followerCount: number
}
