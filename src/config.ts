/**
 * UMM 配置常量
 * 从 Tampermonkey 脚本迁移而来,适配 Chrome Extension 环境
 */

import { Platform } from '@/domain/platform/Platform';

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

// 类型定义
export type Domain = 'movie' | 'tv' | 'music' | 'book' | 'game' | 'video';
// Provider 派生自 Platform.KNOWN — 单一平台清单来源,避免手工维护漂移。
export type Provider = (typeof Platform.KNOWN)[number];

