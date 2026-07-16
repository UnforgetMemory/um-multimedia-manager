/**
 * Personage page data extraction — from /personage/{id}/
 *
 * Extracts profile info, biography, photos, awards, works, and partners
 * from the native Douban personage page DOM.
 */

export interface ProfileProperty {
  label: string
  value: string
}

export interface WorkItem {
  title: string
  url: string
  poster: string
  rating: string
  year?: string
  recordStatus?: number
  recordRating?: number
}

export interface AwardItem {
  year: string
  awardUrl: string
  awardName: string
  status: string
  workUrl: string
  workName: string
}

export interface PartnerItem {
  name: string
  url: string
  avatar: string
  workCount: number
}

export interface PersonagePageData {
  personageId: string
  name: string
  avatar: string
  properties: ProfileProperty[]
  biography: string
  photos: string[]
  awards: AwardItem[]
  recentWorks: WorkItem[]
  popularWorks: WorkItem[]
  unreleasedWorks: WorkItem[]
  moreWorksUrl: string
  moreWorksCount: string
  partners: PartnerItem[]
}

/**
 * Extract avatar image URL from the personage page.
 */
function extractAvatar(): string {
  const img = document.querySelector<HTMLImageElement>(
    'section.subject-target .avatar-container img.avatar',
  )
  return img?.src || ''
}

/**
 * Extract personage ID from the page URL.
 */
function extractPersonageId(): string {
  const m = location.pathname.match(/\/personage\/(\d+)/)
  return m ? m[1] : ''
}

/**
 * Extract name from h1.subject-name.
 */
function extractName(): string {
  const el = document.querySelector('h1.subject-name')
  return el?.textContent?.trim() || ''
}

/**
 * Extract profile properties from ul.subject-property.
 */
function extractProperties(): ProfileProperty[] {
  const props: ProfileProperty[] = []
  document.querySelectorAll<HTMLLIElement>(
    'section.subject-target ul.subject-property li',
  ).forEach((li) => {
    const label = li.querySelector('.label')?.textContent?.trim().replace(/[:\s]+$/, '') || ''
    const value = li.querySelector('.value')?.textContent?.trim() || ''
    if (label && value) {
      props.push({ label, value })
    }
  })
  return props
}

/**
 * Extract biography from the page.
 * Native page only shows a truncated snippet in .content — the full text
 * is in meta[property="og:description"]. Try the meta tag first, fall back
 * to .content if unavailable.
 */
function extractBiography(): string {
  const ogDesc = document.querySelector<HTMLMetaElement>(
    'meta[property="og:description"]',
  )
  if (ogDesc?.content) {
    return ogDesc.content.trim().replace(/\s+/g, ' ')
  }
  // Fallback: read from .content if meta tag is absent
  const desc = document.querySelector(
    'section.subject-intro .desc .content',
  )
  return desc?.textContent?.trim().replace(/\s+/g, ' ') || ''
}

/**
 * Extract photo URLs from section.subject-picture.
 */
function extractPhotos(): string[] {
  const urls: string[] = []
  document.querySelectorAll<HTMLLIElement>(
    'section.subject-picture ul a li.picture',
  ).forEach((li) => {
    const style = li.getAttribute('style') || ''
    const m = style.match(/background-image:\s*url\(['"]?([^'")\s]+)['"]?\)/)
    if (m && m[1]) urls.push(m[1])
  })
  return urls
}

/**
 * Extract awards from section.subject-awards.
 */
function extractAwards(): AwardItem[] {
  const awards: AwardItem[] = []
  document.querySelectorAll<HTMLLIElement>(
    'section.subject-awards ul li',
  ).forEach((li) => {
    const items: string[] = []
    const links: { text: string; href: string }[] = []
    li.querySelectorAll('span').forEach((s) => items.push(s.textContent?.trim() || ''))
    li.querySelectorAll<HTMLAnchorElement>('a').forEach((a) => {
      links.push({ text: a.textContent?.trim() || '', href: a.href })
    })
    if (items.length >= 1 && links.length >= 2) {
      awards.push({
        year: items[0] || '',
        awardUrl: links[0]?.href || '',
        awardName: links[0]?.text || '',
        status: items.length >= 3 ? items[items.length - 1] : '',
        workUrl: links[1]?.href || '',
        workName: links[1]?.text || '',
      })
    }
  })
  return awards
}

/**
 * Extract works from a work-collections section (#work-collections-sortby-time etc.).
 */
function extractWorks(sectionId: string): WorkItem[] {
  const works: WorkItem[] = []
  const section = document.querySelector(sectionId)
  if (!section) return works

  section.querySelectorAll<HTMLLIElement>('li.creation').forEach((li) => {
    const imgLink = li.querySelector<HTMLAnchorElement>('a.img_wrap')
    const titleLink = li.querySelectorAll<HTMLAnchorElement>('a[href*="/subject/"]')
    const ratingEl = li.querySelector('.rating-val')

    // Year from .timeline-year
    const yearEl = li.querySelector('.timeline-year')

    // Poster image from img inside img_wrap
    const img = imgLink?.querySelector<HTMLImageElement>('img')
    const poster = img?.src || ''

    // Title from the second anchor (first is the img_wrap)
    const titleAnchor = titleLink.length >= 2 ? titleLink[1]
      : (imgLink && imgLink.href ? { textContent: imgLink.getAttribute('title'), href: imgLink.href } : null)
    const title = titleAnchor?.textContent?.trim() || ''
    const url = titleAnchor?.href || imgLink?.href || ''

    const rating = ratingEl?.textContent?.trim() || ''

    if (title) {
      works.push({
        title,
        url,
        poster,
        rating,
        year: yearEl?.textContent?.trim(),
      })
    }
  })
  return works
}

/**
 * Extract unreleased works from ul.unreleased inside #work-collections-sortby-time.
 */
function extractUnreleasedWorks(): WorkItem[] {
  const unreleased: WorkItem[] = []
  document.querySelectorAll<HTMLLIElement>('#work-collections-sortby-time ul.unreleased li').forEach((li) => {
    const a = li.querySelector<HTMLAnchorElement>('a')
    const yearSpan = li.querySelector('span')
    if (!a) return
    const title = a.textContent?.trim() || ''
    const url = a.href || ''
    const year = yearSpan?.textContent?.trim().replace(/[()]/g, '') || ''
    if (title) {
      unreleased.push({ title, url, poster: '', rating: '', year })
    }
  })
  return unreleased
}

/**
 * Extract the "more works" link from a work-collections section.
 */
function extractMoreWorksLink(sectionId: string): { url: string; count: string } {
  const section = document.querySelector(sectionId)
  if (!section) return { url: '', count: '' }
  const moreLink = section.querySelector<HTMLAnchorElement>('a[href*="creations?sortby"]')
  if (!moreLink) return { url: '', count: '' }
  const text = moreLink.textContent?.trim() || ''
  const countMatch = text.match(/(\d+)/)
  return {
    url: moreLink.href,
    count: countMatch ? countMatch[1] : '',
  }
}

/**
 * Extract partners from #partners section.
 */
function extractPartners(): PartnerItem[] {
  const partners: PartnerItem[] = []
  const section = document.querySelector('#partners')
  if (!section) return partners

  section.querySelectorAll<HTMLLIElement>('li.partners-mod-item').forEach((li) => {
    const img = li.querySelector<HTMLImageElement>('.partners-mod-pic img')
    const nameLink = li.querySelector<HTMLAnchorElement>('.partners-mod-info a')
    const countSpan = li.querySelector('.partners-mod-info span')

    const name = nameLink?.textContent?.trim() || ''
    const url = nameLink?.href || ''
    const avatar = img?.src || ''

    // Extract work count from text like "合作作品 (25)"
    const countText = countSpan?.textContent || ''
    const countMatch = countText.match(/\((\d+)\)/)
    const workCount = countMatch ? parseInt(countMatch[1], 10) : 0

    if (name) {
      partners.push({ name, url, avatar, workCount })
    }
  })
  return partners
}

/**
 * Extract all data from the current Douban personage page.
 * Returns null if the page does not contain expected personage structure.
 */
export function extractPersonagePageData(): PersonagePageData | null {
  const name = extractName()
  if (!name) return null

  const worksTime = document.querySelector('#work-collections-sortby-time')
  const worksCollect = document.querySelector('#work-collections-sortby-collect')
  const partnersEl = document.querySelector('#partners')

  if (worksTime) console.log('[UMM] works-time found:', worksTime.querySelectorAll('li.creation').length, 'items')
  if (worksCollect) console.log('[UMM] works-collect found:', worksCollect.querySelectorAll('li.creation').length, 'items')
  if (partnersEl) console.log('[UMM] partners found:', partnersEl.querySelectorAll('li.partners-mod-item').length, 'items')

  const moreWorks = extractMoreWorksLink('#work-collections-sortby-time')

  return {
    personageId: extractPersonageId(),
    name,
    avatar: extractAvatar(),
    properties: extractProperties(),
    biography: extractBiography(),
    photos: extractPhotos(),
    awards: extractAwards(),
    recentWorks: extractWorks('#work-collections-sortby-time'),
    popularWorks: extractWorks('#work-collections-sortby-collect'),
    unreleasedWorks: extractUnreleasedWorks(),
    moreWorksUrl: moreWorks.url,
    moreWorksCount: moreWorks.count,
    partners: extractPartners(),
  }
}