/**
 * Shared constants for options page tabs
 * Extracted to avoid duplication between RatingTab and LinkedTab
 */

export const PLATFORM_OPTIONS = [
  { value: 'douban', labelKey: 'platform.douban' as const },
  { value: 'imdb', labelKey: 'platform.imdb' as const },
  { value: 'neodb', labelKey: 'platform.neodb' as const },
  { value: 'tmdb', labelKey: 'platform.tmdb' as const },
  { value: 'bilibili', labelKey: 'platform.bilibili' as const },
  { value: 'youtube', labelKey: 'platform.youtube' as const },
  { value: 'jav_ids', labelKey: 'platform.jav' as const },
] as const

export const JAV_SOURCE_OPTIONS = [
  { value: 'javdb', labelKey: 'platform.javdb' as const },
  { value: 'sehuatang', labelKey: 'platform.sehuatang' as const },
  { value: 'local', labelKey: 'platform.local' as const },
] as const
