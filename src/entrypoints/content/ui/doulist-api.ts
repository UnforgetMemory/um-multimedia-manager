/**
 * Douban doulist API client (extracted from doulist-replace.ts, P2 split).
 *
 * Direct API calls to list/create/toggle doulist membership for a subject.
 * Uses relative /j/doulist/* endpoints with credentials: 'include' (page
 * cookies carry the session) — these are native Douban AJAX endpoints, not
 * UMM-proxied calls.
 */

import type { UrlIdentity } from '@/types'

/** Douban's subject_doulists endpoint caps the page at 100 — the UI's default 10 misses most entries. */
export const DOULIST_API_PAGE_SIZE = 100

export interface DoulistItem {
  id: string
  name: string
  count: string
  is_collected?: boolean
  is_private?: boolean
}

export interface SubjectInfo {
  subjectId: string
  cat: string
  kind: string
  url: string
  ck: string
}

export const DOULIST_CAT_MAP: Record<string, string> = {
  movie: '1002',
  tv: '1002',
  music: '1003',
  book: '1001',
  game: '3114',
}

export const DOULIST_LABEL_MAP: Record<string, string> = {
  movie: '片单',
  tv: '片单',
  music: '歌单',
  book: '书单',
  game: '豆列',
}

export function getDoulistLabel(identity: UrlIdentity): string {
  return DOULIST_LABEL_MAP[identity.type] || '片单'
}

export async function addToDoulist(doulistId: string, params: {
  sid: string; skind: string; comment: string; ck: string
}): Promise<boolean> {
  const body = new URLSearchParams({
    sid: params.sid,
    skind: params.skind,
    comment: params.comment,
    ck: params.ck,
  })
  try {
    const resp = await fetch(`/j/doulist/${doulistId}/additem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' },
      body: body.toString(),
      credentials: 'include',
    })
    return resp.ok || resp.status === 302
  } catch {
    return false
  }
}

export async function createDoulist(params: {
  title: string; category: string; isPrivate: boolean; ck: string
}): Promise<{ id: string; name: string } | null> {
  const body = new URLSearchParams({
    title: params.title,
    category: params.category,
    is_private: String(params.isPrivate),
    ck: params.ck,
  })
  try {
    const resp = await fetch('/j/doulist/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' },
      body: body.toString(),
      credentials: 'include',
    })
    const data = await resp.json()
    if (data.r === 0 && data.id) return { id: String(data.id), name: data.name || params.title }
    return null
  } catch {
    return null
  }
}

export async function removeFromDoulist(doulistId: string, params: {
  tkind: string; tid: string; ck: string
}): Promise<boolean> {
  const body = new URLSearchParams({
    tkind: params.tkind,
    tid: params.tid,
    ck: params.ck,
  })
  try {
    const resp = await fetch(`/j/doulist/${doulistId}/removeitem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' },
      body: body.toString(),
      credentials: 'include',
    })
    return resp.ok || resp.status === 302
  } catch {
    return false
  }
}

/**
 * Direct API call to fetch ALL doulists for a subject.
 * Douban's UI only renders 10 items initially; the full list
 * requires a paginated API call with a larger limit.
 */
export async function fetchAllDoulists(subject: SubjectInfo): Promise<DoulistItem[]> {
  const url = `/j/doulist/subject_doulists?start=0&limit=${DOULIST_API_PAGE_SIZE}&tkind=${subject.cat}&tid=${subject.subjectId}`
  try {
    const controller = new AbortController()
    // Abort after 5s so a hung doulist API never blocks the modal indefinitely.
    const timeout = setTimeout(() => controller.abort(), 5000)
    const resp = await fetch(url, {
      credentials: 'include',
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!resp.ok) {
      console.warn('[UMM] Doulist API returned', resp.status)
      return []
    }
    const raw = await resp.text()
    let parsed: unknown
    try { parsed = JSON.parse(raw) } catch {
      console.warn('[UMM] Doulist API response is not JSON:', raw.slice(0, 200))
      return []
    }
    // Try multiple response shapes: direct array, or object with
    // doulists / items / data / results key
    let arr: unknown[] = []
    if (Array.isArray(parsed)) {
      arr = parsed
    } else if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>
      arr = (obj.doulists as unknown[]) ||
            (obj.doulist as unknown[]) ||
            (obj.items as unknown[]) ||
            (obj.data as unknown[]) ||
            (obj.results as unknown[]) ||
            (obj.list as unknown[]) ||
            []
    }
    const items = arr.map((item: unknown) => {
      const i = item as Record<string, unknown>
      const doulistId = String(i.id ?? i.ID ?? i.doulist_id ?? i.doulistId ?? '')
      return {
      id: doulistId,
      name: (String(i.name ?? i.title ?? i.Name ?? '')).trim(),
      count: i.count ? String(i.count) : '',
      is_collected: Boolean(i.is_collected ?? false),
      is_private: Boolean(i.is_private ?? false),
    }}).filter(item => item.id && item.name)
    return items
  } catch (e: unknown) {
    console.warn('[UMM] fetchAllDoulists failed:', e)
    return []
  }
}
