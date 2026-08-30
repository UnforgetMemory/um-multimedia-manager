/**
 * Message protocol contracts — the single authority for everything that
 * crosses chrome.runtime messaging.
 *
 * Extracted from types/index.ts (refactor plan W2,
 * docs/audit/refactor-plan-wxt-alignment-2026-08-21.md §3.1-D7) so the wire
 * contract lives in one reviewable module. Adding a message type requires
 * the four-place sync documented in AGENTS.md:
 *   1. `MessageType` union (here)
 *   2. `MessagePayloadMap` entry (here)
 *   3. background.ts handleMessage switch case
 *   4. `ResponseMessageMap` + `SuccessDataMap` entries (here)
 *
 * NOTE: imports below are type-only and intentionally reference ./index —
 * type-level circular imports are erased at runtime; index.ts re-exports this
 * module so existing `from '@/types'` consumers keep working unchanged.
 */

import type { Provider } from '@/config'
import type {
  AdultAvId,
  AdultAvIdInput,
  AppSettings,
  ExportData,
  MigrationStatus,
  PtIdCacheEntry,
  Statistics,
  StoreRecord,
} from './index'
import type { ShelfItemResponse } from '@/features/neodb/api'
import type { MediaTypeId } from '@/domain/platform/MediaType'

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
  NEODB_PUSH_RATING: { record: { providerId: string; type: MediaTypeId; provider: Provider; status?: number; rating?: number; comment?: string } }
}

/** Wire envelope for a known message: payload present unless declared `void`. */
export type RuntimeMessageEnvelope = {
  [K in MessageType]: MessagePayloadMap[K] extends void
    ? { type: K }
    : { type: K; payload: MessagePayloadMap[K] }
}[MessageType]

// ==================== Responses ====================

/**
 * Discriminated response union per message type — the wire contract for
 * everything handlers return via `sendResponse`
 * (src/entrypoints/background.ts handleMessage switch).
 *
 * Each member is `{ success: true; ...data } | { success: false; ... }`, with
 * the failure shape mirroring what the corresponding handler actually emits
 * (`error` for most, `message` for the WebDAV/NeoDB dialects).
 *
 * ENFORCEMENT: client-side only — `db/api.send` resolves against these
 * types; handler return shapes satisfy them by convention, not by compiler
 * constraint (typed dispatcher = follow-up). Maps verified against all 30
 * handlers in the 2026-08-29 umreview (Wave B/C).
 */
export interface ResponseMessageMap {
  SHOW_TOAST: { success: true } | { success: false; error?: string }
  DB_GET: { success: true; record: StoreRecord | null } | { success: false; error: string }
  DB_PUT: { success: true } | { success: false; error: string }
  DB_DELETE: { success: true } | { success: false; error: string }
  DB_GET_ALL: { success: true; entries: Array<{ key: string; record: StoreRecord }> } | { success: false; error: string }
  DB_GET_BULK: { success: true; entries: Array<{ key: string; record: StoreRecord }> } | { success: false; error: string }
  DB_GET_WATCHED_IDS: { success: true; results: Record<string, string[]> } | { success: false; error: string }
  DB_SYNC_PAGE_RECORD:
    | { success: true; result: { changed: boolean; syncedPlatforms: string[] } }
    | { success: false; error: string }
  PT_ID_CACHE_GET: { success: true; entry: PtIdCacheEntry | null } | { success: false; error: string }
  PT_ID_CACHE_PUT: { success: true } | { success: false; error: string }
  PT_ID_CACHE_GET_BULK: { success: true; entries: Record<string, PtIdCacheEntry> } | { success: false; error: string }
  GET_SETTINGS: { success: true; settings: AppSettings } | { success: false; error: string }
  UPDATE_SETTINGS: { success: true; settings: AppSettings } | { success: false; error: string }
  EXPORT_DATA: { success: true; data: ExportData } | { success: false; error: string }
  IMPORT_DATA:
    | { success: true }
    | { success: false; error: string; errorCode?: string; errorDetails?: unknown }
  GET_ALL_RECORDS: { success: true; records: Array<StoreRecord & { type: string; provider: string; providerId: string }> } | { success: false; error: string }
  GET_STATISTICS: { success: true; stats: Statistics } | { success: false; error: string }
  HEALTH_CHECK: { success: true; dbReady: boolean; uptime: number } | { success: false; error: string }
  GET_MIGRATION_STATUS: { success: true; migration: MigrationStatus } | { success: false; error: string }
  ADULT_AV_CHECK:
    | { success: true; exists: boolean; watched: boolean; record?: StoreRecord | null }
    | { success: false; error: string }
  ADULT_AV_CHECK_BATCH: { success: true; watched: string[] } | { success: false; error: string }
  ADULT_AV_ADD: { success: true } | { success: false; error: string }
  ADULT_AV_BATCH_ADD: { success: true; addedCount: number } | { success: false; error: string }
  ADULT_AV_GET_ALL: { success: true; items: AdultAvId[] } | { success: false; error: string }
  DOWNLOAD_FILE: { success: true } | { success: false; error?: string }
  WEBDAV_TEST: { success: true; ok: boolean; message: string } | { success: false; message: string }
  WEBDAV_UPLOAD:
    | { success: true; totalUploaded: number; timestamp: string; direction: 'upload'; message: string }
    | { success: false; error: string; message?: string }
  WEBDAV_DOWNLOAD:
    | { success: true; totalDownloaded: number; timestamp: string; direction: 'download'; message: string }
    | { success: false; error: string; message?: string }
  WEBDAV_SYNC:
    | { success: true; direction: 'merge'; message: string; uploaded: number; downloaded: number; skipped: number; timestamp: string }
    | { success: false; error: string; message?: string }
  NEODB_PUSH_RATING:
    | { success: true; shelfItem: ShelfItemResponse | null; catalogUuid: string }
    | { success: false; message: string }
}

/** Response for one message type (kept for the planned typed dispatcher). */
export type MessageResponse<K extends MessageType> = ResponseMessageMap[K]

/**
 * Success payload per message type, WITHOUT the `success` literal.
 * Kept separate from ResponseMessageMap so the success member can be
 * expressed as a cheap intersection (`{ success: true } & SuccessDataMap[K]`)
 * instead of an `Extract<ResponseMessageMap[K], …>` — the latter instantiates
 * the full 60-member union per lookup and hits TS2590 ("union too complex").
 */
export interface SuccessDataMap {
  SHOW_TOAST: Record<never, never>
  DB_GET: { record: StoreRecord | null }
  DB_PUT: Record<never, never>
  DB_DELETE: Record<never, never>
  DB_GET_ALL: { entries: Array<{ key: string; record: StoreRecord }> }
  DB_GET_BULK: { entries: Array<{ key: string; record: StoreRecord }> }
  DB_GET_WATCHED_IDS: { results: Record<string, string[]> }
  DB_SYNC_PAGE_RECORD: { result: { changed: boolean; syncedPlatforms: string[] } }
  PT_ID_CACHE_GET: { entry: PtIdCacheEntry | null }
  PT_ID_CACHE_PUT: Record<never, never>
  PT_ID_CACHE_GET_BULK: { entries: Record<string, PtIdCacheEntry> }
  GET_SETTINGS: { settings: AppSettings }
  UPDATE_SETTINGS: { settings: AppSettings }
  EXPORT_DATA: { data: ExportData }
  IMPORT_DATA: Record<never, never>
  GET_ALL_RECORDS: { records: Array<StoreRecord & { type: string; provider: string; providerId: string }> }
  GET_STATISTICS: { stats: Statistics }
  HEALTH_CHECK: { dbReady: boolean; uptime: number }
  GET_MIGRATION_STATUS: { migration: MigrationStatus }
  ADULT_AV_CHECK: { exists: boolean; watched: boolean; record?: StoreRecord | null }
  ADULT_AV_CHECK_BATCH: { watched: string[] }
  ADULT_AV_ADD: Record<never, never>
  ADULT_AV_BATCH_ADD: { addedCount: number }
  ADULT_AV_GET_ALL: { items: AdultAvId[] }
  DOWNLOAD_FILE: Record<never, never>
  WEBDAV_TEST: { ok: boolean; message: string }
  WEBDAV_UPLOAD: { totalUploaded: number; timestamp: string; direction: 'upload'; message: string }
  WEBDAV_DOWNLOAD: { totalDownloaded: number; timestamp: string; direction: 'download'; message: string }
  WEBDAV_SYNC: { direction: 'merge'; message: string; uploaded: number; downloaded: number; skipped: number; timestamp: string }
  NEODB_PUSH_RATING: { shelfItem: ShelfItemResponse | null; catalogUuid: string }
}

/** Success member of a message response — what `db/api.send` resolves to. */
export type MessageSuccess<K extends MessageType> = { success: true } & SuccessDataMap[K]
