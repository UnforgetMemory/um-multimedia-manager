import { useState, useEffect, useCallback } from 'react'
import type { StoreRecord } from '@/types'

/**
 * Generic React hook for a section that re-parses when records change.
 * Replaces the Vue useDoubanSection composable.
 */
export function useDoubanSection<T>(
  parse: () => T[],
  records: Map<string, StoreRecord>,
) {
  const [items, setItems] = useState<T[]>([])

  const refresh = useCallback(() => {
    setItems(parse())
  }, [parse])

  useEffect(() => {
    refresh()
  }, [refresh, records])

  return { items, refresh }
}
