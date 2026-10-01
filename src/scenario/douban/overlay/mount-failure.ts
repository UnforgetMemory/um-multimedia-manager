/**
 * Non-blocking mount-failure affordance in the LIGHT DOM.
 *
 * When an overlay fails to mount, the shell (full-screen fixed panel +
 * body scroll lock) is torn down by the caller; this widget replaces it
 * with a small corner card offering retry and dismiss. Inline styles only:
 * host pages must never receive bare-selector CSS from us.
 */

import { t } from '@/entrypoints/content/i18n';

const WIDGET_ID = 'umm-mount-failure';

const WIDGET_CSS =
  'position:fixed;right:16px;bottom:16px;z-index:2147483647;display:flex;' +
  'align-items:center;gap:8px;padding:10px 12px;border-radius:10px;' +
  'background:#1c1c1e;color:#f4f4f5;border:1px solid rgb(255 255 255/0.15);' +
  "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;" +
  'font-size:13px;box-shadow:0 6px 24px rgb(0 0 0/0.35)';

const BUTTON_CSS =
  'all:unset;cursor:pointer;padding:2px 10px;border-radius:6px;' +
  'border:1px solid rgb(255 255 255/0.25);font-size:12px;color:#f4f4f5';

export interface MountFailureOptions {
  /** Overlay id, kept for future per-overlay handling. */
  overlayId: string;
  /** Re-create the shell and re-run the mount. */
  onRetry: () => void;
}

/** Show (or replace) the failure widget. Idempotent per document. */
export function showMountFailure(options: MountFailureOptions): void {
  dismissMountFailure();

  const widget = document.createElement('div');
  widget.id = WIDGET_ID;
  widget.style.cssText = WIDGET_CSS;
  widget.setAttribute('role', 'alert');

  const label = document.createElement('span');
  label.textContent = t('douban.mount.failed');
  widget.appendChild(label);

  const retry = document.createElement('button');
  retry.type = 'button';
  retry.textContent = t('douban.mount.retry');
  retry.dataset['ummAct'] = 'retry';
  retry.style.cssText = BUTTON_CSS;
  retry.addEventListener('click', () => {
    dismissMountFailure();
    options.onRetry();
  });
  widget.appendChild(retry);

  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.textContent = '✕';
  dismiss.dataset['ummAct'] = 'dismiss';
  dismiss.setAttribute('aria-label', t('douban.mount.close'));
  dismiss.style.cssText = BUTTON_CSS;
  dismiss.addEventListener('click', dismissMountFailure);
  widget.appendChild(dismiss);

  (document.body ?? document.documentElement).appendChild(widget);
}

/** Remove the failure widget if present. */
export function dismissMountFailure(): void {
  const existing = document.getElementById(WIDGET_ID);
  if (existing) existing.remove();
}
