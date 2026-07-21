import { create } from 'zustand'
import { safeSendMessage } from '@/utils/context'
import type { StoreRecord, AdultAvId } from '@/types'

interface AppState {
  loading: boolean
  error: string | null
  dataReady: boolean
  records: StoreRecord[]
  adultAvItems: AdultAvId[]
  appVersion: string
  loadData: () => Promise<void>
}

export const useAppStore = create<AppState>((set, get) => ({
  loading: false,
  error: null,
  dataReady: false,
  records: [],
  adultAvItems: [],
  appVersion: (() => {
    try { return chrome.runtime.getManifest().version } catch { return '3.0.0' }
  })(),
  loadData: async () => {
    if (get().loading) return
    set({ loading: true, error: null })
    try {
      const [recordsRes, adultAvRes] = await Promise.all([
        safeSendMessage({ type: 'GET_ALL_RECORDS' }, { timeout: 10000, retries: 2 }),
        safeSendMessage({ type: 'ADULT_AV_GET_ALL' }, { timeout: 8000, retries: 1 }),
      ])
      if (!recordsRes?.success) throw new Error(recordsRes?.error || '获取数据失败')
      set({
        records: recordsRes.records,
        adultAvItems: adultAvRes?.success ? (adultAvRes.items || []) : [],
        dataReady: true,
      })
    } catch (e) {
      set({ error: '数据加载失败，请重试', records: [] })
    } finally {
      set({ loading: false })
    }
  },
}))
