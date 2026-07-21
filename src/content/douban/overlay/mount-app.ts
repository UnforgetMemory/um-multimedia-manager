/**
 * React app mounting inside an existing shadow DOM overlay.
 *
 * Injects page CSS, syncs the theme class, removes the loading spinner,
 * creates the React app via a factory, mounts it, and runs an optional
 * afterMount hook.
 */

import type { Root } from 'react-dom/client'

export interface MountOptions {
  overlayId: string
  css: string
  beforeMount?: (shadow: ShadowRoot) => unknown | Promise<unknown>
  createApp: (shadow: ShadowRoot, container: HTMLDivElement, ctx?: unknown) => Root
  afterMount?: (shadow: ShadowRoot, root: Root, container: HTMLDivElement, ctx?: unknown) => void | Promise<void>
}

/**
 * Mount a React app inside an existing shadow DOM overlay.
 * Creates the style element, applies theme class, then async-initializes
 * the app (beforeMount → loading remove → createRoot → afterMount).
 */
export function mountUmmOverlay(options: MountOptions): void {
  const overlay = document.getElementById(options.overlayId)
  if (!overlay?.shadowRoot) return

  const shadow = overlay.shadowRoot

  // Inject page CSS
  const style = document.createElement('style')
  style.textContent = options.css
  shadow.appendChild(style)

  // Sync theme class onto host
  const host = shadow.host as HTMLElement
  const theme = host.getAttribute('data-theme') ||
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  host.classList.remove('umm-theme--light', 'umm-theme--dark')
  host.classList.add(`umm-theme--${theme}`)

  const finalize = async () => {
    // Sync host theme to page localStorage before React mounts —
    // the theme store (inside Shadow DOM) reads from localStorage on
    // the page origin via useStorage, NOT from chrome.storage.local.
    // Without this sync it always defaults to 'auto'.
    const hostTheme = host.getAttribute('data-theme') ||
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    try { localStorage.setItem('umm:appearance', JSON.stringify({ theme: hostTheme })) } catch {
      /* localStorage may be restricted (private browsing, quota). Non-critical. */
    }

    let ctx: unknown
    if (options.beforeMount) {
      ctx = await options.beforeMount(shadow)
    }

    const loading = shadow.querySelector('.ov-loading')
    if (loading) loading.remove()

    const container = document.createElement('div')
    shadow.appendChild(container)
    const root = options.createApp(shadow, container, ctx)

    if (options.afterMount) {
      await options.afterMount(shadow, root, container, ctx)
    }
  }

  finalize().catch((err) => {
    console.warn('[UMM] mountUmmOverlay error:', err)
    // Remove loading spinner so the page isn't stuck on an infinite spinner
    const loading = shadow.querySelector('.ov-loading')
    if (loading) loading.remove()
    // Show an error indicator
    const errorEl = document.createElement('div')
    errorEl.style.cssText = 'padding:40px;text-align:center;color:var(--umm-color-text-muted,#999);font-size:14px'
    errorEl.textContent = 'UMM · 加载失败'
    shadow.appendChild(errorEl)
  })
}
