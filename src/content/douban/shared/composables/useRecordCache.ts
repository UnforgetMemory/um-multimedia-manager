import { ref, toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import type { StoreRecord } from '@/types'
import { loadRecordEntries } from '../record-cache-core'
import { matchesVisibleId } from '../subject-keys'
import { initEventBus, onEvent } from '@/utils/event-bus'

/** Narrow the `record:updated` payload to the fields we consume. */
function isRecordUpdatedPayload(data: unknown): data is { storeName: string; key?: string } {
  if (typeof data !== 'object' || data === null) return false
  const d = data as { storeName?: unknown }
  return typeof d.storeName === 'string'
}

export function useRecordCache(prefix?: string, ids?: MaybeRefOrGetter<string[]>) {
  const records = ref(new Map<string, StoreRecord>())
  const loading = ref(true)
  let lastLoadedKey: string | undefined

  async function load(force = false) {
    const resolved = ids ? Array.from(new Set(toValue(ids) ?? [])) : undefined
    // Explicit empty id list → nothing to fetch. NEVER fall back to a full-store scan.
    if (resolved !== undefined && resolved.length === 0) {
      records.value = new Map()
      loading.value = false
      lastLoadedKey = undefined
      return
    }
    // Skip reloads when the visible id set is unchanged (dedup growth triggers).
    const key = resolved !== undefined ? `${prefix ?? ''}|${[...resolved].sort().join(',')}` : undefined
    if (!force && resolved !== undefined && key === lastLoadedKey) return
    lastLoadedKey = key
    loading.value = true
    try {
      records.value = await loadRecordEntries(prefix, resolved)
    } catch (error: unknown) {
      console.error('[UMM] Failed to load douban records')
    } finally {
      loading.value = false
    }
  }

  /** Reload, bypassing the unchanged-ids dedup when `force` is set. */
  function refresh(force = false) {
    return load(force)
  }

  function clear() {
    records.value = new Map()
  }

  // Live badge refresh: reload when a record for a currently-visible subject
  // is written in another tab (background broadcasts `record:updated`).
  let unsubscribe = (): void => {}
  try {
    initEventBus()
    unsubscribe = onEvent('record:updated', (data: unknown) => {
      if (!isRecordUpdatedPayload(data) || data.storeName !== 'douban_records') return
      const resolved = ids ? toValue(ids) : undefined
      if (resolved === undefined) {
        // No id list → full-scan mode, reload everything.
        void load(true)
      } else if (!data.key || matchesVisibleId(resolved, data.key)) {
        // Missing key → treat as bulk, reload everything visible
        void load(true)
      }
    })
  } catch {
    // Event bus unavailable (e.g. non-browser test env) — no live reload.
  }

  return { records, loading, load, clear, refresh, unsubscribe }
}
