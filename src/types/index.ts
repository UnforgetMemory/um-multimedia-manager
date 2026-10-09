/**
 * Core Type Definitions
 *
 * v6 — Per-platform store architecture:
 * Each platform (douban, imdb, neodb, tmdb) gets its own IndexedDB object store.
 * Records are stored with composite keys like "movie::37332784".
 * Cross-platform links stored in `linkedIds` map.
 */

import type { Provider } from '@/libraries/config';

// ==================== Module Layout ====================

// Message protocol contracts live in ./messages (single reviewable module);
// re-exported here so `from '@/types'` consumers stay unchanged.
export type {
  MessageType,
  MessagePayloadMap,
  ToastType,
  RuntimeMessageEnvelope,
  ResponseMessageMap,
  MessageResponse,
  MessageSuccess,
} from './messages';

// ==================== Store Record ====================

import type { StoreRecordSnapshot } from '@/domain/record/store-record';
export type { StoreRecordSnapshot };

/** @deprecated Use StoreRecordSnapshot — kept for backward compatibility. */
export type StoreRecord = StoreRecordSnapshot;

/** Valid record store names */
export type RecordStoreName =
  | 'douban_records'
  | 'imdb_records'
  | 'neodb_records'
  | 'tmdb_records'
  | 'bilibili_records'
  | 'youtube_records'
  | 'bangumi_records'
  | 'jav_ids'
  | 'usav_ids'
  | 'sehuatang_ids';

// ==================== URL Identity ====================

export interface UrlIdentity {
  platform: Provider;
  type: string; // movie / tv / music / book
  providerId: string; // Platform-specific ID
  url: string; // Canonical URL
}

// ==================== Settings ====================

export interface WebDAVSettings {
  webdavUrl: string;
  webdavUsername: string;
  webdavPassword: string;
}

export interface NeoDBSettings {
  neodbToken: string;
}

// ==================== Debug / Logging ====================

/** Log level hierarchy — higher number = more restrictive */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface DebugSettings {
  debugEnabled?: boolean;
  logLevel?: LogLevel;
}

export interface AppSettings extends WebDAVSettings, NeoDBSettings, DebugSettings {
  autoSync?: boolean;
  autoSyncNeoDB?: boolean;
  syncInterval?: number;
  theme?: 'auto' | 'light' | 'dark';
  language?: string;
  notificationEnabled?: boolean;
  appearance?: 'auto' | 'light' | 'dark';
  accentColor?: string;
  grayColor?: string;
  sehuatangHideViewed?: boolean;
}

// ==================== Export / Import ====================

export interface ExportData {
  schema: 'umm-export';
  version: 2;
  exportedAt: string;
  stores: {
    [storeName: string]: Record<string, StoreRecord>; // key → StoreRecord
  };
  settings?: Partial<AppSettings>;
}

// ==================== PT ID Cache ====================

/** PT torrent → platform ID cache entry */
export interface PtIdCacheEntry {
  ptUrl: string; // PT torrent URL (normalized key)
  doubanId?: string; // e.g., "movie::37332784"
  imdbId?: string; // e.g., "movie::tt1375666"
  updatedAt: string; // ISO 8601
  schemaVersion?: number; // Cache entry schema version (0 or undefined = legacy)
}

// ==================== Adult AV ID ====================

/** Adult AV ID record (unified for javdb, sehuatang, etc.) */
export interface AdultAvId {
  source: 'javdb' | 'sehuatang' | 'mukaku';
  id: string; // AV ID uppercase
  url: string; // Source page URL
  rating: number; // 0-10
  updatedAt: string; // ISO 8601
}

/** Input for adding adult AV IDs */
export interface AdultAvIdInput {
  id: string;
  rating?: number;
  url?: string;
  updatedAt?: string;
}

// ==================== Messages → moved to ./messages (re-exported above) ====================

// ==================== Migration Status ====================

export interface MigrationStatus {
  currentRecordVersion: number;
  currentCacheVersion: number;
  currentExportVersion: number;
  minSupportedRecordVersion: number;
  minSupportedExportVersion: number;
  recordMigrationSteps: number;
  cacheMigrationSteps: number;
}

// ==================== Dataset Meta (WebDAV) ====================

export interface DatasetMeta {
  key: string; // store name, e.g. "douban_records"
  hash: string; // SHA-256 hex of sorted dataset content
  updatedAt: string; // ISO 8601, latest record update time
  recordCount: number; // number of records in this dataset
  dataVersion: number; // schema version for this dataset — v2 起哈希签名字段集随版本轴确定（v1 为歧义带，读侧逐代尝试）
}

export interface RemoteMeta {
  schema: 'umm-meta';
  version: 1;
  generatedAt: string;
  datasets: DatasetMeta[];
}

// ==================== WebDAV Sync Preview (ADR-027) ====================

/**
 * 同步计划模式：`sync` 走并集合并（幂等、永不减少记录）；`upload`/`download`
 * 保持显式覆盖/恢复语义，仅纳入预检与风险确认。
 */
export type SyncPlanMode = 'sync' | 'upload' | 'download';

/** 单表执行方向；`merge` 仅在 `sync` 模式出现。 */
export type SyncPlanDirection = 'upload' | 'download' | 'merge' | 'skip';

/** 预检产出的逐表对照行 —— 决定 UI 风险提示与执行侧指纹的字段集。 */
export interface SyncPlanRow {
  key: string;
  localCount: number;
  remoteCount: number;
  /**
   * 该侧最新记录时间；**计数为 0 或非合并数据集（如 `__settings__`）时为空串** ——
   * 那两种情况下的时间戳没有含义（本地空表由「现在」占位），透出会误导。
   */
  localLatest: string;
  remoteLatest: string;
  hashEqual: boolean;
  direction: SyncPlanDirection;
  /** 预估丢失记录数；`sync` 恒为 0（非零即合并语义回退的回归哨兵）。 */
  lossEstimate: number;
  /** `upload`：本地空而远端有数据 ⇒ 远端 dataset 将成不可达孤儿。 */
  orphansRemote: boolean;
  /**
   * `download`：本地版本会被云端覆盖 —— 覆盖两种情况：① 本地 `updatedAt` 更晚；
   * ② 两侧时间戳相同但 `hashEqual === false`（内容不同，下载按既有语义以云端为准）。
   * 后者原先不告警，会让「同时间戳、内容有别」的本地修订（典型是注释）被静默回退。
   */
  revertsNewer: boolean;
}

export interface SyncPlanTotals {
  upload: number;
  download: number;
  merge: number;
  skip: number;
  lossEstimate: number;
  orphaned: number;
  revertsNewer: number;
}

/** 预检结果（只读，未落任何数据）。 */
export interface SyncPreview {
  mode: SyncPlanMode;
  rows: SyncPlanRow[];
  totals: SyncPlanTotals;
}

// ==================== Statistics ====================

export interface Statistics {
  total: number;
  movie: number;
  tv: number;
  music: number;
  book: number;
  douban: number;
  imdb: number;
  neodb: number;
  tmdb: number;
  bilibili: number;
  youtube: number;
  bangumi: number;
}
