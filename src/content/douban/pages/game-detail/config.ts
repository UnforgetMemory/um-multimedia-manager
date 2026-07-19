import { definePageMount } from '../../mount-factory'
import { createApp } from 'vue'
import { hideNavForPage } from '../../shared/hide-nav'
import { Store } from '@/features/database'

export const mountGameDetail = definePageMount({
  cssPreset: 'game-detail',
  overlayId: 'umm-douban-overlay',
  importApp: () => import('./App.vue'),
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
  createApp: (RootCmp, data) => createApp(RootCmp, { data }),
  async afterMount(_shadow, app, _container, data) {
    if (!data.identity) return
    const recordPoller = setInterval(async () => {
      if (!data.identity) return
      const key = `${data.identity.type}::${data.identity.providerId}`
      const updated = await Store.dbGet('douban_records', key)
      if (updated && app._instance) {
        const vm = app._instance.proxy as unknown as Record<string, unknown>
        if (vm && typeof vm.updateRecord === 'function') {
          vm.updateRecord(updated)
        }
      }
    }, 3000)

    ;(window as unknown as Record<string, unknown>).__ummDismissDetailMask = () => {
      clearInterval(recordPoller)
      app.unmount()
    }
  },
})
