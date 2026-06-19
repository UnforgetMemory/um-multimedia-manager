import './style.css'
import { defineContentScript } from 'wxt/utils/define-content-script'
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root'
import { createApp } from 'vue'
import App from './App.vue'

let activeMqHandler: (() => void) | null = null

export default defineContentScript({
  matches: ['https://movie.douban.com/'],
  runAt: 'document_idle',
  cssInjectionMode: 'ui',

  async main(ctx) {
    const ui = await createShadowRootUi(ctx, {
      name: 'umm-douban-homepage',
      position: 'inline',
      anchor: 'body',
      append: 'first',
      onMount: (container, shadow) => {
        applyTheme(shadow)

        const listener = (changes: { theme?: { newValue?: string } }) => {
          if (changes.theme) applyTheme(shadow)
        }
        chrome.storage?.onChanged?.addListener(listener)

        const app = createApp(App)
        app.mount(container)
        return { app, listener }
      },
      onRemove: (payload) => {
        if (payload?.listener) {
          chrome.storage?.onChanged?.removeListener(payload.listener)
        }
        removeMqListener()
        payload?.app?.unmount()
      },
    })

    ui.mount()
  },
})

function removeMqListener(): void {
  if (activeMqHandler) {
    window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', activeMqHandler)
    activeMqHandler = null
  }
}

function applyTheme(shadow: ShadowRoot): void {
  const root = shadow.host as HTMLElement
  chrome.storage?.local?.get?.('theme', (data: { theme?: string }) => {
    const raw = data?.theme ?? 'light'
    let resolved: 'light' | 'dark'
    if (raw === 'auto') {
      resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    } else {
      resolved = raw === 'dark' ? 'dark' : 'light'
    }
    root.classList.remove('umm-theme--light', 'umm-theme--dark')
    root.classList.add(`umm-theme--${resolved}`)

    removeMqListener()

    if (raw === 'auto') {
      const handler = (): void => {
        const mql = window.matchMedia('(prefers-color-scheme: dark)')
        const autoResolved = mql.matches ? 'dark' : 'light'
        root.classList.remove('umm-theme--light', 'umm-theme--dark')
        root.classList.add(`umm-theme--${autoResolved}`)
      }
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', handler)
      activeMqHandler = handler
    }
  })
}
