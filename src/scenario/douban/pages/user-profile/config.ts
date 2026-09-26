import { definePageMount } from '../../mount-factory'
import { createApp } from 'vue'
import { hideNavForPage } from '../../shared/hide-nav'
import { withRetry } from '../../shared/retry'

export const mountUserProfile = definePageMount({
  cssPreset: 'user-profile',
  overlayId: 'umm-douban-overlay',
  importApp: () => import('./App.vue'),
  async beforeMount() {
    const { extractUserProfileData } = await import('./user-profile-data')

    // Retry extraction — movie/music/book sections may load async
    const data: import('./types').UserProfileData | null = await withRetry(
      () => extractUserProfileData(),
      { attempts: 5, baseDelay: 500, isValid: (d) => d && (d.movieStats.collect > 0 || d.musicStats.collect > 0 || d.bookStats.collect > 0) },
    )
    if (!data) throw new Error('[UMM] Could not extract user profile data')
    hideNavForPage({ type: 'user-profile' })
    return data
  },
  createApp: (RootCmp, data) => createApp(RootCmp, { data }),
})
