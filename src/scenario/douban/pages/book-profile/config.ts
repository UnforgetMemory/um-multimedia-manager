import { definePageMount } from '../../mount-factory'
import { createApp } from 'vue'
import { hideNavForPage } from '../../shared/hide-nav'
import { withRetry } from '../../shared/retry'

export const mountBookProfile = definePageMount({
  cssPreset: 'book-profile',
  overlayId: 'umm-douban-overlay',
  importApp: () => import('./App.vue'),
  async beforeMount() {
    const { extractBookProfileData } = await import('./data')

    // Retry extraction — data may load async
    const data: import('./types').BookProfileData | null = await withRetry(
      () => extractBookProfileData(),
      { attempts: 5, baseDelay: 500, isValid: (d) => d && (d.readBooks.length > 0 || d.recentReading.length > 0) },
    )
    if (!data) throw new Error('[UMM] Could not extract book profile data')
    hideNavForPage({ type: 'book-profile' })
    return data
  },
  createApp: (RootCmp, data) => createApp(RootCmp, { data }),
})
