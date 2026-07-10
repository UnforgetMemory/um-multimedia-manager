/**
 * IndexedDB record loading helpers for Douban detail pages.
 */
import { Store } from '@/features/database'
import type { UrlIdentity, StoreRecord } from '@/types'
import type { RecItem } from './types'

/**
 * Load the StoreRecord for the given identity from the douban_records store.
 * Returns null when no record exists or on error.
 */
export async function loadRecord(identity: UrlIdentity): Promise<StoreRecord | null> {
  try {
    const key = `${identity.type}::${identity.providerId}`
    return await Store.dbGet('douban_records', key)
  } catch {
    return null
  }
}

/**
 * Enrich recommendation items with personal status and rating from IndexedDB.
 * Mutates the recItems array in-place and returns it.
 */
export async function enrichRecItems(recItems: RecItem[]): Promise<RecItem[]> {
  if (recItems.length === 0) return recItems
  try {
    const entries = await Store.dbGetAll('douban_records')
    const recordMap = new Map<string, { status: number; rating: number }>()
    for (const { key, record } of entries) {
      const id = key.split('::')[1]
      if (id && (record.status ?? 0) > 0) {
        recordMap.set(id, { status: record.status, rating: record.rating || 0 })
      }
    }
    for (const item of recItems) {
      if (!item.subjectId) continue
      const rec = recordMap.get(item.subjectId)
      if (rec) {
        item.recStatus = rec.status
        if (rec.rating > 0) item.personalRating = rec.rating
      }
    }
  } catch { /* silent */ }
  return recItems
}
