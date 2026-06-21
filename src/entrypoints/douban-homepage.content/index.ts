import styleCss from './style.css?raw'
import breakpointsCss from './styles/breakpoints.css?raw'
import { defineContentScript } from 'wxt/utils/define-content-script'
import { createApp } from 'vue'
import App from './App.vue'

const OVERLAY_ID = 'umm-douban-overlay'
let activeMqHandler: (() => void) | null = null

export default defineContentScript({
  matches: ['https://movie.douban.com/'],
  runAt: 'document_idle',
  cssInjectionMode: 'manual',

  main() {
    const overlay = document.getElementById(OVERLAY_ID)
    if (!overlay?.shadowRoot) return

    const shadow = overlay.shadowRoot

    const loading = shadow.querySelector('.ov-loading')
    if (loading) loading.remove()

    const style = document.createElement('style')
    style.textContent = breakpointsCss.replace(/:root\b/g, ':host') + styleCss
    shadow.appendChild(style)

    applyTheme(shadow)
    const THEME_KEY = 'umm:appearance'
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes[THEME_KEY]) applyTheme(shadow)
    }
    chrome.storage?.onChanged?.addListener(listener)

    const app = createApp(App)
    const container = document.createElement('div')
    shadow.appendChild(container)
    app.mount(container)
  },
})

function removeMqListener(): void {
  if (activeMqHandler) {
    window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', activeMqHandler)
    activeMqHandler = null
  }
}

function applyTheme(shadow: ShadowRoot): void {
  const host = shadow.host as HTMLElement
  const THEME_KEY = 'umm:appearance'
  chrome.storage?.local?.get?.(THEME_KEY, (data: Record<string, unknown>) => {
    const raw = (data[THEME_KEY] as Record<string, unknown> | undefined)?.theme as string ?? 'light'
    let resolved: 'light' | 'dark'
    if (raw === 'auto') {
      resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    } else {
      resolved = raw === 'dark' ? 'dark' : 'light'
    }
    host.classList.remove('umm-theme--light', 'umm-theme--dark')
    host.classList.add(`umm-theme--${resolved}`)

    removeMqListener()

    if (raw === 'auto') {
      const handler = (): void => {
        const mql = window.matchMedia('(prefers-color-scheme: dark)')
        const autoResolved = mql.matches ? 'dark' : 'light'
        host.classList.remove('umm-theme--light', 'umm-theme--dark')
        host.classList.add(`umm-theme--${autoResolved}`)
      }
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', handler)
      activeMqHandler = handler
    }
  })
}
