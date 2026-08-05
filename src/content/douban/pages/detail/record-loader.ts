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
 * Builds targeted batch-read keys (`{type}::{subjectId}`) for the given media
 * type instead of scanning the whole store. Mutates the recItems array
 * in-place and returns it.
 */
export async function enrichRecItems(recItems: RecItem[], type: string): Promise<RecItem[]> {
  if (recItems.length === 0) return recItems
  try {
    const keys = [...new Set(
      recItems
        .map((i) => i.subjectId)
        .filter((id): id is string => Boolean(id))
        .map((id) => `${type}::${id}`),
    )]
    if (keys.length === 0) return recItems
    const entries = await Store.dbGetBulk('douban_records', keys)
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
