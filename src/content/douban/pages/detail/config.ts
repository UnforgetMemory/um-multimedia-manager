import { definePageMount } from '../../mount-factory'
import { createApp } from 'vue'
import { hideNavForPage } from '../../shared/hide-nav'
import { initDoulistReplacement } from '@/entrypoints/content/ui/doulist-replace'

export const mountDetail = definePageMount({
  cssPreset: 'detail',
  overlayId: 'umm-detail-mask',
  importApp: () => import('./App.vue'),
  async beforeMount() {
    const { extractDetailData, loadRecord } = await import('./detail-data')
    const detailData = await extractDetailData()
    if (!detailData) throw new Error('[UMM] Could not extract detail data from page')
    detailData.record = await loadRecord(detailData.identity)
    const mediaType = location.href.includes('music.douban.com')
      ? 'music'
      : location.href.includes('book.douban.com')
        ? 'book'
        : 'movie'
    hideNavForPage({ type: 'detail', mediaType })
    return detailData
  },
  createApp: (RootCmp, data) => createApp(RootCmp, { detailData: data }),
  async afterMount(_shadow, app, _container, data) {
    // Initialize doulist modal click handler ("添加到片单" / "+ 添加到书单")
    if (data.identity) {
      initDoulistReplacement(data.identity)
    }

    // Re-import loadRecord for the polling loop (bundler cache ensures no overhead)
    const { loadRecord } = await import('./detail-data')
    const recordPoller = setInterval(async () => {
      if (!data.identity) return
      const updated = await loadRecord(data.identity)
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
