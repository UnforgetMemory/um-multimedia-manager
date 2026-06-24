/**
 * Douban detail page — early injection (document_start)
 *
 * Fully mirrors homepage/search overlay loading pattern:
 *  - Shadow DOM overlay with :host CSS scoping
 *  - chrome.storage.local.get for theme (async callback, same as homepage)
 *  - Loading spinner inside shadow root
 *  - Append to <html> first, move to <body> on DOMContentLoaded
 *  - expose window.__ummDismissDetailMask() for document_idle handler
 */

import { defineContentScript } from 'wxt/utils/define-content-script'

const OVERLAY_ID = 'umm-detail-mask'
const THEME_KEY = 'umm:appearance'

export default defineContentScript({
  matches: [
    '*://movie.douban.com/subject/*',
    '*://music.douban.com/subject/*',
  ],
  runAt: 'document_start',

  main() {
    const doc = document.documentElement
    if (!doc) return

    // 1. Inject page-level body lock + beautify CSS (prevent scroll-FOUC)
    const pageStyle = document.createElement('style')
    pageStyle.id = 'umm-detail-early-page-style'
    pageStyle.textContent = `
      #${OVERLAY_ID}{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;z-index:2147483647!important;margin:0!important;padding:0!important;border:none!important;box-sizing:border-box!important;display:block!important;overflow-y:auto!important}
      body{overflow:hidden!important}
    `
    doc.appendChild(pageStyle)

    // 2. Create overlay element with shadow DOM
    const overlay = document.createElement('div')
    overlay.id = OVERLAY_ID
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

    // 4. Inject shadow-root CSS (:host scoped, theme-aware)
    const shadow = overlay.shadowRoot!
    const style = document.createElement('style')
    style.textContent = `
      :host{--ov-bg:hsl(240 6% 10%);--ov-text:hsl(0 0% 98%);--ov-text-muted:hsl(0 0% 98%/0.5);--ov-ring:hsl(0 0% 98%/0.15);--ov-ring-top:hsl(0 0% 98%/0.8);background:var(--ov-bg)}
      :host([data-theme="light"]){--ov-bg:hsl(0 0% 100%);--ov-text:hsl(240 10% 3.9%);--ov-text-muted:hsl(240 3.8% 46.1%);--ov-ring:hsl(0 0% 98%/0.15);--ov-ring-top:hsl(240 5.9% 10%/0.8);background:var(--ov-bg)}
      .ov-loading{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;color:var(--ov-text);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
      .ov-spinner{width:40px;height:40px;border:3px solid var(--ov-ring);border-top-color:var(--ov-ring-top);border-radius:50%;animation:ov-spin .8s linear infinite;box-sizing:border-box}
      .ov-title{font-size:1.25rem;font-weight:600}
      .ov-subtitle{font-size:.8125rem;color:var(--ov-text-muted)}
      @keyframes ov-spin{to{transform:rotate(360deg)}}
    `
    shadow.appendChild(style)

    // 5. Create loading spinner inside shadow root
    const loading = document.createElement('div')
    loading.className = 'ov-loading'
    loading.innerHTML =
      '<div class="ov-spinner"></div>' +
      '<div class="ov-title">UMManager</div>' +
      '<div class="ov-subtitle">\u52A0\u8F7D\u4E2D...</div>'
    shadow.appendChild(loading)

    // 6. Apply theme (same logic as homepage overlay)
    applyOverlayTheme(overlay)
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes[THEME_KEY]) applyOverlayTheme(overlay)
    })

    // 7. Expose dismiss for document_idle handler
    ;(window as unknown as Record<string, unknown>).__ummDismissDetailMask = () => dismissOverlay(overlay, loading)
  },
})

function applyOverlayTheme(host: HTMLElement): void {
  const fallback = () => {
    host.setAttribute('data-theme', window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  }
  try {
    chrome.storage.local.get([THEME_KEY], (result) => {
      if (chrome.runtime.lastError) { fallback(); return }
      const raw = result[THEME_KEY] as Record<string, unknown> | undefined
      const mode = (raw?.theme as string) ?? 'auto'
      if (mode === 'dark') host.setAttribute('data-theme', 'dark')
      else if (mode === 'light') host.setAttribute('data-theme', 'light')
      else host.setAttribute('data-theme', window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    })
  } catch { fallback() }
}

function dismissOverlay(overlay: HTMLElement, loading: HTMLElement): void {
  if (!overlay.parentNode) return
  loading.remove()
  const pageStyle = document.getElementById('umm-detail-early-page-style')
  if (pageStyle) pageStyle.remove()
  overlay.remove()
}
