import type { AdultAvId, AdultAvIdInput, MessageType, MessagePayloadMap, MessageSuccess, RuntimeMessageEnvelope } from '@/types'
import { safeSendMessage } from '@/utils/context'

async function sendMsg<K extends MessageType>(type: K, payload: MessagePayloadMap[K]): Promise<MessageSuccess<K>> {
  // The generic pair is per-K constrained but not provably a member of the
  // whole envelope union — one documented assertion at this boundary.
  const res = await safeSendMessage<K>(
    { type, payload } as Extract<RuntimeMessageEnvelope, { type: K }>,
    { timeout: 8000, retries: 1 },
  )
  if (!res) throw new Error(`${type} failed: no response`)
  if (!res.success) {
    const err = res as { error?: string }
    throw new Error(err.error || `${type} failed`)
  }
  // Narrowed by the guard above; the generic indexed access is not
  // distributive in TS, hence the documented cast.
  return res as unknown as MessageSuccess<K>
}

export const AdultAvStore = {
  async getAll(source?: string): Promise<AdultAvId[]> {
    const res = await sendMsg('ADULT_AV_GET_ALL', source ? { source } : {})
    return res.items || []
  },

  async has(id: string): Promise<boolean> {
    try {
      const res = await sendMsg('ADULT_AV_CHECK', { id })
      return !!(res?.exists ?? res?.watched ?? false)
    } catch {
      return false
    }
  },

  /** Batch check: send all IDs in one message, return a Set of watched IDs. */
  async batchCheckExists(ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set()
    try {
      const res = await sendMsg('ADULT_AV_CHECK_BATCH', { ids })
      if (res?.watched && Array.isArray(res.watched)) {
        return new Set<string>(res.watched.map((id: string) => id.toUpperCase()))
      }
      return new Set<string>()
    } catch {
      return new Set<string>()
    }
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
