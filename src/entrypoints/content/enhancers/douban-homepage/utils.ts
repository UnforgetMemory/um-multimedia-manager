/**
 * Pure DOM/string helpers for homepage enhancer.
 */

export function extractSubjectId(element: Element): string | null {
  const link = element.querySelector('a[href*="/subject/"], a[href*="/movie/"], a[href*="/tv/"]')
  if (!link) return null
  const href = (link as HTMLAnchorElement).href || link.getAttribute('href')
  if (!href) return null
  const match = href.match(/\/(?:subject|movie|tv)\/(\d+)/)
  return match ? match[1] : null
}

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function el(tag: string, attrs: Record<string, string>, children?: string): HTMLElement {
  const e = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v)
  if (children) e.innerHTML = children
  return e
}
