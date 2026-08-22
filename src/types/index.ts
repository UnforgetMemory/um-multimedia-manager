/**
 * Core Type Definitions
 *
 * v6 — Per-platform store architecture:
 * Each platform (douban, imdb, neodb, tmdb) gets its own IndexedDB object store.
 * Records are stored with composite keys like "movie::37332784".
 * Cross-platform links stored in `linkedIds` map.
 */

import type { Provider } from '@/config'

// ==================== Module Layout ====================

// Message protocol contracts live in ./messages (single reviewable module);
// re-exported here so `from '@/types'` consumers stay unchanged.
export type { MessageType, MessagePayloadMap, ToastType, RuntimeMessageEnvelope } from './messages'

// ==================== Store Record ====================

import type { StoreRecordSnapshot } from '@/domain/record/StoreRecord'
export type { StoreRecordSnapshot }

/** @deprecated Use StoreRecordSnapshot — kept for backward compatibility. */
export type StoreRecord = StoreRecordSnapshot

/** Valid record store names */
export type RecordStoreName = 'douban_records' | 'imdb_records' | 'neodb_records' | 'tmdb_records' | 'bilibili_records' | 'youtube_records' | 'bangumi_records' | 'jav_ids'

// ==================== URL Identity ====================

export interface UrlIdentity {
  platform: Provider
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
  source: 'javdb' | 'sehuatang' | 'mukaku'
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

// ==================== Messages → moved to ./messages (re-exported above) ====================

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
  bilibili: number
  youtube: number
  bangumi: number
}
