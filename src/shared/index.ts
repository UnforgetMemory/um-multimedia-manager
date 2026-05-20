/**
 * 共享模块统一导出
 */

// 配置
export { CONFIG, DATASETS, STATUS, UI, NETWORK, MUKAKU } from './config';
export type { Domain, Provider, Status } from './config';
export {
  DOMAIN_LABEL,
  PROVIDER_LABEL,
  COMPLETION_LABEL,
  INCOMPLETE_LABEL,
  DATASET_ORDER,
  QUARANTINE_KEY,
  SETTINGS_KEYS,
  LEGACY_SETTINGS_KEYS,
  LEGACY_DATA_KEYS,
  PREVIOUS_DATA_KEYS,
} from './config';

// 类型定义
export type {
  MediaRecord,
  QuarantineEntry,
  UrlIdentity,
  WebDAVSettings,
  NeoDBSettings,
  AppSettings,
  ExportData,
  MessagePayload,
  ToastType,
  ToastOptions,
  QueueTask,
  QueueState,
} from './types'

// 消息通信类型
export type {
  RuntimeMessage,
  MessageResponse,
  SendResponseFn,
} from './types/messages';

// 模型
export { Identity } from './models/identity';
export { RecordModel } from './models/record';
// Store (legacy) 已废弃,请使用 indexedDBStore
// export * as Store from './models/store';

// 适配器（新 IndexedDB 架构）
// StoreAdapter 已废弃,使用统一的 database API
export * as Store from './api/database';

// 工具函数
export { Utils } from './utils';
