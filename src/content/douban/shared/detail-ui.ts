/**
 * Shared UI helpers for Douban detail / game-detail pages.
 *
 * Pure functions (testable without DOM):
 *  - metaToChips    — convert " / "-separated HTML meta values into chip markup
 *  - ratingBarWidth — parse a percentage string into a CSS width value
 *  - starClass      — derive the bigstar CSS class from a numeric string
 *  - openLink       — open a URL in a new browser tab
 *
 * Stateful helper:
 *  - handleInterestSave — shared interest-save flow (submit → record update → cross-platform sync)
 */

import { onCrossPlatformSave } from '@/content/douban/pages/detail/composables/useCrossPlatformSync'
import type { UseInterest } from '@/content/douban/pages/detail/composables/useInterest'

// ─── Pure helpers ────────────────────────────────────────────────────────────

/**
 * Convert a " / "-separated HTML meta value into individual chip elements.
 *
 * Handles nested tags (e.g. `<span class="attrs">…</span>`) by stripping
 * leading/trailing wrapper tags, splitting on " / " in text-only context
 * (not inside tags), and re-wrapping the result in `<span class="umm-meta-chip">`.
 *
 * Optionally wraps plain IMDb text IDs (tt1234567) into clickable links
 * when `label === 'IMDb'`.
 */
export function metaToChips(html: string, label?: string): string {
  // 提取首尾包裹标签（如 <span class="attrs">...</span>）避免分割后错位
  const leading = html.match(/^(<[^>]+>)+/)
  const trailing = html.match(/(<\/[^>]+>)+$/)
  const prefix = leading?.[0] ?? ''
  const suffix = trailing?.[0] ?? ''
  let core = html
  if (prefix) core = core.slice(prefix.length)
  if (suffix && core.endsWith(suffix)) core = core.slice(0, -suffix.length)

  // 字符级扫描：仅在非标签文本中替换 " / " 为 chip 边界
  let result = ''
  let inTag = false
  let i = 0
  while (i < core.length) {
    const ch = core[i]
    if (ch === '<') { inTag = true; result += ch; i++; continue }
    if (inTag) { result += ch; if (ch === '>') inTag = false; i++; continue }
    if (ch === '/' && i > 0 && i < core.length - 1 && /\s/.test(core[i - 1]) && /\s/.test(core[i + 1])) {
      result = result.replace(/\s+$/, '')       // 削掉 / 前的空格
      let j = i + 2
      while (j < core.length && /\s/.test(core[j])) j++ // 跳过 / 后的空格
      // 跳过紧随其后的闭合标签（如 </span>），避免产生空 chip
      while (j < core.length && core[j] === '<') {
        const closeEnd = core.indexOf('>', j)
        if (closeEnd === -1) break
        const tag = core.slice(j, closeEnd + 1)
        if (tag.startsWith('</')) {
          result += tag // 将闭合标签放在前一个 chip 中
          j = closeEnd + 1
          while (j < core.length && /\s/.test(core[j])) j++
        } else {
          break
        }
      }
      result += '</span><span class="umm-meta-chip">'
      i = j
      continue
    }
    result += ch
    i++
  }
  // Add target="_blank" to all <a> tags that lack it
  result = result.replace(/<a(?=\s)(?![^>]*\btarget=)/g, '<a target="_blank" rel="noopener noreferrer"')
  // Wrap plain IMDb text IDs (tt1234567) into clickable links
  const trimmed = result.trim()
  if (label === 'IMDb' && /^tt\d+$/.test(trimmed)) {
    result = `<a href="https://www.imdb.com/title/${trimmed}/" target="_blank" rel="noopener noreferrer">${trimmed}</a>`
  }
  return prefix + '<span class="umm-meta-chip">' + result + '</span>' + suffix
}

/**
 * Parse a percentage string (e.g. "45.2%") into a CSS width value (e.g. "45.2%").
 * Returns "0%" for empty / unparseable input.
 */
export function ratingBarWidth(pct: string): string {
  return `${parseFloat(pct.replace('%', '')) || 0}%`
}

/**
 * Derive the bigstar CSS class from a numeric string (e.g. "45" → "bigstar bigstar45").
 * Returns an empty string when `bigstarNum` is falsy.
 */
export function starClass(bigstarNum: string): string {
  return bigstarNum ? `bigstar bigstar${bigstarNum}` : ''
}

/**
 * Open a URL in a new browser tab.
 */
export function openLink(url: string): void {
  window.open(url, '_blank')
}

// ─── Stateful helpers ────────────────────────────────────────────────────────

/** Context required by {@link handleInterestSave}. */
export interface InterestSaveContext {
  /** The useInterest composable instance for this page. */
  interested: UseInterest
  /** The page's identity (platform/type/providerId/url). */
  identity: { platform: 'douban'; type: string; providerId: string; url: string }
  /** Callback to update the local record ref (e.g. `record.value = r`). */
  setRecord: (record: { status: number; rating: number }) => void
}

/**
 * Shared interest-save flow used by both detail and game-detail pages.
 *
 * 1. Submit interest to Douban's API
 * 2. Update local record
 * 3. Sync cross-platform (IMDb/TMDB)
 */
export async function handleInterestSave(
  ctx: InterestSaveContext,
  interest: 'wish' | 'do' | 'collect',
  stars: number,
  tags: string,
  comment: string,
): Promise<void> {
  const ok = await ctx.interested.submitInterest(
    interest,
    stars || undefined,
    tags || undefined,
    comment || undefined,
  )
  if (!ok) return

  const newStatus = interest === 'collect' ? 2 : interest === 'do' ? 3 : 1
  const newRating = stars * 2
  ctx.setRecord({ status: newStatus, rating: newRating })

  await onCrossPlatformSave({
    identity: ctx.identity,
    interest,
    stars,
    comment,
    newStatus,
    newRating,
  })
}
