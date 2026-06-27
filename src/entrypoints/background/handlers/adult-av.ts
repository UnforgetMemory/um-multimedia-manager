/**
 * Adult AV ID Message Handlers
 *
 * Handles ADULT_AV_CHECK, ADULT_AV_ADD, ADULT_AV_BATCH_ADD, ADULT_AV_GET_ALL,
 * and legacy SEHUATANG_* messages.
 * Extracted from background.ts for modularity.
 */

import type { AdultAvId } from '@/types'
import { mediaDB } from '@/features/database/models'
import { JAV_IDS_STORE_NAME, normalizeAvId } from '@/features/adult-av/models'
// Logger available if needed for future additions

type SendResponse = (response?: any) => void

const KNOWN_SOURCES = ['javdb', 'sehuatang']

/** ADULT_AV_CHECK — check if AV ID exists across ALL sources */
export async function handleAdultAvCheck(
  payload: { id: string },
  sendResponse: SendResponse
) {
  const { id } = payload
  if (!id) { sendResponse({ success: false, error: 'Missing id' }); return }

  const cleanId = normalizeAvId(id)
  const baseId = cleanId.replace(/-(U|C|UC|CU)$/i, '')
  let found: any = null
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
  payload: { ids: string[] },
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
  payload: { source: string; id: string; rating?: number; url?: string },
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
  sendResponse({ success: true })
}

/** ADULT_AV_BATCH_ADD — add multiple AV IDs */
export async function handleAdultAvBatchAdd(
  payload: { source: string; items: Array<{ id: string; rating?: number; url?: string; updatedAt?: string }> },
  sendResponse: SendResponse
) {
  const { source, items } = payload
  if (!source || !Array.isArray(items) || items.length === 0) {
    sendResponse({ success: false, error: 'Invalid payload' }); return
  }

  let addedCount = 0
  for (const item of items) {
    if (!item.id) continue
    const key = `${source}::${normalizeAvId(item.id)}`
    const existing = await mediaDB.get(JAV_IDS_STORE_NAME, key)
    await mediaDB.put(JAV_IDS_STORE_NAME, key, {
      url: item.url || existing?.url || '',
      status: 2,
      rating: item.rating ?? existing?.rating ?? 0,
      updatedAt: item.updatedAt || new Date().toISOString(),
      linkedIds: existing?.linkedIds || {},
    })
    addedCount++
  }
  sendResponse({ success: true, addedCount })
}

/** ADULT_AV_GET_ALL — list all AV IDs, optionally filtered by source */
export async function handleAdultAvGetAll(
  payload: { source?: string } | undefined,
  sendResponse: SendResponse
) {
  const { source } = payload || {}
  let entries = await mediaDB.getAll(JAV_IDS_STORE_NAME)
  if (source) {
    entries = entries.filter(e => e.key.startsWith(`${source}::`))
  }

  const items: AdultAvId[] = entries.map(e => {
    const s = e.key.includes('::') ? e.key.slice(0, e.key.indexOf('::')) : 'unknown'
    const avId = e.key.includes('::') ? e.key.slice(e.key.indexOf('::') + 2) : e.key
    return {
      source: s,
      id: avId,
      url: e.record.url || '',
      rating: e.record.rating || 0,
      updatedAt: e.record.updatedAt,
    }
  })

  sendResponse({ success: true, items })
}

// ==================== Legacy Handlers (backward compat) ====================

/** SEHUATANG_CHECK_VIEWED — legacy, delegates to ADULT_AV_CHECK logic */
export async function handleSehuatangCheckViewed(
  payload: { id: string },
  sendResponse: SendResponse
) {
  const { id: legacyId } = payload
  if (!legacyId) { sendResponse({ success: false, error: 'Missing id' }); return }

  const legacyKey = `sehuatang::${normalizeAvId(legacyId)}`
  const legacyRecord = await mediaDB.get(JAV_IDS_STORE_NAME, legacyKey)
  sendResponse({ success: true, exists: !!legacyRecord, record: legacyRecord })
}

/** SEHUATANG_ADD — legacy single add */
export async function handleSehuatangAdd(
  payload: { id: string; rating?: number },
  sendResponse: SendResponse
) {
  const { id: legacyAddId, rating: legacyRating = 0 } = payload
  if (!legacyAddId) { sendResponse({ success: false, error: 'Missing id' }); return }

  const legacyAddKey = `sehuatang::${normalizeAvId(legacyAddId)}`
  await mediaDB.put(JAV_IDS_STORE_NAME, legacyAddKey, {
    url: '',
    status: 2,
    rating: legacyRating,
    updatedAt: new Date().toISOString(),
    linkedIds: {},
  })
  sendResponse({ success: true })
}

/** SEHUATANG_BATCH_ADD — legacy batch add */
export async function handleSehuatangBatchAdd(
  payload: { items: Array<{ id: string; rating?: number; updatedAt?: string }> },
  sendResponse: SendResponse
) {
  const { items: legacyItems } = payload
  if (!Array.isArray(legacyItems) || legacyItems.length === 0) {
    sendResponse({ success: false, error: 'Invalid items' }); return
  }

  let legacyAddedCount = 0
  for (const item of legacyItems) {
    if (!item.id) continue
    const key = `sehuatang::${normalizeAvId(item.id)}`
    await mediaDB.put(JAV_IDS_STORE_NAME, key, {
      url: '',
      status: 2,
      rating: item.rating || 0,
      updatedAt: item.updatedAt || new Date().toISOString(),
      linkedIds: {},
    })
    legacyAddedCount++
  }
  sendResponse({ success: true, addedCount: legacyAddedCount })
}

/** SEHUATANG_GET_ALL — legacy list all */
export async function handleSehuatangGetAll(
  _payload: any,
  sendResponse: SendResponse
) {
  const entries = await mediaDB.getAll(JAV_IDS_STORE_NAME)
  const items: AdultAvId[] = entries.map(e => {
    const s = e.key.includes('::') ? e.key.slice(0, e.key.indexOf('::')) : 'unknown'
    const avId = e.key.includes('::') ? e.key.slice(e.key.indexOf('::') + 2) : e.key
    return {
      source: s,
      id: avId,
      url: e.record.url || '',
      rating: e.record.rating || 0,
      updatedAt: e.record.updatedAt,
    }
  })
  sendResponse({ success: true, items })
}
