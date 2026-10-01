/**
 * NeoDB provider — public surface.
 * Transport (fetch/retry/status→error) + pure mapping seam, re-exported as
 * one stable import path. Existing consumers keep using `./api` directly.
 */

export * from './api';
export {
  buildShelfMarkPayload,
  extractBusinessMessage,
  isShelfCacheEntryStale,
  sanitizeBearerToken,
  toCatalogFetchResult,
  toShelfItemResponse,
  SHELF_CACHE_TTL_MS,
  type CatalogFetchResult,
  type ShelfMarkPayload,
} from './mapping';
