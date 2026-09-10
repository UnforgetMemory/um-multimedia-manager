/**
 * Sehuatang Detail Cache Message Handlers
 *
 * Handles SEHUATANG_CACHE_GET_BATCH and SEHUATANG_CACHE_PUT (ADR-024 D2).
 * These handlers use the standalone `umm-sehuatang-cache` IndexedDB and are
 * deliberately NOT routed through DataScheduler — they bypass the main-DB
 * readiness gate in background.ts.
 */

import type { MessagePayloadMap } from '@/types'
import { errorMessage, type SendResponse } from '@/utils/error-message'
import {
  getDetailCacheBatch,
  putDetailCacheBatch,
  type SehuatangDetailCacheEntry,
} from '@/features/sehuatang-cache/models'

/** SEHUATANG_CACHE_GET_BATCH — batch read; expired entries are misses. */
export async function handleSehuatangCacheGetBatch(
  payload: MessagePayloadMap['SEHUATANG_CACHE_GET_BATCH'],
  sendResponse: SendResponse,
) {
  try {
    const { tids } = payload
    if (!Array.isArray(tids)) {
      sendResponse({ success: false, error: 'Invalid payload: tids must be an array' })
      return
    }
    const entries = await getDetailCacheBatch(tids)
    sendResponse({ success: true, data: { entries } })
  } catch (err: unknown) {
    sendResponse({ success: false, error: errorMessage(err) })
  }
}

/** 单次写入上限：内容侧一屏至多几十条，超出即视为异常批量（拒绝，不静默截断）。 */
export const MAX_PUT_ENTRIES = 200
/**
 * 字段长度上限：常规 detail 页图片/file 与磁力链远小于此；带大量 tracker
 * 的磁力链可能上千字符，故取较宽裕的 8192（超长视为异常，丢字段不丢记录）。
 */
export const MAX_FIELD_LEN = 8192
/** tid 长度上限（站点 tid 为纯数字串）。 */
export const MAX_TID_LEN = 128

/** 归一化可空字符串字段：非字符串 / 空串 / 超长 → null（丢字段不丢整条记录）。 */
export function normalizeCacheField(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_FIELD_LEN ? value : null
}

export type CachePutValidation =
  | { ok: true; entries: SehuatangDetailCacheEntry[] }
  | { ok: false; error: string }

/**
 * PUT 入参校验 + 归一化（纯函数，便于单测；handler 只负责落库与响应）。
 * 非数组 / 超批量上限 → 拒绝；非法 tid 条目被丢弃；超长字段降级为 null。
 */
export function validateCachePutEntries(entries: unknown): CachePutValidation {
  if (!Array.isArray(entries)) {
    return { ok: false, error: 'Invalid payload: entries must be an array' }
  }
  if (entries.length > MAX_PUT_ENTRIES) {
    return { ok: false, error: `Too many entries: ${entries.length} > ${MAX_PUT_ENTRIES}` }
  }
  const now = Date.now()
  const normalized: SehuatangDetailCacheEntry[] = entries
    .filter((e) => !!e && typeof e.tid === 'string' && e.tid.length > 0 && e.tid.length <= MAX_TID_LEN)
    .map((e) => ({
      tid: e.tid,
      imageUrl: normalizeCacheField(e.imageUrl),
      magnetLink: normalizeCacheField(e.magnetLink),
      cachedAt: now,
    }))
  return { ok: true, entries: normalized }
}

/** SEHUATANG_CACHE_PUT — batch write + LRU eviction (server stamps cachedAt). */
export async function handleSehuatangCachePut(
  payload: MessagePayloadMap['SEHUATANG_CACHE_PUT'],
  sendResponse: SendResponse,
) {
  try {
    const validation = validateCachePutEntries(payload.entries)
    if (!validation.ok) {
      sendResponse({ success: false, error: validation.error })
      return
    }
    await putDetailCacheBatch(validation.entries)
    sendResponse({ success: true, data: { saved: validation.entries.length } })
  } catch (err: unknown) {
    sendResponse({ success: false, error: errorMessage(err) })
  }
}
