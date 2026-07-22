import type { MusicProfileData, MusicProfileStat, MusicProfileSection, MusicProfileAlbumItem, MusicProfileMusician, MusicProfileDoulist } from './types'

export function extractMusicProfileData(): MusicProfileData | null {
  try { return _extractMusicProfileData() }
  catch (err) { console.warn('[UMM] Error extracting music profile:', err); return null }
}

function _extractMusicProfileData(): MusicProfileData {
  const url = location.href
  const uidMatch = url.match(/\/people\/([^/?]+)/)
  const userId = uidMatch?.[1] ?? ''

  // User info from sidebar .music-user-profile
  const avatarImg = document.querySelector<HTMLImageElement>('.music-user-profile .avatar')
  const avatarUrl = avatarImg?.src ?? ''
  const nameEl = document.querySelector('.music-user-profile .username')
  const displayName = nameEl?.textContent?.trim() ?? userId

  // Stats from .number-accumulated
  const stats: MusicProfileStat[] = []
  document.querySelectorAll('.number-accumulated .number-item').forEach((item) => {
    const label = item.querySelector('.number-label')?.textContent?.trim() ?? ''
    const countText = item.querySelector('.number')?.textContent?.trim() ?? ''
    const countMatch = countText.match(/(\d+)/)
    const count = countMatch ? parseInt(countMatch[1], 10) : 0
    if (label) stats.push({ label, count, url: '' })
  })

  // Album section from #db-music-mine first h2 + .mod
  let albumSection: MusicProfileSection | null = null
  const mine = document.getElementById('db-music-mine')
  if (mine) {
    const h2 = mine.querySelector<HTMLHeadingElement>('h2')
    if (h2) {
      const h2Text = h2.textContent ?? ''
      const label = h2Text.replace(/[\s·]+.*$/, '').trim()
      const countLink = h2.querySelector<HTMLAnchorElement>('.pl a')
      const countText = countLink?.textContent?.trim() ?? ''
      const countMatch = countText.match(/(\d+)/)
      const count = countMatch ? parseInt(countMatch[1], 10) : 0
      const linkHref = countLink?.getAttribute('href') ?? ''
      const sectionUrl = linkHref.startsWith('http') ? linkHref : `https://music.douban.com${linkHref}`

      const items: MusicProfileAlbumItem[] = []
      const firstMod = mine.querySelector<HTMLElement>('.mod')
      if (firstMod) {
        firstMod.querySelectorAll<HTMLLIElement>('.sub-list .list-s li').forEach((li) => {
          const coverLink = li.querySelector<HTMLAnchorElement>('a.cover')
          const img = li.querySelector<HTMLImageElement>('a.cover img')
          const titleEl = li.querySelector('.album-title a')
          if (!coverLink || !img) return
          const title = titleEl?.textContent?.trim() ?? img.getAttribute('alt') ?? ''
          const posterUrl = img.src ?? ''
          const href = coverLink.getAttribute('href') ?? ''
          const itemUrl = href.startsWith('http') ? href : `https://music.douban.com${href}`
          if (title && posterUrl && href) {
            items.push({ title, posterUrl, url: itemUrl })
          }
        })
      }

      albumSection = { label, count, url: sectionUrl, items }
    }
  }

  // Musicians from #musicians
  const musicians: MusicProfileMusician[] = []
  const musiciansEl = document.getElementById('musicians')
  if (musiciansEl) {
    musiciansEl.querySelectorAll<HTMLLIElement>('.musician-sub-list .list-s li').forEach((li) => {
      const link = li.querySelector<HTMLAnchorElement>('div a')
      if (!link) return
      const name = link.textContent?.trim() ?? ''
      const href = link.getAttribute('href') ?? ''
      const itemUrl = href.startsWith('http') ? href : `https://music.douban.com${href}`
      if (name && href) musicians.push({ name, url: itemUrl })
    })
  }

  // Doulists from sidebar .mod.doulist
  const doulists: MusicProfileDoulist[] = []
  const doulistContainer = document.querySelector<HTMLElement>('.aside .mod.doulist ul.list-m')
  if (doulistContainer) {
    doulistContainer.querySelectorAll<HTMLLIElement>('li').forEach((li) => {
      const link = li.querySelector<HTMLAnchorElement>('p a.dl-title')
      const recSpan = li.querySelector<HTMLElement>('.rec')
      if (!link) return
      const title = link.textContent?.trim() ?? ''
      const href = link.getAttribute('href') ?? ''
      const followersText = recSpan?.textContent?.match(/(\d+)/)
      const followers = followersText ? parseInt(followersText[1], 10) : 0
      if (title && href) doulists.push({ title, url: href, followers })
    })
  }

  return {
    userId, displayName, avatarUrl,
    stats, albumSection, musicians, doulists,
  }
}
