import { definePageMount } from '../../mount-factory'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { hideNavForPage } from '../../shared/hide-nav'

export const mountPhotos = definePageMount({
  cssPreset: 'photos',
  overlayId: 'umm-photos-overlay',
  importApp: () => import('./App'),
  async beforeMount() {
    const { extractPhotosPageData } = await import('./photos-data')
    const data = extractPhotosPageData()
    if (!data) throw new Error('[UMM] Could not extract photos data from page')
    hideNavForPage({ type: 'photos' })
    return data
  },
  createApp: (RootCmp, container, data) => { const root = createRoot(container); root.render(React.createElement(RootCmp, { data })); return root },
})
