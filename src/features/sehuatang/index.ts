/**
 * Sehuatang AV ID Store API
 * Wraps background message passing for sehuatang_avids IndexedDB operations
 */

import type { SehuatangAvId } from '@/types'
import { safeSendMessage } from '@/utils/context'

async function sendMsg(type: string, payload?: any): Promise<any> {
  const res = await safeSendMessage({ type, payload }, { timeout: 8000, retries: 1 })
  if (!res?.success) throw new Error(res?.error || `${type} failed`)
  return res
}

export const SehuatangStore = {
  async getAll(): Promise<SehuatangAvId[]> {
    const res = await sendMsg('SEHUATANG_GET_ALL')
    return res.items || []
  },

  async has(id: string): Promise<boolean> {
    const res = await sendMsg('SEHUATANG_CHECK_VIEWED', { id })
    return !!res.exists
  },

  async add(id: string, rating: number = 0): Promise<void> {
    await sendMsg('SEHUATANG_ADD', { id, rating })
  },

  async batchAdd(items: SehuatangAvId[]): Promise<number> {
    const res = await sendMsg('SEHUATANG_BATCH_ADD', { items })
    return res.addedCount || 0
  },
}
