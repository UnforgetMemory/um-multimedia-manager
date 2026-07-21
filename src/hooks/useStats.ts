import { useMemo } from 'react'
import type { StoreRecord, AdultAvId } from '@/types'

export interface RecordWithType extends StoreRecord {
  type: string
  provider?: string
  providerId?: string
  storeName?: string
}

export function useStats(
  getRecords: () => RecordWithType[],
  getAdultAvItems: () => AdultAvId[],
) {
  const stats = useMemo(() => {
    let movie = 0, tv = 0, music = 0, book = 0, game = 0, bilibili = 0, youtube = 0
    const records = getRecords()
    const items = getAdultAvItems()
    for (const r of records) {
      if (r.type === 'movie') movie++
      else if (r.type === 'tv') tv++
      else if (r.type === 'music') music++
      else if (r.type === 'book') book++
      else if (r.type === 'game') game++
      if (r.provider === 'bilibili') bilibili++
      if (r.provider === 'youtube') youtube++
    }
    return { total: records.length + items.length, movie, tv, music, book, game, jav: items.length, bilibili, youtube }
  }, [getRecords, getAdultAvItems])

  return { stats }
}
