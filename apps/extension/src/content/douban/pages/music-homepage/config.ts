import { definePageMount } from '../../mount-factory'
import { createApp } from 'vue'

export const mountMusicHomepage = definePageMount({
  cssPreset: 'music-homepage',
  overlayId: 'umm-douban-overlay',
  importApp: () => import('./App.vue'),
  createApp: (RootCmp) => createApp(RootCmp),
})
