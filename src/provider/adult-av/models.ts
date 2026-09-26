export const JAV_IDS_STORE_NAME = 'jav_ids' as const
export const USAV_IDS_STORE_NAME = 'usav_ids' as const
export const SEHUATANG_IDS_STORE_NAME = 'sehuatang_ids' as const

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
 *
 * ADR-025 起新写入落入 sehuatang_ids 表；本判定保留用于存量 jav_ids
 * 内的 TID 残留（消费侧过滤不变）。
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

/** 美/欧厂牌番号形态（normalizeAvId 后的大写形态）：字母段 + .YY.MM.DD 收尾。 */
const US_AV_ID_RE = /^[A-Z0-9]+(?:\.[A-Z0-9]+)*\.\d{2}\.\d{2}\.\d{2}$/

/** 归一化 id 是否为美/欧厂牌番号形态（Studio.YY.MM.DD）。 */
export function isUsAvId(id: string): boolean {
  return US_AV_ID_RE.test(id)
}

/** 番号分类：tid = 帖子兜底键；us = 美/欧厂牌；jp = 日系（默认）。 */
export type AvIdKind = 'jp' | 'us' | 'tid'

/**
 * 三表分类器（ADR-025 写入侧单一分类点）：normalizeAvId 后的 id →
 * 目标表。TID 前缀 → sehuatang_ids；点分日期形态 → usav_ids；其余 → jav_ids。
 * 提取器（sehuatang-extract）输出必过 normalizeAvId，形态定义与本函数一致。
 */
export function classifyAvId(id: string): AvIdKind {
  if (/^TID-\d+$/.test(id)) return 'tid'
  return isUsAvId(id) ? 'us' : 'jp'
}

/** 分类 → 目标 store 名。 */
export function storeForAvIdKind(kind: AvIdKind): typeof JAV_IDS_STORE_NAME | typeof USAV_IDS_STORE_NAME | typeof SEHUATANG_IDS_STORE_NAME {
  if (kind === 'us') return USAV_IDS_STORE_NAME
  if (kind === 'tid') return SEHUATANG_IDS_STORE_NAME
  return JAV_IDS_STORE_NAME
}
