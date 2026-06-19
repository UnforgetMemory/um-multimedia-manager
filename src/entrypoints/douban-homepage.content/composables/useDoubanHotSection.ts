import { ref, watch, type Ref } from 'vue'
import type { StoreRecord } from '@/types'
import type { HotSectionItem } from '../types'
import { parseHotSection } from '../extractors'

export function useDoubanHotSection(
  selector: string,
  title: string,
  records: Ref<Map<string, StoreRecord>>,
) {
  const items = ref<HotSectionItem[]>([])

  function parse() {
    items.value = parseHotSection(selector)
  }

  watch(records, parse, { immediate: true })

  return { items, parse, title }
}
