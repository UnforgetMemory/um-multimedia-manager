export const JAV_IDS_STORE_NAME = 'jav_ids' as const

const TID_TRACK_KEY_RE = /::TID-\d+$/

export function normalizeAvId(input: string): string {
  return input.toUpperCase().trim().replace(/\s+/g, '-')
}

/**
 * Site-local tracking keys: TID-<tid> fallback keys for sehuatang threads
 * without an extractable AV id. They share jav_ids (prefix distinguishes
 * them) but MUST be filtered on the consumer side — history count/stats/
 * lookup panels must not present them as real codes (backup/export keeps
 * them for site restore).
 */
export function isTidTrackKey(key: string): boolean {
  return TID_TRACK_KEY_RE.test(key)
}

/**
 * Extract base ID without version suffix.
 * Suffixes: -C (中文字幕), -U (无码破解), -UC/-CU (无码+中文字幕)
 * Examples: "YAG-1233" → "YAG-1233", "YAG-1233-UC" → "YAG-1233", "YAG-1233-U" → "YAG-1233"
 */
export function extractBaseId(id: string): string {
  return id.replace(/-(U|C|UC|CU)$/i, '')
}
