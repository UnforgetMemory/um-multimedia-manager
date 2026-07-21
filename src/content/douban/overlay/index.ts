/**
 * Public API — re-exports from sub-modules.
 *
 * Import path:  @/content/douban/overlay
 * (or  ./overlay  from within content/douban/)
 */

export { createOverlay } from './create-overlay'
export type { OverlayOptions } from './create-overlay'

export { mountUmmOverlay } from './mount-app'
export type { MountOptions } from './mount-app'

export { applyOverlayTheme, startThemeSync, getThemeFromStorage, resolveTheme, THEME_KEY } from './theme-sync'
