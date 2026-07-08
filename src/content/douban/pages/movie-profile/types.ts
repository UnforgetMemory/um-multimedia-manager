export interface MovieProfileStat {
  label: string
  count: number
  url: string
}

export interface MovieProfileItem {
  title: string
  posterUrl: string
  url: string
}

export interface MovieProfileSection {
  label: string
  count: number
  url: string
  items: MovieProfileItem[]
}

export interface MovieProfileDoulist {
  title: string
  url: string
  followers: number
}

export interface MovieProfileReview {
  title: string
  url: string
  subjectTitle: string
  subjectUrl: string
  summary: string
}

export interface MovieProfileData {
  userId: string
  displayName: string
  avatarUrl: string
  stats: MovieProfileStat[]
  sections: MovieProfileSection[]
  celebrityCount: number
  celebrityUrl: string
  reviewCount: number
  reviewUrl: string
  doulists: MovieProfileDoulist[]
}
