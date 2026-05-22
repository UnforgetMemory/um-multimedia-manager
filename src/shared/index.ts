/**
 * Shared Module Exports
 */

// Configuration
export { CONFIG, DATASETS, STATUS, UI, NETWORK, MUKAKU } from './config'
export type { Domain, Provider, Status } from './config'
export {
  DOMAIN_LABEL,
  PROVIDER_LABEL,
  COMPLETION_LABEL,
  INCOMPLETE_LABEL,
  DATASET_ORDER,
  SETTINGS_KEYS,
  LEGACY_SETTINGS_KEYS,
  LEGACY_DATA_KEYS,
  PREVIOUS_DATA_KEYS,
} from './config'

// Types (v6)
export type {
  StoreRecord,
  UrlIdentity,
  WebDAVSettings,
  NeoDBSettings,
  AppSettings,
  ExportData,
  Statistics,
  ToastType,
  ToastOptions,
  CacheItem,
  MigrationStatus,
} from './types'
export { makeRecordKey } from './types'
export type { RecordStoreName } from './types'

// Message communication types
export type {
  RuntimeMessage,
  MessageResponse,
  SendResponseFn,
} from './types/messages'

// Models
export { Identity } from './models/identity'

// Database API (thin message-passing layer)
export * as Store from './api/database'

// Utility
export { Utils } from './utils'
