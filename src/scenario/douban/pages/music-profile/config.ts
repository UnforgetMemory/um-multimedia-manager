import { definePageMount } from '../../mount-factory'
import { createApp } from 'vue'
import { hideNavForPage } from '../../shared/hide-nav'
import { withRetry } from '../../shared/retry'

export const mountMusicProfile = definePageMount({
  cssPreset: 'music-profile',
  overlayId: 'umm-douban-overlay',
  importApp: () => import('./App.vue'),
  async beforeMount() {
    const { extractMusicProfileData } = await import('./music-profile-data')

    const data: import('./types').MusicProfileData | null = await withRetry(
      () => extractMusicProfileData(),
      { attempts: 5, baseDelay: 500, isValid: (d) => d && d.stats.length > 0 },
    )
    if (!data) throw new Error('[UMM] Could not extract music profile data')
    hideNavForPage({ type: 'music-profile' })
    return data
  },
  createApp: (RootCmp, data) => createApp(RootCmp, { data }),
})
