/**
 * IMDb ID recognition & extraction (Douban search overlay).
 *
 * 从豆瓣搜索结果条目中提取 IMDb id（abstract / abstract_2 / url 文本，
 * 或顶层 `imdb` 字段）。纯文本识别能力已下沉到 `@/libraries/utils/imdb-id`
 * （libraries 层）——搜索查询归一化器也需要它，故不可留在站点编排层。
 */

import { extractImdbIdFromText } from '@/libraries/utils/imdb-id'

export { extractImdbIdFromText }

/** Minimal SearchItem shape (decoupled from the page type for testability). */
export interface SearchItemLike {
  id?: number | string
  title?: string
  abstract?: string
  abstract_2?: string
  url?: string
  imdb?: string
}

/**
 * Extract an IMDb id from a search item.
 *
 * Priority: top-level `imdb` field → abstract / abstract_2 / url text.
 * The top-level key is a defensive probe for Douban __DATA__ variants;
 * the text scan covers the DOM-fallback path (.meta → abstract/abstract_2).
 */
export function extractImdbIdFromItem(item: SearchItemLike): string | null {
  if (typeof item.imdb === 'string' && item.imdb.trim()) {
    const direct = extractImdbIdFromText(item.imdb)
    if (direct) return direct
  }
  const text = [item.abstract, item.abstract_2, item.url]
    .filter((s): s is string => typeof s === 'string' && s.length > 0)
    .join(' ')
  return extractImdbIdFromText(text)
}
