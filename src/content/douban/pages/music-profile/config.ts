import { definePageMount } from '../../mount-factory'
import { createApp } from 'vue'
import { hideNavForPage } from '../../shared/hide-nav'

export const mountMusicProfile = definePageMount({
  cssPreset: 'music-profile',
  overlayId: 'umm-douban-overlay',
  importApp: () => import('./App.vue'),
  async beforeMount() {
    const { extractMusicProfileData } = await import('./music-profile-data')

    let data: import('./types').MusicProfileData | null = null
    for (let i = 0; i < 5; i++) {
      data = extractMusicProfileData()
      if (data && data.stats.length > 0) break
      await new Promise((r) => setTimeout(r, 500 * (i + 1)))
    }
    if (!data) throw new Error('[UMM] Could not extract music profile data')
    hideNavForPage({ type: 'music-profile' })
    return data
  },
  createApp: (RootCmp, data) => createApp(RootCmp, { data }),
})
