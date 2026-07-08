/**
 * NeoDB Push Message Handler
 *
 * Handles NEODB_PUSH_RATING message — push rating from Douban to NeoDB.
 * Extracted from background.ts for modularity.
 */

import * as NeoDB from '@/features/neodb/api'
import { infoLog, warnLog, errorLog } from '@/utils/logger'
import { STORAGE_KEYS } from '@/config'

type SendResponse = (response?: any) => void

/** Build Douban URL from provider info */
function buildDoubanUrl(type: string, providerId: string): string {
  const domain = type === 'music' ? 'music.douban.com'
    : type === 'book' ? 'book.douban.com'
    : 'movie.douban.com'
  return `https://${domain}/subject/${providerId}/`
}

/** Map numeric status to NeoDB shelf type */
function statusToShelfType(status: number): 'complete' | 'progress' | 'wishlist' {
  if (status === 2) return 'complete'
  if (status === 1 || status === 3) return 'progress'
  return 'wishlist'
}

/** NEODB_PUSH_RATING — push rating from Douban to NeoDB */
export async function handleNeoDBPushRating(
  payload: any,
  sendResponse: SendResponse
) {
  try {
    const record = payload?.record
    if (!record?.providerId || !record?.type || !record?.provider) {
      sendResponse({ success: false, message: 'Missing required fields' })
      return
    }

    // Get NeoDB token
    const result = (await chrome.storage.local.get(STORAGE_KEYS.NEODB_TOKEN)) as Record<string, any>
    const token = result[STORAGE_KEYS.NEODB_TOKEN] || ''
    if (!token) {
      sendResponse({ success: false, message: 'NeoDB token not configured' })
      return
    }

    const doubanUrl = buildDoubanUrl(record.type, record.providerId)
    infoLog('[NeoDB] Fetching catalog for:', doubanUrl)

    // 1. Fetch catalog UUID with retry for 404
    let catalog: { uuid: string } | null = null
    const maxRetries = 3
    const retryDelays = [2000, 3000, 5000]

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        catalog = await NeoDB.fetchCatalogByUrl(doubanUrl, token)
        infoLog('[NeoDB] Catalog result:', { uuid: catalog.uuid, hasUuid: !!catalog.uuid, attempt })
        break
      } catch (fetchErr: any) {
        if (fetchErr instanceof NeoDB.NeoDBError) {
          if (fetchErr.status === 429) {
            warnLog('[NeoDB] Rate limited (429) — NeoDB 无法抓取该作品数据')
            sendResponse({ success: false, message: '[429] NeoDB 无法抓取该作品数据' })
            return
          }
          if (fetchErr.status === 404 && attempt < maxRetries) {
            const delay = retryDelays[attempt]
            warnLog(`[NeoDB] Catalog not found (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms...`)
            await new Promise(resolve => setTimeout(resolve, delay))
          } else {
            throw fetchErr
          }
        } else {
          throw fetchErr
        }
      }
    }

    if (!catalog?.uuid) {
      sendResponse({ success: false, message: 'NeoDB 未找到该作品（已重试多次）' })
      return
    }

    // 2. Mark on shelf with retry for 404 only
    const shelfType = statusToShelfType(record.status ?? 0)
    const rating = record.rating ?? 0
    const comment = record.comment ?? ''
    let shelfItem: any = null

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        shelfItem = await NeoDB.markItem(catalog.uuid, shelfType, rating, comment, token)
        break
      } catch (markErr: any) {
        if (markErr instanceof NeoDB.NeoDBError) {
          if (markErr.status === 429) {
            warnLog('[NeoDB] Rate limited (429) on markItem')
            sendResponse({ success: false, message: '[429] NeoDB 请求过于频繁' })
            return
          }
          if (markErr.status === 404 && attempt < maxRetries) {
            const delay = retryDelays[attempt]
            warnLog(`[NeoDB] Mark item failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms...`)
            await new Promise(resolve => setTimeout(resolve, delay))
          } else {
            throw markErr
          }
        } else {
          throw markErr
        }
      }
    }

    infoLog('[NeoDB] Push success:', { catalogUuid: catalog.uuid, shelfItemUuid: shelfItem?.uuid })
    sendResponse({ success: true, shelfItem, catalogUuid: catalog.uuid })
  } catch (err: any) {
    const msg = err instanceof NeoDB.NeoDBError
      ? err.message
      : err?.message || '推送失败'
    errorLog('NeoDB push failed:', msg)
    sendResponse({ success: false, message: msg })
  }
}
