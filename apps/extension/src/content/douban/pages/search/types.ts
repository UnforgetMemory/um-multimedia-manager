export interface DoubanSearchData {
  items: SearchItem[]
  total: number
  start: number
  text: string
  count: number
}

export interface SearchItem {
  id: number
  title: string
  cover_url: string
  rating: { count: number; star_count: number; value: number }
  abstract: string
  abstract_2: string
  url: string
  labels: { text: string }[]
  interest: { actions: string[]; status_text: string }
  tpl_name: string
  topics: string[]
}
