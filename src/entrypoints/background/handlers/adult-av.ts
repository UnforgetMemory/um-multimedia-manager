/**
 * Adult AV ID Message Handlers
 *
 * Handles ADULT_AV_CHECK, ADULT_AV_ADD, ADULT_AV_BATCH_ADD, ADULT_AV_GET_ALL,
 * ADULT_AV_STATS.
 *
 * ADR-025 三表拆分：写入按 classifyAvId 分类（jp→jav_ids / us→usav_ids /
 * tid→sehuatang_ids，内容脚本无感知）；读取三表合并（存量混合键与旧备份
 * 恢复永久兼容）；GET_ALL 只合并番号两表（帖子浏览记录不进番号列表）；
 * STATS 按表各自计数（用户裁决），jp 计数保留 TID 残留过滤。
 */

import type { AdultAvId, StoreRecord, StoreRecordSnapshot, MessagePayloadMap } from '@/types'
import { mediaDB, type MediaDatabase } from '@/features/database/models'
import {
  JAV_IDS_STORE_NAME,
  USAV_IDS_STORE_NAME,
  SEHUATANG_IDS_STORE_NAME,
  normalizeAvId,
  isTidTrackKey,
  classifyAvId,
  storeForAvIdKind,
} from '@/features/adult-av/models'
import { broadcast } from '@/utils/event-bus'
import type { SendResponse } from '@/utils/error-message'
import { getCacheManager, invalidateSchedulerStore } from './cache-invalidation'

const KNOWN_SOURCES = ['javdb', 'sehuatang']

/** 番号两表（真实番号记录）；帖子浏览记录独立在 sehuatang_ids。 */
const AV_ID_STORES = [JAV_IDS_STORE_NAME, USAV_IDS_STORE_NAME] as const
/** 已看判定覆盖的全部三表（含帖子浏览记录——dimmer 兜底链）。 */
const ALL_WATCHED_STORES = [JAV_IDS_STORE_NAME, USAV_IDS_STORE_NAME, SEHUATANG_IDS_STORE_NAME] as const

/** 收集三表全部 status>=2 记录的键后缀（:: 后部分）并入 watched 集合。 */
async function collectWatchedSuffixes(db: Pick<MediaDatabase, 'getAll'>): Promise<Set<string>> {
  const watched = new Set<string>()
  for (const storeName of ALL_WATCHED_STORES) {
    const entries = await db.getAll(storeName)
    for (const entry of entries) {
      if ((entry.record.status ?? 0) >= 2) {
        const suffix = entry.key.includes('::') ? entry.key.slice(entry.key.indexOf('::') + 2) : entry.key
        watched.add(suffix)
      }
    }
  }
  return watched
}

/** ADULT_AV_CHECK — check if AV ID exists across ALL sources and ALL three stores */
export async function handleAdultAvCheck(
  payload: MessagePayloadMap['ADULT_AV_CHECK'],
  sendResponse: SendResponse,
  db: Pick<MediaDatabase, 'get' | 'getAll'> = mediaDB
) {
  const { id } = payload
  if (!id) { sendResponse({ success: false, error: 'Missing id' }); return }

  const cleanId = normalizeAvId(id)
  const baseId = cleanId.replace(/-(U|C|UC|CU)$/i, '')
  // 候选键去重：无后缀时 cleanId === baseId，同一候选只查一次（L1/L2 共用）。
  const candidates = baseId !== cleanId ? [cleanId, baseId] : [cleanId]
  let found: { key: string; record: StoreRecordSnapshot } | null = null
  let watched = false

  // Level 1: known sources exact match, across all three stores
  outer: for (const storeName of ALL_WATCHED_STORES) {
    for (const source of KNOWN_SOURCES) {
      for (const candidate of candidates) {
        const key = `${source}::${candidate}`
        const record = await db.get(storeName, key)
        if (record) {
          found = { key, record }
          watched = (record.status ?? 0) >= 2
          break outer
        }
      }
    }
  }

  // Level 2: cursor scan — match any key ending with ::id (all sources, all three stores)
  if (!found) {
    outer2: for (const storeName of ALL_WATCHED_STORES) {
      const allEntries = await db.getAll(storeName)
      for (const entry of allEntries) {
        const keySuffix = entry.key.includes('::') ? entry.key.slice(entry.key.indexOf('::') + 2) : entry.key
        if (candidates.includes(keySuffix)) {
          found = { key: entry.key, record: entry.record }
          watched = (entry.record.status ?? 0) >= 2
          break outer2
        }
      }
    }
  }

  sendResponse({ success: true, exists: !!found, watched, record: found?.record })
}

/** ADULT_AV_CHECK_BATCH — batch check: which of these IDs are watched? */
export async function handleAdultAvCheckBatch(
  payload: MessagePayloadMap['ADULT_AV_CHECK_BATCH'],
  sendResponse: SendResponse,
  db: Pick<MediaDatabase, 'getAll'> = mediaDB
) {
  const { ids } = payload
  if (!Array.isArray(ids) || ids.length === 0) {
    sendResponse({ success: true, watched: [] })
    return
  }

  // 三表合并 watched 后缀集合（存量混合/旧备份恢复兼容）。
  const watchedBase = await collectWatchedSuffixes(db)

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

/** ADULT_AV_ADD — add single AV ID（分类写入目标表） */
export async function handleAdultAvAdd(
  payload: MessagePayloadMap['ADULT_AV_ADD'],
  sendResponse: SendResponse
) {
  const { source, id, rating = 0, url = '' } = payload
  if (!id || !source) { sendResponse({ success: false, error: 'Missing source or id' }); return }

  const cleanId = normalizeAvId(id)
  const storeName = storeForAvIdKind(classifyAvId(cleanId))
  const key = `${source}::${cleanId}`
  await mediaDB.put(storeName, key, {
    url,
    status: 2,
    rating: Math.max(0, Math.min(10, Math.round(rating))),
    updatedAt: new Date().toISOString(),
    linkedIds: {},
  })
  broadcast('record:updated', { storeName, key })

  // Invalidate scheduler L1 cache so DB_GET_ALL / adult list see fresh data.
  const cm = getCacheManager()
  if (cm) invalidateSchedulerStore(cm, storeName, [key])

  sendResponse({ success: true })
}

/** ADULT_AV_BATCH_ADD — add multiple AV IDs（逐条分类，按表分组批量写） */
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
  // 先派生写入键与目标表（normalizeAvId 只算一次），再按表分组——每组独立
  // batchGet/batchPut。Map.groupBy 为 ES2024（Chrome 117+ / Node 22+），与
  // manifest 的 minimum_chrome_version=119 基线兼容。
  const derived = valid.map((item) => {
    const cleanId = normalizeAvId(item.id)
    return { key: `${source}::${cleanId}`, storeName: storeForAvIdKind(classifyAvId(cleanId)), item }
  })
  const groups = Map.groupBy(derived, (entry) => entry.storeName)

  let addedCount = 0
  const writtenKeys: Array<{ storeName: string; key: string }> = []
  for (const [storeName, group] of groups) {
    const keys = group.map((g) => g.key)
    const existing = await db.batchGet(storeName, keys)
    const batch: Array<{ key: string; record: StoreRecord }> = group.map(({ key, item }) => {
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
    if (batch.length > 0) await db.batchPut(storeName, batch)
    addedCount += batch.length
    for (const key of keys) writtenKeys.push({ storeName, key })
  }

  // Invalidate scheduler L1 cache and notify UI consumers (adult list, DB_GET_ALL).
  const cm = getCacheManager()
  for (const { storeName, key } of writtenKeys) {
    if (cm) invalidateSchedulerStore(cm, storeName, [key])
  }
  broadcast('record:updated', { storeName: JAV_IDS_STORE_NAME, key: '*', bulk: true })
  broadcast('sync:completed', { addedCount, source })
  sendResponse({ success: true, addedCount })
}

/** ADULT_AV_GET_ALL — list all AV IDs（番号两表合并；帖子浏览记录不入列），optionally filtered by source */
export async function handleAdultAvGetAll(
  payload: MessagePayloadMap['ADULT_AV_GET_ALL'] | undefined,
  sendResponse: SendResponse,
  db: Pick<MediaDatabase, 'getAll'> = mediaDB
) {
  const { source } = payload || {}
  let entries: Array<{ key: string; record: StoreRecordSnapshot }> = []
  for (const storeName of AV_ID_STORES) {
    entries = entries.concat(await db.getAll(storeName))
  }
  // 消费侧过滤站点内跟踪键（TID-<tid> 存量残留）：历史总阅/统计/查询面板
  // 只呈现真实番号记录；新 TID 记录落在 sehuatang_ids（不在合并范围）。
  entries = entries.filter(e => !isTidTrackKey(e.key))
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

/** ADULT_AV_STATS — 三段已看统计（ADR-025 D5 各自按表计数）：日系 / 美欧 / 帖子。 */
export async function handleAdultAvStats(
  _payload: MessagePayloadMap['ADULT_AV_STATS'] | undefined,
  sendResponse: SendResponse,
  db: Pick<MediaDatabase, 'getAll'> = mediaDB
) {
  const countWatched = (entries: Array<{ record: StoreRecordSnapshot }>) =>
    entries.filter((e) => (e.record.status ?? 0) >= 2).length

  const javEntries = await db.getAll(JAV_IDS_STORE_NAME)
  // jp 计数排除存量 TID 残留键（消费侧过滤纪律与 GET_ALL 对齐）。
  const jp = countWatched(javEntries.filter((e) => !isTidTrackKey(e.key)))
  const us = countWatched(await db.getAll(USAV_IDS_STORE_NAME))
  const tid = countWatched(await db.getAll(SEHUATANG_IDS_STORE_NAME))

  sendResponse({ success: true, jp, us, tid })
}
