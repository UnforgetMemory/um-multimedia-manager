import type { SehuatangAvId } from '@/types'

export const SEHUATANG_STORE_NAME = 'sehuatang_avids' as const

export function normalizeAvId(input: string): string {
  return input.toUpperCase().trim()
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

export function createAvId(
  id: string,
  rating: number = 0,
  time?: string
): SehuatangAvId {
  return {
    id: normalizeAvId(id),
    rating: Math.max(0, Math.min(10, Math.round(rating))),
    updatedAt: normalizeTime(time),
  }
}
