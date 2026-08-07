// ─── API 工具函数 ──────────────────────────────────

import { MUKAKU_CONFIG } from './config'

/**
 * Probe payload parse result.
 *
 * - 'ok': the payload carries a valid `data` object and the linked ids were
 *   parsed. NOTE: `{doubanId: null, imdbId: null}` means "valid response
 *   confirming no association" — semantically distinct from 'invalid' (unusable
 *   response, must be re-probed and never cached).
 * - 'invalid': the payload is not an object, or `data` is missing / not a
 *   non-null object (e.g. an HTTP-200 error envelope `{code, msg}`). Callers
 *   must treat it as a failure — no cache write, re-probe on the next scan.
 */
export type ProbeExtraction =
  | { status: 'ok'; doubanId: string | null; imdbId: string | null }
  | { status: 'invalid' }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Normalize an IMDB id value: absent / empty / whitespace-only → null;
 * bare digits get the `tt` prefix. Empty strings must NOT become `tt`
 * (a persisted `tt` mapping would suppress dimming for 7 days).
 */
function normalizeImdbId(raw: unknown): string | null {
  if (raw == null) return null
  const id = String(raw).trim()
  if (!id) return null
  return id.startsWith('tt') ? id : `tt${id}`
}

/** Coerce a douban id: absent / empty / whitespace-only → null (falsy values must never persist). */
function normalizeDoubanId(raw: unknown): string | null {
  if (raw == null) return null
  const id = String(raw).trim()
  return id ? id : null
}

/**
 * Extract linked ids from an API response (payload-validity contract).
 *
 * Only reads from `data` when the payload is an object AND `data` is a non-null
 * object; the payload itself is NEVER the data source (an error envelope has
 * no `data` → 'invalid').
 */
export function extractLinkedIdsFromPayload(payload: unknown): ProbeExtraction {
  if (!isRecord(payload)) {
    return { status: 'invalid' }
  }
  const data = payload.data
  if (!isRecord(data)) {
    return { status: 'invalid' }
  }

  const doubanId = normalizeDoubanId(data.doub_id)
  const imdbId = normalizeImdbId(data.IMDB_number)

  return { status: 'ok', doubanId, imdbId }
}

/**
 * GOAL single decision point: persist the mapping ONLY on a successful fetch
 * that yields at least one valid id.
 * - 'invalid' → false (a failure is never persisted)
 * - 'ok' with both ids null → false (confirmed no association — no mapping to persist)
 * - 'ok' with >=1 id → true
 */
export function shouldPersistProbe(extraction: ProbeExtraction): boolean {
  if (extraction.status === 'invalid') {
    return false
  }
  return extraction.doubanId !== null || extraction.imdbId !== null
}

/**
 * Build the probe API URL.
 */
export function getApiUrl(mvId: string): string {
  const url = new URL(MUKAKU_CONFIG.API_PATH, 'https://web5.mukaku.com')
  url.searchParams.set('id', mvId)
  url.searchParams.set('app_id', MUKAKU_CONFIG.APP_ID)
  url.searchParams.set('identity', MUKAKU_CONFIG.IDENTITY)
  return url.href
}

/**
 * A list entry's linked ids (from getVideoList, used for image matching of
 * linkless cards).
 */
export interface ListEntry {
  image: string
  doubanId: string
  imdbId: string | null
}

/**
 * Extract matchable entries from a getVideoList response.
 *
 * Real shape (verified 2026-08-07): `data: { data: [ { id, idcode, doub_id,
 * IMDB_number, image, ... } ] }`. Only entries with BOTH image and a non-empty
 * doub_id are returned (either missing makes card matching impossible). The
 * list is capped at MAX_LIST_ENTRIES (hostile/huge payloads must not bloat
 * memory or the IDB mapping cache). Unusable responses yield an empty array.
 */
const MAX_LIST_ENTRIES = 2000

export function extractListEntries(payload: unknown): ListEntry[] {
  if (!isRecord(payload)) return []
  const data = payload.data
  if (!isRecord(data)) return []
  const list = data.data
  if (!Array.isArray(list)) return []

  const entries: ListEntry[] = []
  for (const item of list) {
    if (entries.length >= MAX_LIST_ENTRIES) break
    if (!isRecord(item)) continue
    const image = typeof item.image === 'string' ? item.image : ''
    const doubanId = normalizeDoubanId(item.doub_id)
    if (!image || !doubanId) continue
    const imdbId = normalizeImdbId(item.IMDB_number)
    entries.push({ image, doubanId, imdbId })
  }
  return entries
}

/**
 * Build the list API URL (search/category pages). page comes from the page URL
 * param (default 1).
 */
export function getListApiUrl(sb: string, page = '1'): string {
  const url = new URL(MUKAKU_CONFIG.LIST_API_PATH, 'https://web5.mukaku.com')
  url.searchParams.set('sb', sb)
  url.searchParams.set('page', page)
  url.searchParams.set('app_id', MUKAKU_CONFIG.APP_ID)
  url.searchParams.set('identity', MUKAKU_CONFIG.IDENTITY)
  return url.href
}
