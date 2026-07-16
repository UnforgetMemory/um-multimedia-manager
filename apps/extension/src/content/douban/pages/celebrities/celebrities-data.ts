/**
 * Celebrities page data extraction — from /subject/{id}/celebrities
 *
 * Extracts all cast and crew items grouped by role (Director, Cast, Writer,
 * Producer, etc.) from the native Douban celebrities page DOM.
 * Called once at mount time from beforeMount().
 */

export interface CelebrityWork {
  title: string
  url: string
}

export interface CelebrityItem {
  /** Personage ID from URL (e.g. '27481219') */
  personageId: string
  /** Display name (e.g. '冯小刚 Xiaogang Feng') */
  name: string
  /** Personage page URL */
  personageUrl: string
  /** Avatar image URL */
  avatar: string
  /** Role description text (e.g. '演员 Actor (饰 肖大力)') */
  role: string
  /** Role tooltip / full role title attribute */
  roleDetail: string
  /** Representative works (up to 3) */
  works: CelebrityWork[]
  /** Whether the celebrity has a verified Douban account */
  hasDoubanAccount: boolean
}

export interface CelebrityGroup {
  /** Section heading (e.g. '导演 Director', '演员 Cast') */
  heading: string
  /** Celebrities in this group */
  celebrities: CelebrityItem[]
}

export interface CelebritiesPageData {
  /** Page title (e.g. '抓特务 的全部演职员') */
  title: string
  /** Celebrity groups ordered as they appear on the page */
  groups: CelebrityGroup[]
}

/**
 * Extract a personage ID from a personage URL like /personage/27481219/.
 */
function extractPersonageId(url: string): string {
  const m = url.match(/\/personage\/(\d+)\/?/)
  return m ? m[1] : ''
}

/**
 * Extract the avatar URL from a div.avatar's background-image style.
 * Falls back to empty string if not found.
 */
function extractAvatarUrl(avatarEl: HTMLElement | null): string {
  if (!avatarEl) return ''
  const style = avatarEl.getAttribute('style') || ''
  const m = style.match(/background-image:\s*url\(['"]?([^'")\s]+)['"]?\)/)
  return m ? m[1] : ''
}

/**
 * Extract representative works from span.works.
 * Returns up to 3 works with title and URL.
 */
function extractWorks(worksEl: HTMLElement | null): CelebrityWork[] {
  if (!worksEl) return []
  const works: CelebrityWork[] = []
  worksEl.querySelectorAll<HTMLAnchorElement>('a').forEach((a) => {
    const title = a.getAttribute('title') || a.textContent?.trim() || ''
    const url = a.href || ''
    if (title) {
      works.push({ title, url })
    }
  })
  return works
}

/**
 * Extract a single celebrity item from a li.celebrity element.
 */
function extractCelebrity(li: HTMLLIElement): CelebrityItem | null {
  const link = li.querySelector<HTMLAnchorElement>('a[href*="/personage/"]')
  if (!link) return null

  const personageUrl = link.href
  const personageId = extractPersonageId(personageUrl)
  if (!personageId) return null

  const avatarEl = li.querySelector<HTMLElement>('.avatar')
  const avatar = extractAvatarUrl(avatarEl)

  const infoEl = li.querySelector('.info')
  if (!infoEl) return null

  const nameEl = infoEl.querySelector<HTMLAnchorElement>('.name a')
  const name = nameEl?.textContent?.trim() || ''

  const roleEl = infoEl.querySelector('.role')
  const role = roleEl?.textContent?.trim() || ''
  const roleDetail = roleEl?.getAttribute('title') || role

  const worksEl = infoEl.querySelector('.works')
  const works = extractWorks(worksEl as HTMLElement | null)

  const hasDoubanAccount = link.classList.contains('has-account') ||
    avatarEl?.classList.contains('has-account') ||
    !!li.querySelector('.sns-card')

  return { personageId, name, personageUrl, avatar, role, roleDetail, works, hasDoubanAccount }
}

/**
 * Extract a single celebrity group (list-wrapper section).
 */
function extractGroup(wrapper: HTMLElement): CelebrityGroup | null {
  const headingEl = wrapper.querySelector('h2')
  if (!headingEl) return null
  const heading = headingEl.textContent?.trim() || ''

  const items: CelebrityItem[] = []
  wrapper.querySelectorAll<HTMLLIElement>('ul.celebrities-list > li.celebrity').forEach((li) => {
    const item = extractCelebrity(li)
    if (item) items.push(item)
  })

  return { heading, celebrities: items }
}

/**
 * Extract all data from the current Douban celebrities page.
 * Returns null if the page does not contain the #celebrities container.
 */
export function extractCelebritiesPageData(): CelebritiesPageData | null {
  const celebritiesEl = document.querySelector('#celebrities')
  if (!celebritiesEl) return null

  const h1 = document.querySelector('#content h1')
  const title = h1?.textContent?.trim() || ''

  const groups: CelebrityGroup[] = []
  celebritiesEl.querySelectorAll<HTMLElement>('.list-wrapper').forEach((wrapper) => {
    const group = extractGroup(wrapper)
    if (group && group.celebrities.length > 0) {
      groups.push(group)
    }
  })

  return { title, groups }
}