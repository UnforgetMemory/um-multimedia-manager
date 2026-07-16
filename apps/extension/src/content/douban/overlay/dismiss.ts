/**
 * Overlay dismiss helpers.
 *
 * Provides a single function to unmount a Vue app, to be wired to
 * window.__ummDismissDetailMask or called directly.
 */

import type { App } from 'vue'

/**
 * Unmount the Vue overlay app.
 *
 * Wire to window.__ummDismissDetailMask or call directly when the overlay
 * should be dismissed (e.g. detail page close button).  Additional cleanup
 * (intervals, DOM removal) is handled by the caller.
 */
export function dismissOverlay(app: App): void {
  try { app.unmount() } catch { /* noop */ }
}
