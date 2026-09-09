/**
 * 色花堂分页功能逻辑（纯函数，JSDOM/Node 可测，无 DOM 依赖）。
 *
 * 功能提取自 sehuatang-controls 的分页渲染：
 *   - derivePageHref：从原版渲染过的页码链接模板推导任意页 href
 *     （短链 forum-103-2.html / 长链 forum.php?...&page=N，保留 filter 参数），
 *     不伪造 URL 格式——模板一定来自站点原版渲染。
 *   - windowPages：现代窗口化页码（1 … cur±r … last，间隙为省略号）。
 *   - resolveJumpUrl / clampPage：跳转输入 → URL、页码钳制。
 */

export interface PagerLink {
  label: string
  page: number
  href: string
  last: boolean
}

export interface PaginationData {
  current: number
  total: number
  prevHref: string
  nextHref: string
  pages: PagerLink[]
  jumpTemplate: string
}

export interface PageItem {
  page: number
  href: string | null
  kind: 'page' | 'gap'
}

/**
 * 从样例 href 推导第 page 页的链接。
 * 短链 `forum-103-2.html` → 替换页码；长链含 `page=N` → 替换 N（保留
 * typeid/filter 等其余参数）。样例不匹配任何已知形态 → null。
 */
export function derivePageHref(sample: string, page: number): string | null {
  if (!sample || !Number.isInteger(page) || page < 1) return null
  const short = /^(.+)-(\d+)(\.html)$/.exec(sample)
  if (short) return `${short[1]}-${page}${short[3]}`
  if (/[?&]page=\d+/.test(sample)) return sample.replace(/([?&]page=)\d+/, `$1${page}`)
  return null
}

/**
 * 窗口化页码：1 … max(1,cur-r) .. min(last,cur+r) … last。
 * href 优先取原版渲染的映射，缺失时用首个样例模板推导（无模板 → null）。
 * 区间与 1/last 相邻时自动合并，不产生多余省略号。
 */
export function windowPages(pages: PagerLink[], current: number, total: number, radius = 2): PageItem[] {
  const hrefMap = new Map<number, string>()
  let sampleHref = ''
  for (const p of pages) {
    if (p.href) {
      hrefMap.set(p.page, p.href)
      if (!sampleHref) sampleHref = p.href
    }
  }
  const last = total > 0 ? total : (pages.length > 0 ? Math.max(...pages.map((p) => p.page)) : current)

  const hrefFor = (page: number): string | null => hrefMap.get(page) ?? derivePageHref(sampleHref, page)

  const items: PageItem[] = []
  let prev = 0
  const push = (page: number) => {
    items.push({ page, href: hrefFor(page), kind: 'page' })
    prev = page
  }
  const pushGap = () => {
    if (items.length === 0 || items[items.length - 1]!.kind !== 'gap') {
      items.push({ page: 0, href: null, kind: 'gap' })
    }
  }

  if (last < 1) return items
  const start = Math.max(1, current - radius)
  const end = Math.min(last, current + radius)
  const seq: number[] = [1]
  for (let p = start; p <= end; p++) seq.push(p)
  seq.push(last)

  for (const p of seq) {
    if (p < 1 || p > last) continue
    if (p === prev) continue
    if (prev > 0 && p - prev > 1) pushGap()
    push(p)
  }
  return items
}

/** 跳转 URL：原版模板（如 forum.php?mod=forumdisplay&fid=103&page=）+ 页码，相对当前页解析；
 * 仅允许 http(s) 协议结果（模板来自站点 onkeydown，仍按不可信输入防御）。 */
export function resolveJumpUrl(template: string, page: number, baseUrl: string): string | null {
  if (!template) return null
  try {
    const url = new URL(`${template}${page}`, baseUrl)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.href
  } catch {
    return null
  }
}

/** 页码钳制到 [1, total]（total 为 0 时钳到 1）。 */
export function clampPage(value: number, total: number): number {
  if (!Number.isFinite(value)) return 1
  return Math.min(Math.max(1, Math.trunc(value)), Math.max(1, total))
}
