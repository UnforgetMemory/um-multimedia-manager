import type { AdultAvId, AdultAvIdInput } from '@/types'
import { safeSendMessage } from '@/utils/context'

async function sendMsg(type: string, payload?: any): Promise<any> {
  const res = await safeSendMessage({ type, payload }, { timeout: 8000, retries: 1 })
  if (!res?.success) throw new Error(res?.error || `${type} failed`)
  return res
}

export const AdultAvStore = {
  async getAll(source?: string): Promise<AdultAvId[]> {
    const res = await sendMsg('ADULT_AV_GET_ALL', source ? { source } : {})
    return res.items || []
  },

  async has(id: string): Promise<boolean> {
    const res = await sendMsg('ADULT_AV_CHECK', { id })
    return !!res.exists
  },

  async add(source: string, id: string, rating: number = 0, url: string = ''): Promise<void> {
    await sendMsg('ADULT_AV_ADD', { source, id, rating, url })
  },

  async batchAdd(source: string, items: AdultAvIdInput[]): Promise<number> {
    const res = await sendMsg('ADULT_AV_BATCH_ADD', { source, items })
    return res.addedCount || 0
  },

  /** Find all records matching a base ID (handles UC/C suffix variants) */
  async findByBaseId(baseId: string): Promise<AdultAvId[]> {
    const all = await this.getAll()
    const normalized = baseId.toUpperCase().trim()
    return all.filter(item => {
      const itemBase = item.id.replace(/-(U|C|UC|CU)$/i, '')
      return itemBase === normalized || item.id === normalized
    })
  },
}
