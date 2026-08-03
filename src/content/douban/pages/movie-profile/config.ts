import { definePageMount } from '../../mount-factory'
import { createApp } from 'vue'
import { hideNavForPage } from '../../shared/hide-nav'
import { withRetry } from '../../shared/retry'

export const mountMovieProfile = definePageMount({
  cssPreset: 'movie-profile',
  overlayId: 'umm-douban-overlay',
  importApp: () => import('./App.vue'),
  async beforeMount() {
    const { extractMovieProfileData } = await import('./movie-profile-data')

    const data: import('./types').MovieProfileData | null = await withRetry(
      () => extractMovieProfileData(),
      { attempts: 5, baseDelay: 500, isValid: (d) => d && d.stats.length > 0 },
    )
    if (!data) throw new Error('[UMM] Could not extract movie profile data')
    hideNavForPage({ type: 'movie-profile' })
    return data
  },
  createApp: (RootCmp, data) => createApp(RootCmp, { data }),
})
