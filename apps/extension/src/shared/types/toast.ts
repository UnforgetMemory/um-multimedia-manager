/**
 * Shared Toast Types and Constants
 *
 * Common toast type definitions and configuration constants
 * used by both Vue composable (options/popup) and DOM-based (content script) implementations.
 */

/** Toast notification types */
export type ToastType = 'success' | 'error' | 'info' | 'loading'

/** Maximum number of quick toasts visible simultaneously */
export const MAX_QUICK_TOASTS = 3

/** Auto-dismiss delay for non-loading toasts (ms) */
export const TOAST_AUTO_DISMISS_MS = 3000

/** Dedup window for identical toasts (ms) */
export const TOAST_DEDUP_HASH_MS = 500

/** Dedup window for same-title toasts (ms) */
export const TOAST_DEDUP_TITLE_MS = 2000

/** Container cleanup timeout (ms) */
export const TOAST_CONTAINER_CLEANUP_MS = 5 * 60 * 1000
