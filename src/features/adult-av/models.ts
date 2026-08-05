export const JAV_IDS_STORE_NAME = 'jav_ids' as const

export function normalizeAvId(input: string): string {
  return input.toUpperCase().trim().replace(/\s+/g, '-')
}

/**
 * Extract base ID without version suffix.
 * Suffixes: -C (中文字幕), -U (无码破解), -UC/-CU (无码+中文字幕)
 * Examples: "YAG-1233" → "YAG-1233", "YAG-1233-UC" → "YAG-1233", "YAG-1233-U" → "YAG-1233"
 */
export function extractBaseId(id: string): string {
  return id.replace(/-(U|C|UC|CU)$/i, '')
}
