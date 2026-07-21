import { definePageMount } from '../../mount-factory'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { hideNavForPage } from '../../shared/hide-nav'

export const mountBookProfile = definePageMount({
  cssPreset: 'book-profile',
  overlayId: 'umm-douban-overlay',
  importApp: () => import('./App'),
  async beforeMount() {
    const { extractBookProfileData } = await import('./data')

    // Retry extraction — data may load async
    let data: import('./types').BookProfileData | null = null
    for (let i = 0; i < 5; i++) {
      data = extractBookProfileData()
      if (data && (data.readBooks.length > 0 || data.recentReading.length > 0)) break
      await new Promise((r) => setTimeout(r, 500 * (i + 1)))
    }
    if (!data) throw new Error('[UMM] Could not extract book profile data')
    hideNavForPage({ type: 'book-profile' })
    return data
  },
  createApp: (RootCmp, container, data) => { const root = createRoot(container); root.render(React.createElement(RootCmp, { data })); return root },
})
