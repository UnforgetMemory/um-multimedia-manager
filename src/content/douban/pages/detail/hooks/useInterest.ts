import { useState, useCallback } from 'react'
import { FloatingToast } from '@/content/douban/shared/legacy-bridge'

export type InterestStatus = 'wish' | 'do' | 'collect' | '' | null

export interface UseInterest {
  interestStatus: InterestStatus
  currentRating: number
  myTags: string[]
  savedTags: string[]
  currentComment: string
  hasDo: boolean
  error: string
  loading: boolean
  fetchInterest: () => Promise<void>
  submitInterest: (interest: 'wish' | 'do' | 'collect', rating?: number, tags?: string, comment?: string) => Promise<boolean>
}

function isDoubanLoggedIn(): boolean {
  return /(?:^|;\s*)DedeUserID=/.test(document.cookie)
}

function getCk(): string {
  const inputCk = document.querySelector<HTMLInputElement>('input[name="ck"]')?.value
  if (inputCk) return inputCk
  const cookieMatch = document.cookie.match(/(?:^|;\s*)ck=([^;]+)/)
  return cookieMatch ? decodeURIComponent(cookieMatch[1]) : ''
}

function extractCommentFromHtml(html: string): string {
  const match = html.match(/<textarea[^>]*name="comment"[^>]*>([\s\S]*?)<\/textarea>/i)
  if (!match) return ''
  return match[1].trim()
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
}

function extractRatingFromHtml(html: string): number {
  const match = html.match(/<input[^>]*id="n_rating"[^>]*value="(\d+)"[^>]*>/i)
  if (!match) return 0
  const v = parseInt(match[1], 10)
  return v >= 1 && v <= 5 ? v : 0
}

function extractHasDoFromHtml(html: string): boolean {
  return /<input[^>]*type="radio"[^>]*value="do"[^>]*name="interest"[^>]*>/i.test(html)
}

function extractTagsFromHtml(html: string): { myTags: string[]; savedTags: string[] } {
  const myTags: string[] = []
  const savedTags: string[] = []
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  doc.querySelectorAll('label.interest-tag, label.tag-label').forEach((el) => {
    const text = el.textContent?.trim() || ''
    const input = el.querySelector("input[type=checkbox]") as HTMLInputElement | null
    if (text) {
      myTags.push(text)
      if ((input as HTMLInputElement | null)?.checked) savedTags.push(text)
    }
  })
  if (myTags.length === 0 && savedTags.length === 0) {
    const tagMatch = html.match(/my_tags[^]*?value="([^"]*)"/)
    if (tagMatch) myTags.push(...tagMatch[1].split(',').filter(Boolean))
    const savedMatch = html.match(/tags[^]*?value="([^"]*)"/)
    if (savedMatch) savedTags.push(...savedMatch[1].split(',').filter(Boolean))
  }
  return { myTags, savedTags }
}

export function useInterest(
  subjectId: string | (() => string),
  initialStatus: InterestStatus = null,
  initialRating: number = 0,
  apiPathPrefix?: string,
): UseInterest {
  const [interestStatus, setInterestStatus] = useState<InterestStatus>(initialStatus)
  const [currentRating, setCurrentRating] = useState(initialRating)
  const [myTags, setMyTags] = useState<string[]>([])
  const [savedTags, setSavedTags] = useState<string[]>([])
  const [currentComment, setCurrentComment] = useState('')
  const [hasDo, setHasDo] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const apiPath = apiPathPrefix || '/j/subject'

  const getId = useCallback(() => {
    return typeof subjectId === 'function' ? subjectId() : subjectId
  }, [subjectId])

  const fetchInterest = useCallback(async () => {
    const id = getId()
    if (!id) return
    setLoading(true)
    setError('')
    try {
      if (!isDoubanLoggedIn()) { setInterestStatus(null); return }
      const res = await fetch(`${apiPath}/${encodeURIComponent(id)}/interest`, {
        credentials: 'include',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      })
      if (res.status === 403 || res.status === 302 || res.status === 301) {
        setInterestStatus(null)
        setCurrentRating(0)
        setMyTags([])
        setSavedTags([])
        setCurrentComment('')
        if (res.status === 403) {
          const msg = isDoubanLoggedIn()
            ? '豆瓣登录可能已过期，请刷新页面重新登录'
            : '豆瓣登录已过期，请刷新页面重新登录'
          FloatingToast.error('UMM', msg)
        }
        return
      }
      if (!res.ok) {
        throw new Error('HTTP ' + res.status)
      }
      const text = await res.text()
      let parsed: any
      try {
        parsed = JSON.parse(text)
      } catch {
        if (interestStatus === null) {
          setInterestStatus(null)
          setCurrentRating(0)
        }
        return
      }
      // Use interest_status field (correct Douban API field name)
      const rawStatus = parsed.interest_status ?? ''
      if (rawStatus !== '') {
        setInterestStatus(rawStatus as 'wish' | 'do' | 'collect')
      }
      const apiRating = typeof parsed.rating === 'number' ? parsed.rating : (parsed.html ? extractRatingFromHtml(parsed.html) : 0)
      if (apiRating > 0) setCurrentRating(apiRating)
      if (parsed.html) {
        const comment = extractCommentFromHtml(parsed.html)
        if (comment) setCurrentComment(comment)
        const tags = extractTagsFromHtml(parsed.html)
        setMyTags(tags.myTags)
        setSavedTags(tags.savedTags)
        setHasDo(extractHasDoFromHtml(parsed.html))
      } else {
        setMyTags(Array.isArray(parsed.my_tags) ? parsed.my_tags.filter((t: any): t is string => typeof t === 'string') : [])
        setSavedTags(Array.isArray(parsed.tags) ? parsed.tags.filter((t: any): t is string => typeof t === 'string') : [])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch interest')
      if (interestStatus === null) {
        setInterestStatus(null)
        setCurrentRating(0)
      }
      setMyTags([])
      setSavedTags([])
      setCurrentComment('')
      setHasDo(false)
    } finally { setLoading(false) }
  }, [getId, apiPath])

  const submitInterest = useCallback(async (
    interest: 'wish' | 'do' | 'collect',
    rating?: number, tags?: string, comment?: string,
  ): Promise<boolean> => {
    const id = getId()
    if (!id) return false
    const ck = getCk()
    if (!ck) {
      setError('未登录豆瓣')
      if (!isDoubanLoggedIn()) {
        FloatingToast.error('UMM', '未登录豆瓣，请刷新页面重新登录')
      } else {
        FloatingToast.error('UMM', 'CSRF token 缺失，请刷新页面')
      }
      return false
    }
    setLoading(true)
    setError('')
    try {
      const body = new URLSearchParams({
        interest,
        rating: rating != null ? String(rating) : '',
        tags: tags ?? '',
        comment: comment ?? '',
        foldcollect: 'None',
        ck,
      })
      const res = await fetch(`${apiPath}/${encodeURIComponent(id)}/interest`, {
        method: 'POST', credentials: 'include',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: body.toString(),
      })
      const success = res.ok || res.status === 302 || res.status === 301
      if (success) {
        setInterestStatus(interest)
        if (rating !== undefined) setCurrentRating(rating)
        if (comment !== undefined) setCurrentComment(comment)
        return true
      }
      const text = await res.text().catch(() => '')
      let parsed: any = null
      try { parsed = JSON.parse(text) } catch { parsed = null }
      setError(parsed?.message ? String(parsed.message) : `Request failed (${res.status})`)
      if (res.status === 403) {
        const msg = isDoubanLoggedIn()
          ? '豆瓣登录可能已过期，请刷新页面重新登录'
          : '豆瓣登录已过期，请刷新页面重新登录'
        FloatingToast.error('UMM', msg)
      }
      return false
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submit failed')
      return false
    } finally { setLoading(false) }
  }, [getId, apiPath])

  return {
    interestStatus, currentRating, myTags, savedTags,
    currentComment, hasDo, error, loading,
    fetchInterest, submitInterest,
  }
}
