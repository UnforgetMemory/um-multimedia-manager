/**
 * Douban interest marking composable (想看 / 已看).
 *
 * Wraps Douban's `/j/subject/{subjectId}/interest` API for fetching
 * and submitting interest status from a content script context.
 *
 * Runs on movie.douban.com / music.douban.com detail pages.
 * Uses `credentials: 'include'` so cookies are sent in Shadow DOM contexts.
 */

import { ref, type Ref, type MaybeRefOrGetter, toValue } from 'vue'

/**
 * Interest status returned by Douban's API.
 */
export type InterestStatus = 'wish' | 'do' | 'collect' | '' | null

/**
 * Return shape of the `useInterest` composable.
 */
export interface UseInterest {
  /** Current interest status */
  interestStatus: Ref<InterestStatus>
  /** Current rating on Douban's 1-5 scale (0 when not set) */
  currentRating: Ref<number>
  /** Suggested tags for selection (my_tags) */
  myTags: Ref<string[]>
  /** Already selected tags (tags) */
  savedTags: Ref<string[]>
  /** User's current comment */
  currentComment: Ref<string>
  /** Whether the subject supports "在看" (do) status */
  hasDo: Ref<boolean>
  /** Last error message, if any */
  error: Ref<string>
  /** Whether an API request is in flight */
  loading: Ref<boolean>
  /** Fetch current interest status from Douban */
  fetchInterest: () => Promise<void>
  /** Submit interest status (and optional rating, tags, comment) to Douban */
  submitInterest: (interest: 'wish' | 'do' | 'collect', rating?: number, tags?: string, comment?: string) => Promise<boolean>
}

/**
 * Parse the CSRF token (`ck`) from the page.
 *
 * Prefers the hidden `<input name="ck">` field; falls back to parsing
 * `document.cookie` for `ck=<value>`.
 */
function getCk(): string {
  const inputCk = document.querySelector<HTMLInputElement>('input[name="ck"]')?.value
  if (inputCk) return inputCk

  const cookieMatch = document.cookie.match(/(?:^|;\s*)ck=([^;]+)/)
  return cookieMatch ? decodeURIComponent(cookieMatch[1]) : ''
}

/**
 * Extract the existing comment from the interest form HTML.
 * The GET response includes an `html` field containing the rendered form.
 */
function extractCommentFromHtml(html: string): string {
  const match = html.match(/<textarea[^>]*name="comment"[^>]*>([\s\S]*?)<\/textarea>/i)
  if (!match) return ''
  // Decode common HTML entities
  return match[1].trim()
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
}

/**
 * Extract the rating value from the interest form HTML.
 * The form contains `<input id="n_rating" type="hidden" value="1" name="rating">`
 * where value is the 1-5 star rating.
 */
function extractRatingFromHtml(html: string): number {
  const match = html.match(/<input[^>]*id="n_rating"[^>]*value="(\d+)"[^>]*>/i)
  if (!match) return 0
  const v = parseInt(match[1], 10)
  return v >= 1 && v <= 5 ? v : 0
}

/**
 * Detect whether the subject supports "在看" (do) status.
 * The HTML form includes radio buttons for available interest statuses.
 * If `<input type="radio" value="do" name="interest">` exists, the subject supports "在看".
 */
function extractHasDoFromHtml(html: string): boolean {
  return /<input[^>]*type="radio"[^>]*value="do"[^>]*name="interest"[^>]*>/i.test(html)
}

/**
 * Parse Douban's interest API JSON response.
 */
interface InterestApiResponse {
  interest_status?: string
  rating?: number
  my_tags?: unknown[]
  tags?: unknown[]
  html?: string
  [key: string]: unknown
}

/**
 * Composable for Douban interest marking (想看 / 已看).
 *
 * @param subjectId - Douban subject ID (string or getter/ref)
 * @returns Reactive interest state and actions
 *
 * @example
 * ```ts
 * const { interestStatus, currentRating, fetchInterest, submitInterest } = useInterest('1292052')
 * await fetchInterest()
 * await submitInterest('collect', 5)
 * ```
 */
export function useInterest(subjectId: MaybeRefOrGetter<string>): UseInterest {
  const interestStatus = ref<InterestStatus>(null)
  const currentRating = ref(0)
  const myTags = ref<string[]>([])
  const savedTags = ref<string[]>([])
  const currentComment = ref('')
  const hasDo = ref(false)
  const error = ref('')
  const loading = ref(false)

  /**
   * GET `/j/subject/{subjectId}/interest` to load current status.
   */
  async function fetchInterest(): Promise<void> {
    const sid = toValue(subjectId)
    if (!sid) return

    loading.value = true
    error.value = ''

    try {
      const resp = await fetch(`/j/subject/${encodeURIComponent(sid)}/interest`, {
        credentials: 'include',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      })

      // 403 / redirect usually means not authenticated
      if (resp.status === 403 || resp.status === 302 || resp.status === 301) {
        interestStatus.value = null
        currentRating.value = 0
        myTags.value = []
        savedTags.value = []
        currentComment.value = ''
        return
      }

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`)
      }

      const text = await resp.text()
      let parsed: InterestApiResponse
      try {
        parsed = JSON.parse(text) as InterestApiResponse
      } catch {
        // Non-JSON response — treat as auth issue or empty
        interestStatus.value = null
        currentRating.value = 0
        return
      }

      const rawStatus = parsed.interest_status ?? ''
      interestStatus.value = rawStatus === '' ? null : (rawStatus as 'wish' | 'do' | 'collect')
      currentRating.value = typeof parsed.rating === 'number' ? parsed.rating : (parsed.html ? extractRatingFromHtml(parsed.html) : 0)
      myTags.value = Array.isArray(parsed.my_tags) ? parsed.my_tags.filter((t): t is string => typeof t === 'string') : []
      savedTags.value = Array.isArray(parsed.tags) ? parsed.tags.filter((t): t is string => typeof t === 'string') : []
      currentComment.value = parsed.html ? extractCommentFromHtml(parsed.html) : ''
      hasDo.value = parsed.html ? extractHasDoFromHtml(parsed.html) : false
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Network error'
      interestStatus.value = null
      currentRating.value = 0
      myTags.value = []
      savedTags.value = []
      currentComment.value = ''
      hasDo.value = false
    } finally {
      loading.value = false
    }
  }

  /**
   * POST interest status to Douban.
   *
   * @param interest - 'wish' or 'collect'
   * @param rating - Optional 1-5 rating
   * @returns true on success, false on failure
   */
  async function submitInterest(interest: 'wish' | 'do' | 'collect', rating?: number, tags?: string, comment?: string): Promise<boolean> {
    const sid = toValue(subjectId)
    if (!sid) {
      error.value = 'Missing subject ID'
      return false
    }

    const ck = getCk()
    if (!ck) {
      error.value = '未登录豆瓣'
      return false
    }

    loading.value = true
    error.value = ''

    try {
      const body = new URLSearchParams({
        interest,
        rating: rating != null ? String(rating) : '',
        tags: tags ?? '',
        comment: comment ?? '',
        foldcollect: 'None',
        ck,
      })

      const resp = await fetch(`/j/subject/${encodeURIComponent(sid)}/interest`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: body.toString(),
      })

      // Douban often returns 302 on successful POST
      const success = resp.ok || resp.status === 302 || resp.status === 301
      if (success) {
        interestStatus.value = interest
        currentRating.value = rating ?? currentRating.value
        error.value = ''
        return true
      }

      // Try to parse error message from response
      const text = await resp.text()
      let parsed: Record<string, unknown> | null = null
      try { parsed = JSON.parse(text) as Record<string, unknown> } catch { parsed = null }

      error.value = parsed?.message
        ? String(parsed.message)
        : `Request failed (${resp.status})`
      return false
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Network error'
      return false
    } finally {
      loading.value = false
    }
  }

  return {
    interestStatus,
    currentRating,
    myTags,
    savedTags,
    currentComment,
    hasDo,
    error,
    loading,
    fetchInterest,
    submitInterest,
  }
}
