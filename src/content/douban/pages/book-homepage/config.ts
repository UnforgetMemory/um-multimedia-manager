import { definePageMount } from '../../mount-factory'
import React from 'react'
import { createRoot } from 'react-dom/client'

export const mountBookHomepage = definePageMount({
  cssPreset: 'book-homepage',
  overlayId: 'umm-douban-overlay',
  importApp: () => import('./App'),
  createApp: (RootCmp, container) => { const root = createRoot(container); root.render(React.createElement(RootCmp)); return root },
})
