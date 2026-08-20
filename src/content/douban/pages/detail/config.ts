import { definePageMount } from '../../mount-factory'
import { createApp } from 'vue'
import { hideNavForPage } from '../../shared/hide-nav'
import { initDoulistReplacement } from '@/entrypoints/content/ui/doulist-replace'
import { initEventBus, onEvent } from '@/utils/event-bus'

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

    // Event-driven refresh: instead of a 3s polling loop, subscribe to the
    // background `record:updated` broadcast (see db.ts) and reload only when
    // this page's douban record actually changed (ADR-015).
    const { loadRecord } = await import('./detail-data')
    const identity = data.identity
    const key = identity ? `${identity.type}::${identity.providerId}` : ''

    /** Narrow the `record:updated` payload to the fields we consume. */
    const isRecordUpdatedPayload = (d: unknown): d is { storeName: string; key?: string } =>
      typeof d === 'object' && d !== null && typeof (d as { storeName?: unknown }).storeName === 'string'

    let unsubscribe = (): void => {}
    try {
      initEventBus()
      unsubscribe = onEvent('record:updated', (eventData: unknown) => {
        if (!identity) return
        if (!isRecordUpdatedPayload(eventData)) return
        if (eventData.storeName !== 'douban_records') return
        // Missing/bulk key → reload unconditionally; otherwise match our key.
        if (eventData.key && eventData.key !== '*' && eventData.key !== key) return
        void (async () => {
          try {
            const updated = await loadRecord(identity)
            if (updated && app._instance) {
              const vm = app._instance.proxy as unknown as Record<string, unknown>
              if (vm && typeof vm.updateRecord === 'function') {
                vm.updateRecord(updated)
              }
            }
          } catch (e: unknown) {
            console.warn('[UMM] detail record:updated reload failed:', e)
          }
        })()
      })
    } catch (e: unknown) {
      console.warn('[UMM] detail event-bus subscribe failed:', e)
    }

    ;(window as unknown as Record<string, unknown>).__ummDismissDetailMask = () => {
      unsubscribe()
      app.unmount()
    }
  },
})
