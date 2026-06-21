import styleCss from './style.css?raw'
import breakpointsCss from './styles/breakpoints.css?raw'
import { defineContentScript } from 'wxt/utils/define-content-script'
import { createApp } from 'vue'
import App from './App.vue'

const OVERLAY_ID = 'umm-douban-overlay'

export default defineContentScript({
  matches: ['https://movie.douban.com/'],
  runAt: 'document_idle',
  cssInjectionMode: 'manual',

  main() {
    const overlay = document.getElementById(OVERLAY_ID)
    if (!overlay?.shadowRoot) return

    const shadow = overlay.shadowRoot

    const style = document.createElement('style')
    style.textContent = breakpointsCss.replace(/:root\b/g, ':host') + styleCss
    shadow.appendChild(style)

    // Apply theme synchronously from data-theme before removing loading
    const host = shadow.host as HTMLElement
    const theme = host.getAttribute('data-theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    host.classList.remove('umm-theme--light', 'umm-theme--dark')
    host.classList.add(`umm-theme--${theme}`)
    chrome.storage?.onChanged?.addListener((changes, area) => {
      if (area === 'local' && changes['umm:appearance']) {
        chrome.storage?.local?.get?.('umm:appearance', (data: Record<string, unknown>) => {
          const raw = (data['umm:appearance'] as Record<string, unknown> | undefined)?.theme as string ?? 'light'
          const t = raw === 'dark' ? 'dark' : (raw === 'light' ? 'light' : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'))
          host.classList.remove('umm-theme--light', 'umm-theme--dark')
          host.classList.add(`umm-theme--${t}`)
        })
      }
    })

    const loading = shadow.querySelector('.ov-loading')
    if (loading) loading.remove()

    const app = createApp(App)
    const container = document.createElement('div')
    shadow.appendChild(container)
    app.mount(container)
  },
})
