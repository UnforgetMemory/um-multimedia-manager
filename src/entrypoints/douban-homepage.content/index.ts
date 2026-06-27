import styleCss from './styles/component.css?raw'
import breakpointsCss from './styles/breakpoints.css?raw'
import commonCss from '@/entrypoints/content/shared/douban-common.css?raw'
import themeCss from '@/entrypoints/content/shared/douban-theme.css?raw'
import { defineContentScript } from 'wxt/utils/define-content-script'
import { createApp } from 'vue'
import App from './App.vue'
import { mountUmmOverlay } from '@/entrypoints/content/shared/overlay'
import { composeStyles } from '@/entrypoints/content/shared/css-composer'

export default defineContentScript({
  matches: ['https://movie.douban.com/'],
  runAt: 'document_idle',
  cssInjectionMode: 'manual',

  main() {
    const css = composeStyles(
      { name: 'theme', css: themeCss },
      { name: 'common', css: commonCss },
      { name: 'breakpoints', css: breakpointsCss },
      { name: 'components', css: styleCss },
    )
    mountUmmOverlay({
      overlayId: 'umm-douban-overlay',
      css,
      createApp: () => createApp(App),
    })
  },
})
