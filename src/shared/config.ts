/**
 * UMM 配置常量
 * 从 Tampermonkey 脚本迁移而来,适配 Chrome Extension 环境
 */

// 版本信息
export const VERSION = 2;

// 数据集存储键配置
export const DATASETS = {
  movie: {
    douban: "umm:v2:movie:douban",
    imdb: "umm:v2:movie:imdb",
    neodb: "umm:v2:movie:neodb",
    tmdb: "umm:v2:movie:tmdb",
  },
  tv: {
    neodb: "umm:v2:tv:neodb",
    tmdb: "umm:v2:tv:tmdb",
  },
  music: {
    douban: "umm:v2:music:douban",
    neodb: "umm:v2:music:neodb",
  },
} as const;

// 隔离区存储键
export const QUARANTINE_KEY = "umm:v2:quarantine:tv";

// 数据集遍历顺序
export const DATASET_ORDER: Array<[Domain, Provider]> = [
  ["movie", "douban"],
  ["movie", "imdb"],
  ["movie", "neodb"],
  ["movie", "tmdb"],
  ["tv", "neodb"],
  ["tv", "tmdb"],
  ["music", "douban"],
  ["music", "neodb"],
];

// 记录状态
export const STATUS = {
  DONE: "done",
  NONE: "none",
  WISH: "wish",
} as const;

// 设置项存储键
export const SETTINGS_KEYS = {
  WEBDAV_URL: "umm:settings:webdav:url",
  WEBDAV_USERNAME: "umm:settings:webdav:username",
  WEBDAV_PASSWORD: "umm:settings:webdav:password",
  NEODB_TOKEN: "umm:settings:neodb:token",
} as const;

// 遗留设置项键(用于数据迁移)
export const LEGACY_SETTINGS_KEYS = {
  WEBDAV_URL: ["um-mmw-webdav-url", "um-ml-webdav-url"],
  WEBDAV_USERNAME: ["um-mmw-webdav-username", "um-ml-webdav-username"],
  WEBDAV_PASSWORD: ["um-mmw-webdav-password", "um-ml-webdav-password"],
  NEODB_TOKEN: ["um-ml-neodb-api-token"],
} as const;

// 遗留数据键(用于数据迁移)
export const LEGACY_DATA_KEYS = {
  movie: {
    douban: ["um-mmw-douban"],
    imdb: ["um-mmw-imdb"],
    neodb: ["um-mmw-neodb"],
    tmdb: ["um-mmw-tmdb"],
  },
  music: {
    douban: ["um-ml-douban"],
    neodb: ["um-ml-neodb"],
  },
} as const;

// V1 版本数据键(用于数据迁移)
export const PREVIOUS_DATA_KEYS = {
  movie: {
    douban: ["umm:v1:movie:douban"],
    imdb: ["umm:v1:movie:imdb"],
    neodb: ["umm:v1:movie:neodb"],
    tmdb: ["umm:v1:movie:tmdb"],
  },
  tv: {
    neodb: ["umm:v1:tv:neodb"],
    tmdb: ["umm:v1:tv:tmdb"],
  },
  music: {
    douban: ["umm:v1:music:douban"],
    neodb: ["umm:v1:music:neodb"],
  },
} as const;

// UI 相关常量
export const UI = {
  PANEL_ID: "umm-panel-root",
  TOAST_ID: "umm-floating-toast",
  STATUS_CLASS: "umm-status-chip",
  MUKAKU_STATUS_CLASS: "umm-mukaku-status",
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
  API_PATH: "/prod/api/v1/getVideoDetail",
  LIST_API_PATH: "/prod/api/v1/getVideoList",
  APP_ID: "83768d9ad4",
  IDENTITY: "23734adac0301bccdcb107c4aa21f96c",
  WATCHED_SET_KEY: "umm:cache:mukaku:watched",
  UNWATCHED_TTL_KEY: "umm:cache:mukaku:unwatched",
  UNWATCHED_TTL_MS: 60 * 60 * 1000, // 1小时
} as const;

// 完整配置对象
export const CONFIG = {
  SCRIPT_NAME: "UMM",
  STORAGE_VERSION: 2,
  MIGRATION_KEY: "umm:migration:v2:done",
  DATASETS,
  QUARANTINE_KEY,
  DATASET_ORDER,
  STATUS,
  SETTINGS_KEYS,
  LEGACY_SETTINGS_KEYS,
  LEGACY_DATA_KEYS,
  PREVIOUS_DATA_KEYS,
  UI,
  NETWORK,
  MUKAKU,
} as const;

// 类型定义
export type Domain = keyof typeof DATASETS;
// ✅ Provider 保持 string 类型，避免与多处 MediaRecord 定义冲突
// 实际使用时通过运行时校验保证有效性
export type Provider = string;
export type Status = typeof STATUS[keyof typeof STATUS];

// 标签映射
export const DOMAIN_LABEL: Record<Domain, string> = {
  movie: "影视",
  tv: "剧集",
  music: "音乐",
};

export const PROVIDER_LABEL: Record<string, string> = {
  douban: "豆瓣",
  imdb: "IMDb",
  neodb: "NeoDB",
  tmdb: "TMDB",
};

export const COMPLETION_LABEL: Record<Domain, string> = {
  movie: "已看",
  tv: "已看",
  music: "已听",
};

export const INCOMPLETE_LABEL: Record<Domain, string> = {
  movie: "未看",
  tv: "未看",
  music: "未听",
};

// ✅ 缓存配置常量
export const CACHE_CONFIG = {
  POPUP_TTL: 30 * 1000,        // Popup 数据缓存 30s
  API_REQUEST_TTL: 5 * 1000,   // API 请求缓存 5s
  DEBOUNCE_DELAY: 500,         // 防抖延迟 500ms
  REFRESH_DEBOUNCE: 300,       // 刷新防抖 300ms
} as const;
