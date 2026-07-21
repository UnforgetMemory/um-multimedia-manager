import { definePageMount } from '../../mount-factory'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { hideNavForPage } from '../../shared/hide-nav'
import { Store } from '@/features/database'
import { initDoulistReplacement } from '@/entrypoints/content/ui/doulist-replace'

export const mountGameDetail = definePageMount({
  cssPreset: 'game-detail',
  overlayId: 'umm-douban-overlay',
  importApp: () => import('./App'),
  async beforeMount() {
const { extractGameDetailData, enrichGameRecItems } = await import('./game-detail-data')
let data: import('./game-detail-data').GameDetailData | null = null
    for (let i = 0; i < 8; i++) {
      data = extractGameDetailData()
      if (data?.title) break
      await new Promise(r => setTimeout(r, 300 * (i + 1)))
    }
    if (!data) throw new Error('[UMM] Could not extract game detail data')

    if (data.identity) {
      const key = `${data.identity.type}::${data.identity.providerId}`
      const record = await Store.dbGet('douban_records', key)
      if (record) {
        if (record.status) data.initialStatus = record.status
        if (record.rating) data.initialRating = record.rating / 2
      }
    }

    data.recItems = await enrichGameRecItems(data.recItems)
    hideNavForPage({ type: 'game-detail' })
    return data
  },
  createApp: (RootCmp, container, data) => { const root = createRoot(container); root.render(React.createElement(RootCmp, { data })); return root },
  async afterMount(_shadow, root, _container, data) {
    // Initialize doulist modal click handler ("+ 添加到豆列")
    if (data.identity) {
      initDoulistReplacement(data.identity)
    }

    if (!data.identity) return
    const recordPoller = setInterval(async () => {
      if (!data.identity) return
      const key = `${data.identity.type}::${data.identity.providerId}`
      const updated = await Store.dbGet('douban_records', key)
      if (updated) {
        window.dispatchEvent(new CustomEvent('umm:record-updated', {
          detail: { record: updated, identity: data.identity },
        }))
      }
    }, 3000)

    ;(window as unknown as Record<string, unknown>).__ummDismissDetailMask = () => {
      clearInterval(recordPoller)
      root.unmount()
    }
  },
})
