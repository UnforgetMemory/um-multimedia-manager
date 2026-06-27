import { ref, watch, type Ref } from 'vue'
import type { StoreRecord } from '@/types'
import type { ScreeningItem } from '../types'
import { parseScreeningItems } from '../extractors'

export function useDoubanScreeningItems(records: Ref<Map<string, StoreRecord>>) {
  const items = ref<ScreeningItem[]>([])

  function parse() {
    items.value = parseScreeningItems()
  }

  watch(records, parse, { immediate: true })

  return { items, parse }
}
