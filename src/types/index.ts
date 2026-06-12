/**
 * Core Type Definitions
 *
 * v6 — Per-platform store architecture:
 * Each platform (douban, imdb, neodb, tmdb) gets its own IndexedDB object store.
 * Records are stored with composite keys like "movie::37332784".
 * Cross-platform links stored in `linkedIds` map.
 */

import type { Provider } from '@/config'

// ==================== Store Record ====================

/** Per-platform store record (one entry per object store) */
export interface StoreRecord {
  url: string                             // Canonical URL for this platform
  status: number                          // 0=未看/未听, 1=在看/在听, 2=已看/已听
  rating: number                          // Rating 0-10 (integer)
  comment?: string                        // User's short comment/review text
  updatedAt: string                       // ISO 8601 update timestamp
  linkedIds: Record<string, string>       // Cross-platform links: { "imdb": "movie::tt1375666", "neodb": "movie::xxx" }
  schemaVersion?: number                  // Record schema version (0 or undefined = legacy)
}

/** Build a composite store key from type and provider ID */
export function makeRecordKey(type: string, providerId: string): string {
  return `${type}::${providerId}`
}

/** Valid record store names */
export type RecordStoreName = 'douban_records' | 'imdb_records' | 'neodb_records' | 'tmdb_records' | 'sehuatang_avids'

// ==================== URL Identity ====================

export interface UrlIdentity {
  provider: Provider
  type: string           // movie / tv / music / book
  providerId: string     // Platform-specific ID
  url: string            // Canonical URL
}

// ==================== Settings ====================

export interface WebDAVSettings {
  webdavUrl: string
  webdavUsername: string
  webdavPassword: string
}

export interface NeoDBSettings {
  neodbToken: string
}

// ==================== Debug / Logging ====================

/** Log level hierarchy — higher number = more restrictive */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface DebugSettings {
  debugEnabled?: boolean
  logLevel?: LogLevel
}

export interface AppSettings extends WebDAVSettings, NeoDBSettings, DebugSettings {
  autoSync?: boolean
  autoSyncNeoDB?: boolean
  syncInterval?: number
  theme?: 'auto' | 'light' | 'dark'
  language?: string
  notificationEnabled?: boolean
  appearance?: 'auto' | 'light' | 'dark'
  accentColor?: string
  grayColor?: string
}

// ==================== Export / Import ====================

export interface ExportData {
  schema: 'umm-export'
  version: 2
  exportedAt: string
  stores: {
    [storeName: string]: Record<string, StoreRecord>  // key → StoreRecord
  }
  settings?: Partial<AppSettings>
}

// ==================== PT ID Cache ====================

/** PT torrent → platform ID cache entry */
export interface PtIdCacheEntry {
  ptUrl: string           // PT torrent URL (normalized key)
  doubanId?: string       // e.g., "movie::37332784"
  imdbId?: string         // e.g., "movie::tt1375666"
  updatedAt: string       // ISO 8601
  schemaVersion?: number  // Cache entry schema version (0 or undefined = legacy)
}

// ==================== Adult AV ID ====================

/** Adult AV ID record (unified for javdb, sehuatang, etc.) */
export interface AdultAvId {
  source: string       // "javdb" | "sehuatang" | future sources
  id: string           // AV ID uppercase
  url: string          // Source page URL
  rating: number       // 0-10
  updatedAt: string    // ISO 8601
}

/** Input for adding adult AV IDs */
export interface AdultAvIdInput {
  id: string
  rating?: number
  url?: string
  updatedAt?: string
}

// Kept for backward compatibility during migration
/** @deprecated Use AdultAvId instead */
export type SehuatangAvId = AdultAvId

// ==================== Messages ====================

export type MessageType =
  | 'SHOW_TOAST'
  | 'DB_GET'
  | 'DB_PUT'
  | 'DB_DELETE'
  | 'DB_GET_ALL'
  | 'DB_QUERY'
  | 'DB_COUNT'
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
  | 'ADULT_AV_ADD'
  | 'ADULT_AV_BATCH_ADD'
  | 'ADULT_AV_GET_ALL'
  | 'SEHUATANG_CHECK_VIEWED'
  | 'SEHUATANG_BATCH_ADD'
  | 'SEHUATANG_ADD'
  | 'SEHUATANG_GET_ALL'

export interface MessagePayloadMap {
  SHOW_TOAST: { type: ToastType; title: string; message?: string }
  DB_GET: { storeName: string; key: string }
  DB_PUT: { storeName: string; key: string; record: StoreRecord }
  DB_DELETE: { storeName: string; key: string }
  DB_GET_ALL: { storeName: string }
  DB_QUERY: { storeName: string; indexName: string; value: any }
  DB_COUNT: { storeName: string }
  DB_GET_WATCHED_IDS: { storeNames: string[] }
  DB_SYNC_PAGE_RECORD: { platform: string; key: string; record: StoreRecord; linked?: Array<{ platform: string; key: string; url: string }> }
  PT_ID_CACHE_GET: { ptUrl: string }
  PT_ID_CACHE_PUT: { entry: PtIdCacheEntry }
  PT_ID_CACHE_GET_BULK: { ptUrls: string[] }
  GET_SETTINGS: void
  UPDATE_SETTINGS: Partial<AppSettings>
  EXPORT_DATA: void
  IMPORT_DATA: ExportData
  GET_ALL_RECORDS: void
  GET_STATISTICS: void
  HEALTH_CHECK: void
  GET_MIGRATION_STATUS: void
  SEHUATANG_CHECK_VIEWED: { id: string }
  SEHUATANG_BATCH_ADD: { items: SehuatangAvId[] }
  SEHUATANG_ADD: { id: string; rating?: number }
  SEHUATANG_GET_ALL: void
  ADULT_AV_CHECK: { id: string }
  ADULT_AV_ADD: { source: string; id: string; rating?: number; url?: string }
  ADULT_AV_BATCH_ADD: { source: string; items: AdultAvIdInput[] }
  ADULT_AV_GET_ALL: { source?: string }
}

export interface MessagePayload<T extends MessageType = MessageType> {
  type: T
  payload?: MessagePayloadMap[T]
}

// ==================== Toast ====================

export type ToastType = 'loading' | 'success' | 'error' | 'info'

export interface ToastOptions {
  title: string
  body?: string
  type?: ToastType
  hideMs?: number
}

// ==================== Cache ====================

export interface CacheItem<T = unknown> {
  value: T
  expiry: number
}

// ==================== Migration Status ====================

export interface MigrationStatus {
  currentRecordVersion: number
  currentCacheVersion: number
  currentExportVersion: number
  minSupportedRecordVersion: number
  minSupportedExportVersion: number
  recordMigrationSteps: number
  cacheMigrationSteps: number
}

// ==================== Dataset Meta (WebDAV) ====================

export interface DatasetMeta {
  key: string              // store name, e.g. "douban_records"
  hash: string             // SHA-256 hex of sorted dataset content
  updatedAt: string        // ISO 8601, latest record update time
  recordCount: number      // number of records in this dataset
  dataVersion: number      // schema version for this dataset
}

export interface RemoteMeta {
  schema: 'umm-meta'
  version: 1
  generatedAt: string
  datasets: DatasetMeta[]
}

/** Per-dataset sync decision */
export type SyncDecision = 'skip' | 'upload' | 'download' | 'conflict'

// ==================== Statistics ====================

export interface Statistics {
  total: number
  movie: number
  tv: number
  music: number
  book: number
  douban: number
  imdb: number
  neodb: number
  tmdb: number
}
