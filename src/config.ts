/**
 * UMM 配置常量
 * 从 Tampermonkey 脚本迁移而来,适配 Chrome Extension 环境
 */

// 版本信息
export const VERSION = 2;

// ==================== Storage Key Constants ====================

/**
 * chrome.storage.local 存储键 — AppSettings 字段名即键名
 * AppSettings 类型定义在 @/types，字段名与键名一一对应
 */
export const STORAGE_KEYS = {
  WEBDAV_URL: 'webdavUrl',
  WEBDAV_USERNAME: 'webdavUsername',
  WEBDAV_PASSWORD: 'webdavPassword',
  NEODB_TOKEN: 'neodbToken',
  AUTO_SYNC: 'autoSync',
  AUTO_SYNC_NEO_DB: 'autoSyncNeoDB',
  SYNC_INTERVAL: 'syncInterval',
  THEME: 'theme',
  LANGUAGE: 'language',
  NOTIFICATION_ENABLED: 'notificationEnabled',
  APPEARANCE: 'appearance',
  ACCENT_COLOR: 'accentColor',
  GRAY_COLOR: 'grayColor',
  DEBUG_ENABLED: 'debugEnabled',
  LOG_LEVEL: 'logLevel',
} as const;

/** 聚合统计存储键 */
export const STATS_KEYS = {
  AGGREGATE: 'stats',
} as const;

/** 非 AppSettings 类型的其他存储键 */
export const MISC_KEYS = {
  QUARANTINE: 'quarantined-records',
  MIGRATION_VERSION: 'migration:version',
  DATA_VERSION: 'umm_data_version',
  SETTINGS_NESTED: 'settings',
} as const;

// 数据集遍历顺序
export const DATASET_ORDER: Array<[Domain, Provider]> = [
  ['movie', 'douban'],
  ['movie', 'imdb'],
  ['movie', 'neodb'],
  ['movie', 'tmdb'],
  ['tv', 'neodb'],
  ['tv', 'tmdb'],
  ['music', 'douban'],
  ['music', 'neodb'],
];

// 记录状态
export const STATUS = {
  DONE: 'done',
  NONE: 'none',
  WISH: 'wish',
} as const;

// UI 相关常量
export const UI = {
  PANEL_ID: 'umm-panel-root',
  TOAST_ID: 'umm-floating-toast',
  STATUS_CLASS: 'umm-status-chip',
  MUKAKU_STATUS_CLASS: 'umm-mukaku-status',
} as const;

// 网络配置
export const NETWORK = {
  TIMEOUT_MS: 15000,
  MAX_CONCURRENT: 2,
  MIN_DELAY_MS: 420,
  MAX_DELAY_MS: 980,
  TOAST_HIDE_MS: 2800,
  DETAIL_MIN_HEIGHT: 56,
} as const;

// Mukaku API 配置
export const MUKAKU = {
  API_PATH: '/prod/api/v1/getVideoDetail',
  LIST_API_PATH: '/prod/api/v1/getVideoList',
  APP_ID: '83768d9ad4',
  IDENTITY: '23734adac0301bccdcb107c4aa21f96c',
  WATCHED_SET_KEY: 'umm:cache:mukaku:watched',
  UNWATCHED_TTL_KEY: 'umm:cache:mukaku:unwatched',
  UNWATCHED_TTL_MS: 60 * 60 * 1000, // 1小时
} as const;

// 完整配置对象
export const CONFIG = {
  SCRIPT_NAME: 'UMM',
  STORAGE_VERSION: 2,
  MIGRATION_KEY: 'umm:migration:v2:done',
  DATASET_ORDER,
  STATUS,
  UI,
  NETWORK,
  MUKAKU,
} as const;

// 类型定义
export type Domain = 'movie' | 'tv' | 'music';
// ✅ Provider 保持 string 类型，避免与多处 MediaRecord 定义冲突
// 实际使用时通过运行时校验保证有效性
export type Provider = string;
export type Status = (typeof STATUS)[keyof typeof STATUS];
