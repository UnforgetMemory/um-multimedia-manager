import type { App } from 'vue'

/**
 * Shared Overlay Creation Logic — migrated to content/douban/
 *
 * Provides:
 * - createOverlay(): Create shadow DOM overlay with loading spinner (document_start)
 * - mountUmmOverlay(): Mount Vue app inside existing shadow DOM (document_idle)
 * - applyOverlayTheme() / startThemeSync(): Theme sync helpers
 */

const THEME_KEY = 'umm:appearance'

/** Shadow root CSS for loading spinner (shared across all overlays) */
const SHADOW_CSS = `
:host{--ov-bg:hsl(240 6% 10%);--ov-text:hsl(0 0% 98%);--ov-text-muted:hsl(0 0% 98%/0.5);--ov-ring:hsl(0 0% 98%/0.15);--ov-ring-top:hsl(0 0% 98%/0.8);background:var(--ov-bg);transition:background-color 0.3s ease,color 0.3s ease,border-color 0.3s ease}
:host([data-theme="light"]){--ov-bg:hsl(0 0% 100%);--ov-text:hsl(240 10% 3.9%);--ov-text-muted:hsl(240 3.8% 46.1%);--ov-ring:hsl(0 0% 98%/0.15);--ov-ring-top:hsl(240 5.9% 10%/0.8);background:var(--ov-bg)}
.ov-loading{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;color:var(--ov-text);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
.ov-spinner{width:40px;height:40px;border:3px solid var(--ov-ring);border-top-color:var(--ov-ring-top);border-radius:50%;animation:ov-spin .8s linear infinite;box-sizing:border-box}
.ov-title{font-size:1.25rem;font-weight:600}
.ov-subtitle{font-size:.8125rem;color:var(--ov-text-muted)}
@keyframes ov-spin{to{transform:rotate(360deg)}}
`

/** Page-level CSS to lock body and style overlay (injected into document root) */
function getPageStyleId(overlayId: string): string {
  return `${overlayId}-page-style`
}

function getPageCSS(overlayId: string): string {
  return `#${overlayId}{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;z-index:200!important;margin:0!important;padding:0!important;border:none!important;box-sizing:border-box!important;display:block!important;overflow-y:auto!important;background:hsl(240 6% 10%)!important;color-scheme:dark!important}#${overlayId}[data-theme="light"]{background:hsl(0 0% 100%)!important;color-scheme:light!important}body{overflow:hidden!important}`
}

/** Apply theme to overlay host element + sync html background to match */
export function applyOverlayTheme(host: HTMLElement): void {
  function setTheme(mode: string) {
    const theme = mode === 'dark' ? 'dark'
      : mode === 'light' ? 'light'
      : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    host.setAttribute('data-theme', theme)
    host.classList.remove('umm-theme--light', 'umm-theme--dark')
    host.classList.add(`umm-theme--${theme}`)
    // Sync html background: overlay.css uses prefers-color-scheme as baseline;
    // explicit light/dark setting (opposite to OS) needs JS override
    const bgColor = theme === 'dark' ? 'hsl(240 6% 10%)' : 'hsl(0 0% 100%)'
    let styleEl = document.getElementById('umm-html-theme') as HTMLStyleElement | null
    if (!styleEl) {
      styleEl = document.createElement('style')
      styleEl.id = 'umm-html-theme'
      document.documentElement.appendChild(styleEl)
    }
    styleEl.textContent = `html { background: ${bgColor} !important; }`
  }
  const fallback = () => setTheme('auto')
  try {
    chrome.storage.local.get([THEME_KEY], (result) => {
      if (chrome.runtime.lastError) { fallback(); return }
      const raw = result[THEME_KEY] as Record<string, unknown> | undefined
      setTheme((raw?.theme as string) ?? 'auto')
    })
  } catch { fallback() }
}

/** Listen for theme changes and update overlay */
export function startThemeSync(host: HTMLElement): void {
  applyOverlayTheme(host)
  function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
    let timer: ReturnType<typeof setTimeout>
    return ((...args: any[]) => {
      clearTimeout(timer)
      timer = setTimeout(() => fn(...args), ms)
    }) as T
  }
  const debouncedApply = debounce(() => applyOverlayTheme(host), 100)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[THEME_KEY]) debouncedApply()
  })
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
  if (!doc) return null as any

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
    if (document.body && overlay.parentElement !== document.body)
      document.body.appendChild(overlay)
  }
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', moveToBody, { once: true })
  else
    moveToBody()

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

  // 6. Sync theme
  startThemeSync(overlay)

  // 7. Expose dismiss for document_idle handler (detail page only)
  if (exposeDismiss) {
    ;(window as unknown as Record<string, unknown>).__ummDismissDetailMask = () => {
      if (!overlay.parentNode) return
      loading.remove()
      const ps = document.getElementById(getPageStyleId(overlayId))
      if (ps) ps.remove()
      overlay.remove()
    }
  }

  return overlay
}

export interface MountOptions {
  overlayId: string
  css: string
  beforeMount?: (shadow: ShadowRoot) => unknown | Promise<unknown>
  createApp: (shadow: ShadowRoot, ctx?: unknown) => App
  afterMount?: (shadow: ShadowRoot, app: App, container: HTMLDivElement, ctx?: unknown) => void | Promise<void>
}

/**
 * Mount a Vue app inside an existing shadow DOM overlay.
 * Creates the style element, applies theme class, then async-initializes
 * the app (beforeMount → loading remove → createApp → afterMount).
 */
export function mountUmmOverlay(options: MountOptions): void {
  const overlay = document.getElementById(options.overlayId)
  if (!overlay?.shadowRoot) return

  const shadow = overlay.shadowRoot

  const style = document.createElement('style')
  style.textContent = options.css
  shadow.appendChild(style)

  const host = shadow.host as HTMLElement
  const theme = host.getAttribute('data-theme') ||
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  host.classList.remove('umm-theme--light', 'umm-theme--dark')
  host.classList.add(`umm-theme--${theme}`)

  const finalize = async () => {
    // Sync host theme into page localStorage before Vue mounts —
    // the theme store (inside Shadow DOM) reads from localStorage on
    // the page origin (movie.douban.com) via useStorage, NOT from
    // chrome.storage.local. Without this sync it always defaults to 'auto'.
    const hostTheme = host.getAttribute('data-theme') ||
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    try { localStorage.setItem('umm:appearance', JSON.stringify({ theme: hostTheme })) } catch (_) {}

    let ctx: unknown
    if (options.beforeMount) {
      ctx = await options.beforeMount(shadow)
    }

    const loading = shadow.querySelector('.ov-loading')
    if (loading) loading.remove()

    const container = document.createElement('div')
    shadow.appendChild(container)
    const app = options.createApp(shadow, ctx)
    app.mount(container)

    if (options.afterMount) {
      await options.afterMount(shadow, app, container, ctx)
    }
  }

  finalize().catch((err) => {
    console.warn('[UMM] mountUmmOverlay error:', err)
  })
}