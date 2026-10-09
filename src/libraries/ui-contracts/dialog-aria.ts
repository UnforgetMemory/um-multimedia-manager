/**
 * Modal dialog ARIA contract — single source for role / aria-modal / labelling.
 *
 * Consumed by content-script overlays (sehuatang menu, doulist dialog, interest
 * mark panel). SPA dialogs use reka-ui which owns the same pair internally; this
 * module is the light-DOM twin so every hand-built modal reads the same to AT.
 * Mirrors `toast-aria.ts`: role and the modal flag travel together.
 */

export interface DialogAriaOptions {
  /** Id of the visible title element. */
  labelledBy: string;
  /** Optional description id. */
  describedBy?: string;
}

/** Attribute bag for Vue `h()` / template bindings. */
export function dialogAriaAttrs(options: DialogAriaOptions): Record<string, string> {
  return {
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': options.labelledBy,
    ...(options.describedBy ? { 'aria-describedby': options.describedBy } : {}),
  };
}

/** Apply the modal dialog ARIA surface to `el`. */
export function applyDialogAria(el: HTMLElement, options: DialogAriaOptions): void {
  for (const [k, v] of Object.entries(dialogAriaAttrs(options))) el.setAttribute(k, v);
}

/** Heading semantics for the dialog title node. */
export function applyDialogTitleAria(el: HTMLElement, level: 1 | 2 | 3 = 2): void {
  el.setAttribute('role', 'heading');
  el.setAttribute('aria-level', String(level));
}

/**
 * Status badge live-region pair. `role=status` is polite; errors that must
 * interrupt use toast-aria's `alert` pair instead.
 */
export interface StatusBadgeAria {
  role: 'status';
  live: 'polite';
}

export const STATUS_BADGE_ARIA: StatusBadgeAria = { role: 'status', live: 'polite' };

/** Apply status-badge ARIA to `el` (injected chips, list markers, empty states). */
export function applyStatusBadgeAria(el: HTMLElement): void {
  el.setAttribute('role', STATUS_BADGE_ARIA.role);
  el.setAttribute('aria-live', STATUS_BADGE_ARIA.live);
}
