/**
 * Shadow DOM overlay creation.
 *
 * Injects page-level lock CSS, creates a shadow DOM host with loading
 * spinner, and syncs the theme onto the host element.
 */

import { startThemeSync } from './theme-sync'

/** Shadow root CSS for loading spinner (shared across all overlays) */
const SHADOW_CSS = `:host{--ov-bg:hsl(240 6% 10%);--ov-text:hsl(0 0% 98%);--ov-text-muted:hsl(0 0% 98%/0.5);--ov-ring:hsl(0 0% 98%/0.15);--ov-ring-top:hsl(0 0% 98%/0.8);background:var(--ov-bg);transition:background-color 0.3s ease,color 0.3s ease,border-color 0.3s ease}:host([data-theme="light"]){--ov-bg:hsl(0 0% 100%);--ov-text:hsl(240 10% 3.9%);--ov-text-muted:hsl(240 3.8% 46.1%);--ov-ring:hsl(0 0% 98%/0.15);--ov-ring-top:hsl(240 5.9% 10%/0.8);background:var(--ov-bg)}.ov-loading{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;color:var(--ov-text);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}.ov-spinner{width:40px;height:40px;border:3px solid var(--ov-ring);border-top-color:var(--ov-ring-top);border-radius:50%;animation:ov-spin .8s linear infinite;box-sizing:border-box}.ov-title{font-size:1.25rem;font-weight:600}.ov-subtitle{font-size:.8125rem;color:var(--ov-text-muted)}@keyframes ov-spin{to{transform:rotate(360deg)}}`

/** Page-level style element ID scoped to the overlay */
function getPageStyleId(overlayId: string): string {
  return `${overlayId}-page-style`
}

/** Page-level CSS to lock body and style overlay (injected into document root) */
function getPageCSS(overlayId: string): string {
  return `#${overlayId}{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;z-index:200!important;margin:0!important;padding:0!important;border:none!important;box-sizing:border-box!important;display:block!important;overflow-y:auto!important;background:hsl(240 6% 10%)!important;color-scheme:dark!important}#${overlayId}[data-theme="light"]{background:hsl(0 0% 100%)!important;color-scheme:light!important}body{overflow:hidden!important}`
}

export interface OverlayOptions {
  /** Unique overlay element ID */
  overlayId: string
  /** Subtitle text below "UMManager" */
  subtitle: string
  /** Whether to expose window.__ummDismissDetailMask() (detail page only) */
  exposeDismiss?: boolean
}

/**
 * Create a shadow DOM overlay with loading spinner.
 * Must be called at document_start.
 */
export function createOverlay(options: OverlayOptions): HTMLElement {
  const { overlayId, subtitle, exposeDismiss = false } = options
  const doc = document.documentElement
  if (!doc) return null as unknown as HTMLElement

  // 1. Inject page-level body lock CSS
  const pageStyle = document.createElement('style')
  pageStyle.id = getPageStyleId(overlayId)
  pageStyle.textContent = getPageCSS(overlayId)
  doc.appendChild(pageStyle)

  // 2. Create overlay element with shadow DOM
  const overlay = document.createElement('div')
  overlay.id = overlayId
  overlay.attachShadow({ mode: 'open' })
  doc.appendChild(overlay)

  // 3. Move to <body> on DOMContentLoaded (body may not exist at document_start)
  const moveToBody = () => {
    if (document.body && overlay.parentElement !== document.body) {
      document.body.appendChild(overlay)
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', moveToBody, { once: true })
  } else {
    moveToBody()
  }

  // 4. Inject shadow-root CSS
  const shadow = overlay.shadowRoot!
  const style = document.createElement('style')
  style.textContent = SHADOW_CSS
  shadow.appendChild(style)

  // 5. Create loading spinner
  const loading = document.createElement('div')
  loading.className = 'ov-loading'
  loading.innerHTML =
    '<div class="ov-spinner"></div>' +
    '<div class="ov-title">UMManager</div>' +
    `<div class="ov-subtitle">${subtitle}</div>`
  shadow.appendChild(loading)

  // 6. Sync theme onto host element
  const stopThemeSync = startThemeSync(overlay)

  // 7. Expose dismiss for document_idle handler (detail page only)
  if (exposeDismiss) {
    ;(window as unknown as Record<string, unknown>).__ummDismissDetailMask = () => {
      stopThemeSync()
      if (!overlay.parentNode) return
      loading.remove()
      const ps = document.getElementById(getPageStyleId(overlayId))
      if (ps) ps.remove()
      overlay.remove()
    }
  }

  return overlay
}
