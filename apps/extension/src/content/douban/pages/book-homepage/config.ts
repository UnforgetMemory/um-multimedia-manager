import { definePageMount } from '../../mount-factory'
import { createApp } from 'vue'

export const mountBookHomepage = definePageMount({
  cssPreset: 'book-homepage',
  overlayId: 'umm-douban-overlay',
  importApp: () => import('./App.vue'),
  createApp: (RootCmp) => createApp(RootCmp),
})
