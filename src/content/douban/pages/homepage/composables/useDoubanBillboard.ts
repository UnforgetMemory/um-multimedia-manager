import { ref, watch, type Ref } from 'vue'
import type { StoreRecord } from '@/types'
import type { BillboardItem } from '../types'
import { parseBillboardItems } from '../extractors'

export function useDoubanBillboard(records: Ref<Map<string, StoreRecord>>) {
  const items = ref<BillboardItem[]>([])

  function parse() {
    items.value = parseBillboardItems()
  }

  watch(records, parse, { immediate: true })

  return { items, parse }
}
