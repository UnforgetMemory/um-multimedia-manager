/**
 * Sehuatang detail cache — content-side client (ADR-024 D2/D3).
 *
 * Lookup chain: L1 in-memory Map → SEHUATANG_CACHE_GET_BATCH (background
 * IndexedDB) → caller falls back to a direct detail-page fetch.
 *
 * The cache is an optimization layer, never a correctness layer: any
 * failure degrades to a plain miss (empty result), never a thrown error.
 */

import { safeSendMessage } from '@/utils/context'
import type { MessagePayloadMap, ResponseMessageMap } from '@/types'

/**
 * Wire shape of one cached detail entry — defined once in
 * types/messages.ts (SEHUATANG_CACHE_GET_BATCH success data); derived here
 * so the wire contract stays single-source.
 */
export type SehuatangDetailCacheEntry = Extract<
  ResponseMessageMap['SEHUATANG_CACHE_GET_BATCH'],
  { success: true }
>['data']['entries'][string]

/** L1 in-memory cache — lives for the content-script session only. */
const l1 = new Map<string, SehuatangDetailCacheEntry>()

/**
 * Batch lookup. L1 hits are returned directly; misses go to the background
 * cache in ONE message and are backfilled into L1. On any messaging/cache
 * failure the L1 hits collected so far are still returned (the rest are
 * plain misses — callers fetch directly).
 */
export async function getCachedDetails(
  tids: string[],
): Promise<Map<string, SehuatangDetailCacheEntry>> {
  const result = new Map<string, SehuatangDetailCacheEntry>()
  const miss: string[] = []

  for (const tid of tids) {
    const hit = l1.get(tid)
    if (hit) result.set(tid, hit)
    else miss.push(tid)
  }
  if (miss.length === 0) return result

  try {
    const res = await safeSendMessage(
      { type: 'SEHUATANG_CACHE_GET_BATCH', payload: { tids: miss } },
      { timeout: 8000, retries: 1 },
    )
    if (res?.success) {
      const entries = res.data.entries
      for (const tid of miss) {
        const entry = entries[tid]
        if (entry) {
          l1.set(tid, entry)
          result.set(tid, entry)
        }
      }
    }
  } catch (err: unknown) {
    // Cache is an optimization layer — degrade to plain misses.
    console.warn('[UMM] sehuatang detail cache read failed, degrading to fetch:', err)
  }

  return result
}

/**
 * Write entries to L1 immediately and fire-and-forget persist them to the
 * background cache. Failures are logged and silently dropped.
 */
export function putCachedDetails(entries: SehuatangDetailCacheEntry[]): void {
  if (entries.length === 0) return

  const wire: MessagePayloadMap['SEHUATANG_CACHE_PUT']['entries'] = []
  for (const entry of entries) {
    l1.set(entry.tid, entry)
    wire.push({ tid: entry.tid, imageUrl: entry.imageUrl, magnetLink: entry.magnetLink })
  }

  safeSendMessage(
    { type: 'SEHUATANG_CACHE_PUT', payload: { entries: wire } },
    { timeout: 8000, retries: 1 },
  ).then((res) => {
    // 传输成功但服务端拒绝（如超批量上限）：L1 已写入，仅持久化落空，需可见。
    if (res && res.success === false) {
      console.warn('[UMM] sehuatang detail cache write rejected:', res.error)
    }
  }).catch((err: unknown) => {
    console.warn('[UMM] sehuatang detail cache write failed (ignored):', err)
  })
}
