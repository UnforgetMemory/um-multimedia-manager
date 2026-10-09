/**
 * Toast a11y contract — single source for the live-region semantics of each toast type.
 *
 * Consumed by the SPA container, the content-script FloatingToast and the background
 * inline injector; all renderers must agree: errors interrupt (alert/assertive),
 * everything else announces politely (status/polite). role=alert implies assertive,
 * so role and aria-live are exported as one pair to keep them consistent.
 */

import type { ToastType } from './toast';

export interface ToastAria {
  role: 'alert' | 'status';
  live: 'assertive' | 'polite';
}

const TOAST_ARIA: Record<ToastType, ToastAria> = {
  success: { role: 'status', live: 'polite' },
  error: { role: 'alert', live: 'assertive' },
  info: { role: 'status', live: 'polite' },
  loading: { role: 'status', live: 'polite' },
};

/** ARIA pair for a toast type; unknown types degrade to the polite info pair. */
export function toastAria(type: string): ToastAria {
  return TOAST_ARIA[type as ToastType] ?? TOAST_ARIA.info;
}
