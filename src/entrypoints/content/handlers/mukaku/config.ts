// ==================== 常量配置 ====================

export const MUKAKU_CONFIG = {
  API_PATH: '/prod/api/v1/getVideoDetail',
  LIST_API_PATH: '/prod/api/v1/getVideoList',
  APP_ID: '83768d9ad4',
  IDENTITY: '23734adac0301bccdcb107c4aa21f96c',
  WATCHED_SET_KEY: 'umm:cache:mukaku:watched',
  UNWATCHED_TTL_KEY: 'umm:cache:mukaku:unwatched',
  UNWATCHED_TTL_MS: 60 * 60 * 1000, // 1小时
  PROBE_CACHE_KEY: 'umm:cache:mukaku:probe',
  PROBE_CACHE_TTL_MS: 7 * 24 * 60 * 60 * 1000, // 7天
  // 内存缓存限制
  WATCHED_ID_CACHE_TTL: 30_000,        // watchedIdCache 30s TTL
  PROBE_CACHE_MAX: 500,                // probeCache 最大条目
}

export const NETWORK_CONFIG = {
  MAX_CONCURRENT: 10,
  MIN_DELAY_MS: 420,
  MAX_DELAY_MS: 980,
  TIMEOUT_MS: 15000,
}