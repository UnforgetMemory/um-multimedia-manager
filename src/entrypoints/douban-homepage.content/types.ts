export interface ScreeningItem {
  groupIndex: number
  subjectId: string
  title: string
  rate: string
  starNum: string
  intro: string
  posterUrl: string
  posterAlt: string
  href: string
}

export interface BillboardItem {
  order: string
  title: string
  href: string
  subjectId: string
}

export interface HotSectionItem {
  subjectId: string
  title: string
  rate: string
  posterUrl: string
  href: string
  episodes?: string
}

export interface ReviewItem {
  subjectId: string
  href: string
}
