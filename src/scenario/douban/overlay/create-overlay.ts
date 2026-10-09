/**
 * Shadow DOM overlay creation.
 *
 * Injects page-level lock CSS, creates a shadow DOM host with loading
 * spinner, and syncs the theme onto the host element.
 */

import { startThemeSync } from './theme-sync';
import {
  COLOR_SURFACE_DARK,
  COLOR_SURFACE_LIGHT,
  COLOR_ACCENT_APPLE,
} from '@/entrypoints/content/styles/tokens';

/** Shadow root CSS for loading spinner (shared across all overlays).
 *  Colors mirror the DARK Vibrancy surface (--umm-static-vibrancy-0 #1c1c1e)
 *  and light surface (#f7f9fc); kept literal because this early overlay
 *  cannot wait for the ?raw token composition. Shell must equal the mounted
 *  app surface pixel-for-pixel — no seams. */
const SHADOW_CSS = `:host{--ov-bg:${COLOR_SURFACE_DARK};--ov-text:#f4f4f5;--ov-text-muted:rgb(255 255 255/0.58);--ov-ring:rgb(255 255 255/0.15);--ov-ring-top:${COLOR_ACCENT_APPLE};background:var(--ov-bg);transition:background-color 0.3s ease,color 0.3s ease,border-color 0.3s ease}:host([data-theme="light"]){--ov-bg:${COLOR_SURFACE_LIGHT};--ov-text:#151a23;--ov-text-muted:#5d6a81;--ov-ring:rgb(21 26 35/0.12);--ov-ring-top:var(--umm-ring-top-light, #4f6ef7);background:var(--ov-bg)}.ov-loading{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;color:var(--ov-text);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}.ov-spinner{width:40px;height:40px;border:3px solid var(--ov-ring);border-top-color:var(--ov-ring-top);border-radius:50%;animation:ov-spin .8s linear infinite;box-sizing:border-box}.ov-title{font-size:1.25rem;font-weight:600}.ov-subtitle{font-size:.8125rem;color:var(--ov-text-muted)}@keyframes ov-spin{to{transform:rotate(360deg)}}@media (prefers-reduced-motion: reduce){.ov-spinner{animation:none}:host{transition:none}}`;

/** Page-level style element ID scoped to the overlay */
function getPageStyleId(overlayId: string): string {
  return `${overlayId}-page-style`;
}

/** Page-level CSS to lock body and style overlay (injected into document root).
 *  Backgrounds mirror --umm-color-surface per theme (see SHADOW_CSS note). */
function getPageCSS(overlayId: string, zIndex: number): string {
  return `#${overlayId}{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;z-index:${zIndex}!important;margin:0!important;padding:0!important;border:none!important;box-sizing:border-box!important;display:block!important;overflow-y:auto!important;background:${COLOR_SURFACE_DARK}!important;color-scheme:dark!important}#${overlayId}[data-theme="light"]{background:${COLOR_SURFACE_LIGHT}!important;color-scheme:light!important}body{overflow:hidden!important}`;
}

export interface OverlayOptions {
  /** Unique overlay element ID */
  overlayId: string;
  /** Subtitle text below "UMManager" */
  subtitle: string;
  /** Page-level host z-index (default 200; sehuatang needs a higher tier to
   *  cover Discuz fixed chrome yet stay below global .umm-overlay panels). */
  zIndex?: number;
}

/** Everything needed to undo one shell: DOM nodes + theme disposer + options. */
interface ShellRecord {
  overlay: HTMLElement;
  pageStyle: HTMLStyleElement;
  disposeThemeSync: () => void;
  options: OverlayOptions;
}

/**
 * Live shells by overlay id. The page-level style locks `body` scroll and the
 * overlay paints an opaque full-screen wall, so every shell MUST be removable
 * — these refs are the only way to unlock the page when a mount fails.
 *
 * NOT the only source of truth: the map is module state, and this file is
 * inlined into BOTH content-script bundles (`douban-early` creates the shell,
 * `douban-main` performs the rollback and the retry). A map entry therefore is
 * invisible across the two, which made rollback a silent no-op. The same record
 * is also hung on the shell element itself, which both bundles can see.
 */
const shells = new Map<string, ShellRecord>();

/** Property key carrying the undo record on the shell element. */
const SHELL_RECORD = '__ummShellRecord' as const;

type ShellHost = HTMLElement & { [SHELL_RECORD]?: ShellRecord };

/** Read the undo record for a shell, preferring the element itself. */
function readShell(overlayId: string): ShellRecord | undefined {
  const hosted = document.getElementById(overlayId) as ShellHost | null;
  return hosted?.[SHELL_RECORD] ?? shells.get(overlayId);
}

/**
 * Create a shadow DOM overlay with loading spinner.
 * Must be called at document_start.
 */
export function createOverlay(options: OverlayOptions): HTMLElement {
  const { overlayId, subtitle, zIndex = 200 } = options;
  // Re-creating a live id (e.g. a mount retry) must not strand the old
  // shell's theme listener or duplicate its page-level lock. Check the document
  // as well as this bundle's map, since the existing shell may have been
  // created by the other bundle.
  if (shells.has(overlayId) || document.getElementById(overlayId)) {
    removeOverlayShell(overlayId);
  }
  // document_start guarantee: documentElement exists before any script runs.
  const doc = document.documentElement;

  // 1. Inject page-level body lock CSS
  const pageStyle = document.createElement('style');
  pageStyle.id = getPageStyleId(overlayId);
  pageStyle.textContent = getPageCSS(overlayId, zIndex);
  doc.appendChild(pageStyle);

  // 2. Create overlay element with shadow DOM
  const overlay = document.createElement('div');
  overlay.id = overlayId;
  overlay.attachShadow({ mode: 'open' });
  doc.appendChild(overlay);

  // 3. Move to <body> on DOMContentLoaded (body may not exist at document_start)
  const moveToBody = () => {
    if (document.body && overlay.parentElement !== document.body) {
      document.body.appendChild(overlay);
    }
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', moveToBody, { once: true });
  } else {
    moveToBody();
  }

  // 4. Inject shadow-root CSS
  const shadow = overlay.shadowRoot!;
  const style = document.createElement('style');
  style.textContent = SHADOW_CSS;
  shadow.appendChild(style);

  // 5. Create loading spinner
  const loading = document.createElement('div');
  loading.className = 'ov-loading';
  loading.innerHTML =
    '<div class="ov-spinner"></div>' +
    '<div class="ov-title">UMManager</div>' +
    `<div class="ov-subtitle">${subtitle}</div>`;
  shadow.appendChild(loading);

  // 6. Sync theme onto host element; keep the disposer so teardown can drop
  //    the storage listener (one shell, one listener — no accumulation).
  const disposeThemeSync = startThemeSync(overlay);

  const record: ShellRecord = { overlay, pageStyle, disposeThemeSync, options };
  shells.set(overlayId, record);
  // Also hang it on the element: the shell is created in the `douban-early`
  // bundle while the rollback/retry runs in `douban-main`, and a module-level
  // Map cannot cross that boundary. Without this the failure path left the
  // opaque wall and the body scroll lock in place.
  (overlay as ShellHost)[SHELL_RECORD] = record;

  return overlay;
}

/**
 * Tear down a shell completely: overlay element, page-level lock style (body
 * scrolls again), and the theme-sync listener. Safe to call on unknown ids.
 */
export function removeOverlayShell(overlayId: string): boolean {
  const shell = readShell(overlayId);
  if (shell) {
    shells.delete(overlayId);
    shell.disposeThemeSync();
    shell.pageStyle.remove();
    shell.overlay.remove();
    delete (shell.overlay as ShellHost)[SHELL_RECORD];
    return true;
  }
  // Nothing reachable from this bundle's registry, but the shell may still be
  // in the document (created by the other bundle before this map was even
  // consulted). Remove by DOM identity so a failed mount never strands a wall.
  const overlay = document.getElementById(overlayId);
  const pageStyle = document.getElementById(getPageStyleId(overlayId));
  if (!overlay && !pageStyle) return false;
  pageStyle?.remove();
  overlay?.remove();
  return true;
}

/** Options a shell was created with — lets a retry rebuild it identically. */
export function getOverlayShellOptions(overlayId: string): OverlayOptions | undefined {
  return readShell(overlayId)?.options;
}
