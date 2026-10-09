/**
 * NeoDB API 客户端 — transport 层
 *
 * 负责与 NeoDB 平台交互，获取元数据和封面图片
 * - 搜索作品
 * - 获取详细信息
 * - 获取封面图片
 * - 用户认证
 *
 * 内部分层（ADR-026 需求 9）：本文件只做网络/协议（URL、请求头、fetch/重试、
 * status→error）；纯 payload↔domain 转换与策略在 `./mapping.ts`，
 * 稳定公共面在 `./index.ts`。
 */

import { debugLog, infoLog, warnLog } from '@/libraries/utils/logger';
import { sleep } from '@/libraries/utils';
import {
  buildShelfMarkPayload,
  extractBusinessMessage,
  isShelfCacheEntryStale,
  sanitizeBearerToken,
  toCatalogFetchResult,
  toShelfItemResponse,
  type CatalogFetchResult,
  type ShelfItemResponse,
} from './mapping';

// 冻结路径兼容：ShelfItemResponse 经本模块被 @/types/messages 引用。
export type { ShelfItemResponse } from './mapping';

// ==================== 错误类型 ====================

/** Structured error with HTTP status + business message */
export class NeoDBError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly businessMsg?: string;

  constructor(status: number, statusText: string, businessMsg?: string) {
    const parts = [`[${status}]`];
    if (businessMsg) parts.push(businessMsg);
    else parts.push(statusText || 'Unknown error');
    super(parts.join(' '));
    this.name = 'NeoDBError';
    this.status = status;
    this.statusText = statusText;
    this.businessMsg = businessMsg;
  }
}

// ==================== 常量定义 ====================

const NEOBASE_URL = 'https://neodb.social/api';

// ==================== 重试配置 ====================

const NEO_DB_MAX_RETRIES = 3;
const NEO_DB_RETRY_DELAY = 1000;
/** Per-attempt budget; align with WebDAV so a hung NeoDB cannot pin the SW. */
const NEO_DB_TIMEOUT = 30_000;

/**
 * Fetch with 5xx/network retry. Each attempt has its own AbortController
 * timeout. Abort/timeout is terminal (retrying a hung host only stacks waits).
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = NEO_DB_MAX_RETRIES,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), NEO_DB_TIMEOUT);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok && retries > 0 && response.status >= 500) {
      debugLog(
        `NeoDB request failed with ${response.status}, retrying... (${retries} attempts left)`,
      );
      await sleep(NEO_DB_RETRY_DELAY);
      return fetchWithRetry(url, options, retries - 1);
    }
    return response;
  } catch (error: unknown) {
    const isAbort = error instanceof Error && error.name === 'AbortError';
    if (isAbort) {
      throw new NeoDBError(0, 'Timeout', `NeoDB request timed out after ${NEO_DB_TIMEOUT}ms`);
    }
    if (retries > 0) {
      debugLog(`NeoDB request error, retrying... (${retries} attempts left)`, error);
      await sleep(NEO_DB_RETRY_DELAY);
      return fetchWithRetry(url, options, retries - 1);
    }
    throw error;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

// ==================== 辅助函数 ====================

/**
 * 构建请求头
 */
function buildHeaders(token?: string): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (token) {
    // ✅ 修复：仅移除首尾空白和不可见控制字符，保留所有可打印字符（纯规则在 mapping.ts）
    const cleanToken = sanitizeBearerToken(token);

    infoLog('Token length:', token.length, 'Cleaned length:', cleanToken.length);
    infoLog('Token preview:', cleanToken.substring(0, 10) + '...');

    if (cleanToken) {
      headers['Authorization'] = `Bearer ${cleanToken}`;
    } else {
      warnLog('Token is empty after cleaning, skipping Authorization header');
    }
  } else {
    warnLog('No token provided');
  }

  return headers;
}

/** Read the failure body (if JSON) and map it to a NeoDBError. */
async function toNeoDbError(response: Response): Promise<NeoDBError> {
  let businessMsg = '';
  try {
    const body = await response.json();
    // NeoDB returns { detail: "..." } or { error: "..." } on failure
    businessMsg = extractBusinessMessage(body);
  } catch {
    /* non-JSON error body */
  }
  return new NeoDBError(response.status, response.statusText, businessMsg);
}

// ==================== 核心功能 ====================

/**
 * 通过 URL 抓取 NeoDB 作品信息
 * @param url - 外部平台 URL（如豆瓣链接）
 * @param token - NeoDB Token
 * @returns 作品 UUID 和详细信息
 */
export async function fetchCatalogByUrl(url: string, token?: string): Promise<CatalogFetchResult> {
  const params = new URLSearchParams({ url });
  const apiUrl = `${NEOBASE_URL}/catalog/fetch?${params.toString()}`;

  infoLog('Fetching catalog:', apiUrl);

  const response = await fetchWithRetry(apiUrl, {
    method: 'GET',
    headers: buildHeaders(token),
  });

  infoLog('Catalog fetch response status:', response.status);

  if (!response.ok) {
    throw await toNeoDbError(response);
  }

  const data = await response.json();
  infoLog('Catalog fetch success, UUID:', data.uuid);

  // payload → domain 归一化在纯层（mapping.ts）。
  return toCatalogFetchResult(data);
}

/**
 * 标记作品到书架（正确方式：通过 item UUID）
 * @param itemUuid - 作品 UUID（从 catalog/fetch 或 search 获取）
 * @param shelfType - 书架类型：complete=已完成, progress=进行中, wishlist=想看
 * @param rating - 评分（0-10）
 * @param token - NeoDB Token
 * @returns ShelfItemResponse 或 null
 */
export async function markItem(
  itemUuid: string,
  shelfType: 'complete' | 'progress' | 'wishlist',
  rating?: number,
  comment_text?: string,
  token?: string,
): Promise<ShelfItemResponse> {
  const url = `${NEOBASE_URL}/me/shelf/item/${itemUuid}`;

  // 请求体构建策略（rating/comment 门控）在纯层（mapping.ts）。
  const payload = buildShelfMarkPayload(shelfType, rating, comment_text);

  const response = await fetchWithRetry(url, {
    method: 'POST',
    headers: buildHeaders(token),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await toNeoDbError(response);
  }

  const data = await response.json();
  return toShelfItemResponse(data);
}

/**
 * 获取用户的书架项 UUID（用于更新）
 */

// ==================== 工具函数 ====================

// ==================== 工具函数 ====================

// ✅ P0: 书架项 UUID 缓存（优化性能）
const shelfCache = new Map<string, { uuid: string; timestamp: number }>();

/**
 * 清理过期缓存（TTL 判定为纯策略，在 mapping.ts）。
 */
export function cleanupShelfCache() {
  const now = Date.now();
  for (const [key, value] of shelfCache.entries()) {
    if (isShelfCacheEntryStale(value.timestamp, now)) {
      shelfCache.delete(key);
    }
  }
}
