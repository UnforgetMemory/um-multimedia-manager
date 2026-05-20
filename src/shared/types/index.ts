/**
 * 核心数据类型定义
 */

import type { Provider } from '../config';

// 媒体记录接口
export interface MediaRecord {
  // 联合主键字段
  provider: Provider      // douban/imdb/neodb/tmdb
  type: string           // movie/tv/music/book
  providerId: string     // 平台唯一 ID
  
  // 复合主键（自动生成）
  id?: string            // `${provider}:${type}:${providerId}`
  
  // 业务数据
  url: string             // 规范化 URL
  status: number         // 0=未看/听, 1=在看/听, 2=已看/已听
  rating: number         // 评分 0-10
  updatedAt?: string     // ISO 8601 更新时间
  
  // ✅ 新增：NeoDB 关联字段
  neodbUuid?: string      // NeoDB 作品的 UUID（catalog item uuid）
  neodbShelfUuid?: string // NeoDB 书架项的 UUID（shelf item uuid）
  
  // ✅ 增强：关联 ID 映射
  linkedIds?: {
    doubanId?: string
    imdbId?: string
    tmdbId?: string
    neodbId?: string      // NeoDB 作品 UUID（与 neodbUuid 相同，保持兼容）
  }
}

// 隔离区记录接口
export interface QuarantineEntry {
  provider: Provider      // douban/imdb/neodb/tmdb
  type: string           // movie/tv/music/book
  providerId: string     // 主键（与 records 一致）
  url: string
  status: number         // 0=未看/听, 1=在看/听, 2=已看/已听
  rating: number         // 评分 0-10
  updatedAt?: string     // ISO 8601 更新时间
  quarantineReason: string // 隔离原因
}

// URL 身份信息
export interface UrlIdentity {
  provider: Provider      // douban/imdb/neodb/tmdb
  type: string           // movie/tv/music/book
  providerId: string     // 平台唯一 ID
  url: string             // 标准 URL
}

// WebDAV 设置
export interface WebDAVSettings {
  webdavUrl: string;
  webdavUsername: string;
  webdavPassword: string;
}

// NeoDB 设置
export interface NeoDBSettings {
  neodbToken: string;
}

// 完整设置
export interface AppSettings extends WebDAVSettings, NeoDBSettings {
  autoSync?: boolean;
  syncInterval?: number;
  theme?: 'auto' | 'light' | 'dark';
  language?: string;
  notificationEnabled?: boolean;
  quarantineAutoClean?: boolean;
  quarantineRetentionDays?: number;
  
  // Radix UI 主题配置
  appearance?: 'auto' | 'light' | 'dark';  // 外观模式（自动/亮色/暗色）
  accentColor?: string;  // 强调色（默认 blue）
  grayColor?: string;    // 灰色系（默认 slate）
}

// 导出数据结构
export interface ExportData {
  schema: 'umm-export';
  version: number;
  exportedAt: string;
  datasets: {
    [provider: string]: {  // 按 provider 分组
      [type: string]: MediaRecord[];  // 再按 type 分组
    };
  };
  quarantine?: QuarantineEntry[];
  settings?: Partial<AppSettings>;
}

// 消息类型(Content Script ↔ Background ↔ Popup)
export type MessageType = 
  | 'SHOW_TOAST'
  | 'UPDATE_RECORD'
  | 'GET_ALL_RECORDS'
  | 'SYNC_DATA'
  | 'EXPORT_DATA'
  | 'IMPORT_DATA'
  | 'DELETE_RECORD'
  | 'GET_STATS'
  | 'TOGGLE_THEME';

export interface MessagePayloadMap {
  SHOW_TOAST: { type: ToastType; title: string; message?: string };
  UPDATE_RECORD: Omit<MediaRecord, 'id' | 'updatedAt'>;
  GET_ALL_RECORDS: void;
  SYNC_DATA: { direction: 'upload' | 'download' };
  EXPORT_DATA: ExportData;
  IMPORT_DATA: ExportData;
  DELETE_RECORD: { provider: Provider; type: string; providerId: string };
  GET_STATS: void;
  TOGGLE_THEME: { theme: 'light' | 'dark' | 'auto' };
}

export interface MessagePayload<T extends MessageType = MessageType> {
  type: T;
  payload?: MessagePayloadMap[T];
}

// Toast 通知类型
export type ToastType = 'loading' | 'success' | 'error' | 'info';

export interface ToastOptions {
  title: string;
  body?: string;
  type?: ToastType;
  hideMs?: number; // 自动隐藏时间(ms),0 表示不自动隐藏
}

// 请求队列任务
export interface QueueTask<T = any> {
  key: string;
  task: () => Promise<T>;
}

// 队列状态
export interface QueueState {
  queued: number;
  active: number;
  currentKey: string;
}

// 数据集映射（providerId -> MediaRecord）
export interface DatasetMap {
  [providerId: string]: MediaRecord;
}

// 存储值类型（用于 chrome.storage）
export type StorageValue = string | number | boolean | object | null | undefined;

// 缓存项接口
export interface CacheItem<T = unknown> {
  value: T;
  expiry: number; // 过期时间戳
}

// WebDAV Meta 数据结构
export interface DatasetMeta {
  key: string              // "movie:douban", "tv:neodb" 等
  version: number          // 数据格式版本
  timestamp: string        // ISO 8601 最后更新时间
  recordCount: number      // 记录数量
  hash: string             // SHA-256 哈希值
}

export interface WebDAVMeta {
  schema: 'umm-webdav-meta'
  version: 1
  generatedAt: string
  datasets: DatasetMeta[]
}
