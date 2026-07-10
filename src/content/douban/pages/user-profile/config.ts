import { definePageMount } from '../../mount-factory'
import { createApp } from 'vue'
import { hideNavForPage } from '../../shared/hide-nav'

export const mountUserProfile = definePageMount({
  cssPreset: 'user-profile',
  overlayId: 'umm-douban-overlay',
  importApp: () => import('./App.vue'),
  async beforeMount() {
    const { extractUserProfileData } = await import('./user-profile-data')

    // Retry extraction — movie/music/book sections may load async
    let data: import('./types').UserProfileData | null = null
    for (let i = 0; i < 5; i++) {
      data = extractUserProfileData()
      if (data && (data.movieStats.collect > 0 || data.musicStats.collect > 0 || data.bookStats.collect > 0)) break
      await new Promise((r) => setTimeout(r, 500 * (i + 1)))
    }
    if (!data) throw new Error('[UMM] Could not extract user profile data')
    hideNavForPage({ type: 'user-profile' })
    return data
  },
  createApp: (RootCmp, data) => createApp(RootCmp, { data }),
})
