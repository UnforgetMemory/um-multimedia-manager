/**
 * Backward-compatible re-export.
 *
 * All theme logic migrated to src/content/douban/overlay/theme-sync.ts.
 * This file re-exports from the new location so existing imports from
 * '@/content/douban/shared/theme-sync' continue to work.
 */

export {
  THEME_KEY,
  getThemeFromStorage,
  resolveTheme,
} from '../overlay/theme-sync'
