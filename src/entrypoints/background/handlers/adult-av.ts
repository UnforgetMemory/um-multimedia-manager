/**
 * Adult AV ID Message Handlers
 *
 * Handles ADULT_AV_CHECK, ADULT_AV_ADD, ADULT_AV_BATCH_ADD, ADULT_AV_GET_ALL.
 * Extracted from background.ts for modularity.
 */

import type { AdultAvId, StoreRecord, StoreRecordSnapshot, MessagePayloadMap } from '@/types'
import { mediaDB, type MediaDatabase } from '@/features/database/models'
import { JAV_IDS_STORE_NAME, normalizeAvId } from '@/features/adult-av/models'
import { broadcast } from '@/utils/event-bus'
import type { SendResponse } from '@/utils/error-message'
import { getCacheManager, invalidateSchedulerStore } from './cache-invalidation'

const KNOWN_SOURCES = ['javdb', 'sehuatang']

/** ADULT_AV_CHECK — check if AV ID exists across ALL sources */
export async function handleAdultAvCheck(
  payload: MessagePayloadMap['ADULT_AV_CHECK'],
  sendResponse: SendResponse
) {
  const { id } = payload
  if (!id) { sendResponse({ success: false, error: 'Missing id' }); return }

  const cleanId = normalizeAvId(id)
  const baseId = cleanId.replace(/-(U|C|UC|CU)$/i, '')
  let found: { key: string; record: StoreRecordSnapshot } | null = null
  let watched = false

  // Level 1: known sources exact match
  for (const source of KNOWN_SOURCES) {
    for (const candidate of [cleanId, baseId]) {
      if (candidate !== cleanId && candidate === baseId) continue // dedup
      const key = `${source}::${candidate}`
      const record = await mediaDB.get(JAV_IDS_STORE_NAME, key)
      if (record) {
        found = { key, record }
        watched = (record.status ?? 0) >= 2
        break
      }
    }
    if (found) break
  }

  // Level 2: cursor scan — match any key ending with ::id (handles all sources)
  if (!found) {
    const allEntries = await mediaDB.getAll(JAV_IDS_STORE_NAME)
    const candidates = [cleanId, ...(baseId !== cleanId ? [baseId] : [])]
    for (const entry of allEntries) {
      const keySuffix = entry.key.includes('::') ? entry.key.slice(entry.key.indexOf('::') + 2) : entry.key
      if (candidates.includes(keySuffix)) {
        found = { key: entry.key, record: entry.record }
        watched = (entry.record.status ?? 0) >= 2
        break
      }
    }
  }

  sendResponse({ success: true, exists: !!found, watched, record: found?.record })
}

/** ADULT_AV_CHECK_BATCH — batch check: which of these IDs are watched? */
export async function handleAdultAvCheckBatch(
  payload: MessagePayloadMap['ADULT_AV_CHECK_BATCH'],
  sendResponse: SendResponse
) {
  const { ids } = payload
  if (!Array.isArray(ids) || ids.length === 0) {
    sendResponse({ success: true, watched: [] })
    return
  }

  // Get all jav_id store entries in a single read
  const allEntries = await mediaDB.getAll(JAV_IDS_STORE_NAME)
  // Build a Set of all watched IDs (key suffix after ::, normalized)
  const watchedBase = new Set<string>()
  for (const entry of allEntries) {
    const suffix = entry.key.includes('::') ? entry.key.slice(entry.key.indexOf('::') + 2) : entry.key
    if ((entry.record.status ?? 0) >= 2) {
      watchedBase.add(suffix)
    }
  }

  // Match each input ID against the watched set
  const watched: string[] = []
  for (const rawId of ids) {
    const cleanId = normalizeAvId(rawId)
    const baseId = cleanId.replace(/-(U|C|UC|CU)$/i, '')
    if (watchedBase.has(cleanId) || watchedBase.has(baseId)) {
      watched.push(cleanId)
    }
  }

  sendResponse({ success: true, watched })
}

/** ADULT_AV_ADD — add single AV ID */
export async function handleAdultAvAdd(
  payload: MessagePayloadMap['ADULT_AV_ADD'],
  sendResponse: SendResponse
) {
  const { source, id, rating = 0, url = '' } = payload
  if (!id || !source) { sendResponse({ success: false, error: 'Missing source or id' }); return }

  const key = `${source}::${normalizeAvId(id)}`
  await mediaDB.put(JAV_IDS_STORE_NAME, key, {
    url,
    status: 2,
    rating: Math.max(0, Math.min(10, Math.round(rating))),
    updatedAt: new Date().toISOString(),
    linkedIds: {},
  })
  broadcast('record:updated', { storeName: JAV_IDS_STORE_NAME, key })

  // Invalidate scheduler L1 cache so DB_GET_ALL('jav_ids') / adult list see fresh data.
  const cm = getCacheManager()
  if (cm) invalidateSchedulerStore(cm, JAV_IDS_STORE_NAME, [key])

  sendResponse({ success: true })
}

/** ADULT_AV_BATCH_ADD — add multiple AV IDs */
export async function handleAdultAvBatchAdd(
  payload: MessagePayloadMap['ADULT_AV_BATCH_ADD'],
  sendResponse: SendResponse,
  db: Pick<MediaDatabase, 'batchGet' | 'batchPut'> = mediaDB
) {
  const { source, items } = payload
  if (!source || !Array.isArray(items) || items.length === 0) {
    sendResponse({ success: false, error: 'Invalid payload' }); return
  }

  const valid = items.filter((i) => i.id)
  const keys = valid.map((i) => `${source}::${normalizeAvId(i.id)}`)
  const existing = await db.batchGet(JAV_IDS_STORE_NAME, keys)
  const batch: Array<{ key: string; record: StoreRecord }> = valid.map((item, idx) => {
    const key = keys[idx]
    const prev = existing.get(key)
    return {
      key,
      record: {
        url: item.url || prev?.url || '',
        status: 2,
        rating: item.rating ?? prev?.rating ?? 0,
        updatedAt: item.updatedAt || new Date().toISOString(),
        linkedIds: prev?.linkedIds || {},
      },
    }
  })
  if (batch.length > 0) await db.batchPut(JAV_IDS_STORE_NAME, batch)
  const addedCount = batch.length

  // Invalidate scheduler L1 cache and notify UI consumers (adult list, DB_GET_ALL).
  const cm = getCacheManager()
  if (cm) invalidateSchedulerStore(cm, JAV_IDS_STORE_NAME, keys)
  broadcast('record:updated', { storeName: JAV_IDS_STORE_NAME, key: '*', bulk: true })
  broadcast('sync:completed', { addedCount, source })
  sendResponse({ success: true, addedCount })
}

/** ADULT_AV_GET_ALL — list all AV IDs, optionally filtered by source */
export async function handleAdultAvGetAll(
  payload: MessagePayloadMap['ADULT_AV_GET_ALL'] | undefined,
  sendResponse: SendResponse
) {
  const { source } = payload || {}
  let entries = await mediaDB.getAll(JAV_IDS_STORE_NAME)
  if (source) {
    entries = entries.filter(e => e.key.startsWith(`${source}::`))
  }

  const items: AdultAvId[] = entries.map(e => {
    // Key prefix is arbitrary at runtime — cast at this trust boundary.
    const s = e.key.includes('::') ? e.key.slice(0, e.key.indexOf('::')) : 'unknown'
    const avId = e.key.includes('::') ? e.key.slice(e.key.indexOf('::') + 2) : e.key
    return {
      source: s as AdultAvId['source'],
      id: avId,
      url: e.record.url || '',
      rating: e.record.rating || 0,
      updatedAt: e.record.updatedAt,
    }
  })

  sendResponse({ success: true, items })
}
