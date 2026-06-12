export const JAV_IDS_STORE_NAME = 'jav_ids' as const
export const JAV_IDS_VERSION = 1

export type AdultAvSource = 'javdb' | 'sehuatang' | string

export interface AdultAvId {
  source: AdultAvSource
  id: string
  url: string
  rating: number
  updatedAt: string
}

export interface AdultAvIdInput {
  id: string
  rating?: number
  url?: string
  updatedAt?: string
}

/** Parse key "source::id" → { source, id } */
export function parseKey(key: string): { source: string; id: string } {
  const idx = key.indexOf('::')
  if (idx === -1) return { source: 'unknown', id: key }
  return { source: key.slice(0, idx), id: key.slice(idx + 2) }
}

/** Build key "source::id" */
export function buildKey(source: string, id: string): string {
  return `${source}::${normalizeAvId(id)}`
}

export function normalizeAvId(input: string): string {
  return input.toUpperCase().trim().replace(/\s+/g, '-')
}

/** Extract base ID without suffix (e.g., "ABF-017-UC" → "ABF-017") */
export function extractBaseId(id: string): string {
  return id.replace(/-(UC|C|uncensored|censored)$/i, '')
}

export function normalizeTime(inputTime?: string): string {
  if (!inputTime) return new Date().toISOString()
  try {
    const d = new Date(inputTime)
    if (isNaN(d.getTime())) return new Date().toISOString()
    return d.toISOString()
  } catch {
    return new Date().toISOString()
  }
}
