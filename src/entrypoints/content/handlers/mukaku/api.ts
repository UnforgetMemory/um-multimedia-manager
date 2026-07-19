// ─── API 工具函数 ──────────────────────────────────

import { MUKAKU_CONFIG } from './config'

/**
 * 从 API 响应中提取关联 ID
 */
export function extractLinkedIdsFromPayload(payload: any): {
  doubanId: string | null
  imdbId: string | null
} {
  const data = payload?.data || payload || {}

  return {
    doubanId: data.doub_id ? String(data.doub_id) : null,
    imdbId: data.IMDB_number
      ? (() => {
          const id = String(data.IMDB_number)
          return id.startsWith('tt') ? id : `tt${id}`
        })()
      : null,
  }
}

/**
 * 构建 API URL
 */
export function getApiUrl(mvId: string): string {
  const url = new URL(MUKAKU_CONFIG.API_PATH, 'https://web5.mukaku.com')
  url.searchParams.set('id', mvId)
  url.searchParams.set('app_id', MUKAKU_CONFIG.APP_ID)
  url.searchParams.set('identity', MUKAKU_CONFIG.IDENTITY)
  return url.href
}