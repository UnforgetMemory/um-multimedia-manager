import { ref, watch, type Ref } from 'vue'
import type { StoreRecord } from '@/types'

/**
 * Generic factory for a reactive section that re-parses when records change.
 * Eliminates the identical ref/parse/watch({ immediate: true }) boilerplate
 * found in every homepage section composable.
 */
export function useDoubanSection<T>(
  parse: () => T[],
  records: Ref<Map<string, StoreRecord>>,
) {
  const items = ref<T[]>([])

  function refresh() {
    items.value = parse()
  }

  watch(records, refresh, { immediate: true })

  return { items, refresh }
}
