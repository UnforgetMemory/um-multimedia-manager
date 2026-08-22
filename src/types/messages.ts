/**
 * Message protocol contracts — the single authority for everything that
 * crosses chrome.runtime messaging.
 *
 * Extracted from types/index.ts (refactor plan W2,
 * docs/audit/refactor-plan-wxt-alignment-2026-08-21.md §3.1-D7) so the wire
 * contract lives in one reviewable module. Adding a message type still
 * requires the three-place sync documented in AGENTS.md:
 *   1. `MessageType` union (here)
 *   2. `MessagePayloadMap` entry (here)
 *   3. background.ts handleMessage switch case
 *
 * NOTE: imports below are type-only and intentionally reference ./index —
 * type-level circular imports are erased at runtime; index.ts re-exports this
 * module so existing `from '@/types'` consumers keep working unchanged.
 */

import type { Provider } from '@/config'
import type {
  AdultAvIdInput,
  AppSettings,
  ExportData,
  PtIdCacheEntry,
  StoreRecord,
} from './index'

// ==================== Toast ====================

export type ToastType = 'loading' | 'success' | 'error' | 'info'

// ==================== Messages ====================

export type MessageType =
  | 'SHOW_TOAST'
  | 'DB_GET'
  | 'DB_PUT'
  | 'DB_DELETE'
  | 'DB_GET_ALL'
  | 'DB_GET_BULK'
  | 'DB_GET_WATCHED_IDS'
  | 'DB_SYNC_PAGE_RECORD'
  | 'PT_ID_CACHE_GET'
  | 'PT_ID_CACHE_PUT'
  | 'PT_ID_CACHE_GET_BULK'
  | 'GET_SETTINGS'
  | 'UPDATE_SETTINGS'
  | 'EXPORT_DATA'
  | 'IMPORT_DATA'
  | 'GET_ALL_RECORDS'
  | 'GET_STATISTICS'
  | 'HEALTH_CHECK'
  | 'GET_MIGRATION_STATUS'
  | 'ADULT_AV_CHECK'
  | 'ADULT_AV_CHECK_BATCH'
  | 'ADULT_AV_ADD'
  | 'ADULT_AV_BATCH_ADD'
  | 'ADULT_AV_GET_ALL'
  | 'DOWNLOAD_FILE'
  | 'WEBDAV_TEST'
  | 'WEBDAV_UPLOAD'
  | 'WEBDAV_DOWNLOAD'
  | 'WEBDAV_SYNC'
  | 'NEODB_PUSH_RATING'

export interface MessagePayloadMap {
  SHOW_TOAST: { type: ToastType; title: string; message?: string }
  DB_GET: { storeName: string; key: string }
  DB_PUT: { storeName: string; key: string; record: StoreRecord }
  DB_DELETE: { storeName: string; key: string }
  DB_GET_ALL: { storeName: string }
  DB_GET_BULK: { storeName: string; keys: string[] }
  DB_GET_WATCHED_IDS: { storeNames: string[] }
  DB_SYNC_PAGE_RECORD: { platform: Provider; key: string; record: StoreRecord; linked?: Array<{ platform: Provider; key: string; url: string }> }
  PT_ID_CACHE_GET: { ptUrl: string }
  PT_ID_CACHE_PUT: { entry: PtIdCacheEntry }
  PT_ID_CACHE_GET_BULK: { ptUrls: string[] }
  GET_SETTINGS: void
  UPDATE_SETTINGS: Partial<AppSettings>
  EXPORT_DATA: { includeWebDAVCredentials?: boolean } | undefined
  IMPORT_DATA: ExportData
  GET_ALL_RECORDS: void
  GET_STATISTICS: void
  HEALTH_CHECK: void
  GET_MIGRATION_STATUS: void
  ADULT_AV_CHECK: { id: string }
  ADULT_AV_CHECK_BATCH: { ids: string[] }
  ADULT_AV_ADD: { source: string; id: string; rating?: number; url?: string }
  ADULT_AV_BATCH_ADD: { source: string; items: AdultAvIdInput[] }
  ADULT_AV_GET_ALL: { source?: string }
  DOWNLOAD_FILE: { url: string; filename: string }
  /** Superset of both caller dialects: options page sends short keys
   *  (url/username/password), other senders send webdav* keys;
   *  handleWebDAVTest resolves per-field (`webdavUrl ?? url`). */
  WEBDAV_TEST:
    | {
        url?: string
        username?: string
        password?: string
        webdavUrl?: string
        webdavUsername?: string
        webdavPassword?: string
      }
    | undefined
  WEBDAV_UPLOAD: void
  WEBDAV_DOWNLOAD: void
  WEBDAV_SYNC: void
  NEODB_PUSH_RATING: { record: { providerId: string; type: 'movie' | 'tv' | 'music' | 'book' | 'game'; provider: Provider; status?: number; rating?: number; comment?: string } }
}

/** Wire envelope for a known message: payload present unless declared `void`. */
export type RuntimeMessageEnvelope = {
  [K in MessageType]: MessagePayloadMap[K] extends void
    ? { type: K }
    : { type: K; payload: MessagePayloadMap[K] }
}[MessageType]
