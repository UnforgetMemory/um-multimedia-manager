import { computed } from 'vue'
import type { StoreRecord, AdultAvId } from '@/types'

interface RecordWithType extends StoreRecord {
  type: string
  provider?: string
  providerId?: string
}

export function useStats(
  getRecords: () => RecordWithType[],
  getAdultAvItems: () => AdultAvId[],
) {
  const stats = computed(() => {
    let movie = 0, tv = 0, music = 0
    const records = getRecords()
    const items = getAdultAvItems()
    for (const r of records) {
      if (r.type === 'movie') movie++
      else if (r.type === 'tv') tv++
      else if (r.type === 'music') music++
    }
    return { total: records.length + items.length, movie, tv, music, jav: items.length }
  })

  return { stats }
}