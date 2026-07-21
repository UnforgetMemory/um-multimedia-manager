import { definePageMount } from '../../mount-factory'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { hideNavForPage } from '../../shared/hide-nav'

export const mountTrailer = definePageMount({
  cssPreset: 'trailer',
  overlayId: 'umm-trailer-overlay',
  importApp: () => import('./App'),
  async beforeMount() {
    const { extractTrailerData } = await import('./trailer-data')
    const data = extractTrailerData()
    if (!data) throw new Error('[UMM] Could not extract trailer data')
    hideNavForPage({ type: 'trailer' })

    // Disable native video player to prevent auto-play / audio bleed
    document.querySelectorAll<HTMLVideoElement>('video').forEach((v) => {
      v.pause()
      v.removeAttribute('src')
      v.load()
    })
    // Remove native player containers entirely
    document.querySelectorAll<HTMLElement>(
      '#player, #movie_player, .html5-video-container, .stage-cont',
    ).forEach((el) => {
      el.remove()
    })

    return data
  },
  createApp: (RootCmp, container, data) => { const root = createRoot(container); root.render(React.createElement(RootCmp, { data })); return root },
})
