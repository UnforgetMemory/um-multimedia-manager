/**
 * Public API — re-exports from sub-modules.
 *
 * Import path:  @/scenario/douban/overlay
 * (or  ./overlay  from within content/douban/)
 */

export { createOverlay, getOverlayShellOptions, removeOverlayShell } from './create-overlay';
export type { OverlayOptions } from './create-overlay';

export { mountUmmOverlay } from './mount-app';
export type { MountOptions } from './mount-app';

export { dismissMountFailure, showMountFailure } from './mount-failure';
export type { MountFailureOptions } from './mount-failure';

export { applyOverlayTheme, startThemeSync, THEME_KEY } from './theme-sync';
