/**
 * NeoDB pure seam — payload ↔ domain transformations and policy, zero I/O.
 *
 * Transport (src/provider/neodb/api.ts) owns fetch/retry/headers/status→error;
 * this file owns the deterministic rules: bearer-token sanitization, shelf
 * request payload building, shelf/catalog response mapping, business error
 * message extraction, and the shelf-cache TTL policy.
 */

// ==================== 类型定义 ====================

// ✅ 新增：书架项响应接口
export interface ShelfItemResponse {
  uuid: string; // shelf_item 的唯一 ID
  item: string; // 作品 UUID
  shelf_type: string; // complete/progress/wishlist
  rating: number; // 评分
  comment_text?: string; // 短评文字
  created_time: string; // 创建时间
  updated_time: string; // 更新时间
}

/** 书架标记请求体（rating 仅在 > 0 时携带，comment 仅在非空时携带）。 */
export interface ShelfMarkPayload {
  shelf_type: 'complete' | 'progress' | 'wishlist';
  visibility: number;
  rating_grade?: number;
  comment_text?: string;
}

/** catalog/fetch 响应：uuid 兜底为 ''，其余字段原样透传（签名与旧 api.ts 一致）。 */
export interface CatalogFetchResult {
  uuid: string;
  /** External API payload: unmodeled fields pass through untouched. */
  [key: string]: unknown;
}

// ==================== 请求侧纯规则 ====================

/**
 * 仅移除首尾空白和不可见控制字符，保留所有可打印字符。
 * \x00-\x1F: 控制字符, \x7F: DEL 字符
 */
export function sanitizeBearerToken(token: string): string {
  return token.trim().replace(/[\x00-\x1F\x7F]/g, '');
}

/** Build the shelf-mark request payload. */
export function buildShelfMarkPayload(
  shelfType: 'complete' | 'progress' | 'wishlist',
  rating?: number,
  commentText?: string,
): ShelfMarkPayload {
  const payload: ShelfMarkPayload = {
    shelf_type: shelfType,
    visibility: 0,
  };

  if (rating && rating > 0) {
    payload.rating_grade = rating;
  }

  if (commentText) {
    payload.comment_text = commentText;
  }

  return payload;
}

// ==================== 响应侧纯映射 ====================

/** NeoDB failure bodies carry the human message under detail/error/message. */
export function extractBusinessMessage(body: {
  detail?: string;
  error?: string;
  message?: string;
}): string {
  return body.detail || body.error || body.message || '';
}

/** Keep only the shelf-item fields we consume (response → domain mapping). */
export function toShelfItemResponse(data: {
  uuid: string;
  item: string;
  shelf_type: string;
  rating: number;
  created_time: string;
  updated_time: string;
}): ShelfItemResponse {
  return {
    uuid: data.uuid,
    item: data.item,
    shelf_type: data.shelf_type,
    rating: data.rating,
    created_time: data.created_time,
    updated_time: data.updated_time,
  };
}

/** Normalize a catalog/fetch payload: guaranteed `uuid` string key. */
export function toCatalogFetchResult(data: Record<string, unknown>): CatalogFetchResult {
  // Spread order kept verbatim from the pre-seam transport: a present-but-falsy
  // `uuid` in data overwrites the '' fallback (neodb-mapping.spec pins this).
  const result: Record<string, unknown> = { uuid: (data.uuid as string) || '', ...data };
  return result as CatalogFetchResult;
}

// ==================== 缓存策略（纯判定） ====================

/** ✅ P0: 书架项 UUID 缓存 TTL（5分钟缓存，与下方判定同源）。 */
export const SHELF_CACHE_TTL_MS = 5 * 60 * 1000;

/** Shelf-cache entry older than the TTL is stale and must be evicted. */
export function isShelfCacheEntryStale(timestamp: number, now: number): boolean {
  return now - timestamp > SHELF_CACHE_TTL_MS;
}
