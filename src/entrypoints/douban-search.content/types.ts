export interface DoubanSearchData {
  items: SearchItem[]
  total: number
  start: number
  text: string
  count?: number
}

export interface SearchItem {
  id: number
  title: string
  cover_url: string
  rating: {
    count: number
    star_count: number
    value: number
    rating_info?: string
  }
  abstract: string
  abstract_2: string
  url: string
  labels?: { color: string; text: string }[]
  interest?: {
    actions: { action: string; text: string }[]
    status_text?: string
  }
  tpl_name: string
  topics: unknown[]
}

declare global {
  interface Window {
    __DATA__?: DoubanSearchData
  }
}
