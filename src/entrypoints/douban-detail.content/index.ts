/**
 * Douban detail page — Vue overlay content script (document_idle)
 *
 * Finds the existing shadow DOM overlay created by douban-detail-early,
 * extracts data from the underlying Douban DOM, and mounts a Vue app
 * that renders the full detail page experience inside the shadow root.
 * Original Douban page remains untouched underneath.
 */

import styleCss from './style.css?raw'
import { defineContentScript } from 'wxt/utils/define-content-script'
import { createApp } from 'vue'
import App from './App.vue'
import { Identity } from '@/features/identity'
import type { UrlIdentity } from '@/types'
import { Store } from '@/features/database'
import type { StoreRecord } from '@/types'

const OVERLAY_ID = 'umm-detail-mask'

interface DetailData {
  identity: UrlIdentity
  title: string
  originalTitle: string
  year: string
  posterSrc: string
  posterAlt: string
  posterLink: string
  ratingNum: string
  ratingPeople: string
  bigstarNum: string
  ratingBars: { label: string; pct: string }[]
  betterThan: string[]
  metaRows: { label: string; html: string }[]
  synopsisHeading: string
  synopsisHtml: string
  celebHeading: string
  celebItems: { name: string; role: string; avatar: string; link: string }[]
  awardItems: { festival: string; category: string; nominee: string; nomineeLink: string; isNomination: boolean }[]
  photoItems: { src: string; link: string; isVideo: boolean }[]
  recItems: { title: string; poster: string; rating: string; link: string; subjectId: string; isDone: boolean }[]
  rankNo: string
  rankText: string
  rankHref: string
  isMusic: boolean
  record: StoreRecord | null
}

async function extractDetailData(): Promise<DetailData | null> {
  const identity = Identity.fromUrl(location.href)
  if (!identity) return null

  const isMusic = location.href.includes('music.douban.com')

  // Title
  const h1 = document.querySelector('#content h1') as HTMLElement | null
  const titleSpan = h1?.querySelector('[property="v:itemreviewed"]')
  const yearSpan = h1?.querySelector('.year')
  const title = titleSpan?.textContent?.trim() || h1?.textContent?.trim() || ''
  const year = yearSpan?.textContent?.trim()?.replace(/[()]/g, '') || ''

  // Original name from #info
  let originalTitle = ''
  const infoEl = document.querySelector('#info')
  if (infoEl) {
    const infoParts = infoEl.innerHTML.split(/<br\s*\/?>/i)
    for (const part of infoParts) {
      const temp = document.createElement('div')
      temp.innerHTML = part.trim()
      const pl = temp.querySelector('.pl')
      if (pl?.textContent?.includes('原名')) {
        pl.remove()
        const parent = pl.parentElement
        if (parent) {
          for (let i = parent.childNodes.length - 1; i >= 0; i--) {
            const node = parent.childNodes[i]
            if (node.nodeType === Node.TEXT_NODE && /^:\s*$/.test(node.textContent || '')) {
              node.remove()
            }
          }
        }
        originalTitle = temp.textContent?.trim() || ''
        break
      }
    }
  }

  // Poster
  const posterImg = document.querySelector('#mainpic img') as HTMLImageElement | null
  const posterSrc = (posterImg?.src || '').replace(/s_ratio_poster/, 'xl')
  const posterAlt = posterImg?.alt || ''
  const posterLink = (document.querySelector('#mainpic a') as HTMLAnchorElement)?.href || ''

  // Rating
  const ratingNum = document.querySelector('.rating_num')?.textContent?.trim() || ''
  const ratingPeople = document.querySelector('.rating_people span')?.textContent?.trim() || ''
  const ratingStarEl = document.querySelector('.bigstar') as HTMLElement | null
  const bigstarNum = ratingStarEl?.className?.replace(/\D/g, '') || ''

  // Rating bars
  const ratingBars: { label: string; pct: string }[] = []
  document.querySelectorAll('.ratings-on-weight .item').forEach((item) => {
    const label = (item.querySelector('.starstop') as HTMLElement)?.textContent?.trim() || ''
    const pct = (item.querySelector('.rating_per') as HTMLElement)?.textContent?.trim() || ''
    if (label) ratingBars.push({ label, pct })
  })

  // Better than
  const betterThan: string[] = []
  document.querySelectorAll('.rating_betterthan a').forEach((a) => {
    const text = a.textContent?.trim() || ''
    if (text) betterThan.push(text)
  })

  // Meta info
  const metaRows: { label: string; html: string }[] = []
  if (infoEl) {
    const parts = infoEl.innerHTML.split(/<br\s*\/?>/i)
    for (const part of parts) {
      const trimmed = part.trim()
      if (!trimmed) continue
      const temp = document.createElement('div')
      temp.innerHTML = trimmed
      const pl = temp.querySelector('.pl')
      const label = pl ? (pl.textContent?.replace(':', '').trim() || '') : ''
      if (pl) {
        const parent = pl.parentElement
        pl.remove()
        if (parent) {
          for (let i = parent.childNodes.length - 1; i >= 0; i--) {
            const node = parent.childNodes[i]
            if (node.nodeType === Node.TEXT_NODE && /^:\s*$/.test(node.textContent || '')) {
              node.remove()
            }
          }
        }
      }
      const text = temp.innerHTML.trim()
      metaRows.push({ label, html: text })
    }
  }

  // Synopsis
  const relatedInfo = document.querySelector(
    '#content > .grid-16-8.clearfix > .article > .related-info'
  )
  const synopsisHeading = '剧情简介'
  const synopsisEl = relatedInfo?.querySelector(
    '[property="v:summary"], [property="v:des"]'
  ) || relatedInfo?.querySelector('span.all.hidden, span:not(.all.hidden)')
  // Strip script tags from synopsis HTML as XSS sanitization
  const synopsisHtml = (synopsisEl?.innerHTML || '').replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')

  // Celebrities
  const celebEl = document.querySelector('#celebrities')
  const celebHeading = '演职员'
  const celebItems: { name: string; role: string; avatar: string; link: string }[] = []
  celebEl?.querySelectorAll('.celebrity').forEach((li) => {
    const nameEl = li.querySelector('.name a')
    const roleEl = li.querySelector('.role')
    const avatarEl = li.querySelector('.avatar') as HTMLElement | null
    const bgImg = avatarEl?.style.backgroundImage || ''
    const avatarUrl = bgImg.replace(/^url\(["']?/, '').replace(/["']?\)$/, '')
    celebItems.push({
      name: nameEl?.textContent?.trim() || '',
      role: roleEl?.textContent?.trim() || '',
      avatar: avatarUrl,
      link: (nameEl as HTMLAnchorElement)?.href || '',
    })
  })

  // Awards
  const awardMod = document.querySelector(
    '#content > .grid-16-8.clearfix > .article > .mod'
  )
  const awardItems: { festival: string; category: string; nominee: string; nomineeLink: string; isNomination: boolean }[] = []
  awardMod?.querySelectorAll('ul.award').forEach((ul) => {
    const lis = ul.querySelectorAll('li')
    if (lis.length >= 2) {
      const festival = lis[0]?.querySelector('a')?.textContent?.trim() || lis[0]?.textContent?.trim() || ''
      const category = lis[1]?.textContent?.trim() || ''
      const nomineeEl = lis[2]?.querySelector('a') as HTMLAnchorElement | null
      const nominee = nomineeEl?.textContent?.trim() || lis[2]?.textContent?.trim() || ''
      const nomineeLink = nomineeEl?.href || ''
      const isNomination = category.includes('提名')
      if (festival) awardItems.push({ festival, category, nominee, nomineeLink, isNomination })
    }
  })

  // Rank
  const rankLabel = document.querySelector('.rank-label')
  const rankNo = rankLabel?.querySelector('.rank-label-no')?.textContent?.trim() || ''
  const rankLink = rankLabel?.querySelector('.rank-label-link a') as HTMLAnchorElement | null
  const rankText = rankLink?.textContent?.trim() || ''
  const rankHref = rankLink?.href || ''

  // Photos
  const photoEl = document.querySelector('#related-pic')
  const photoItems: { src: string; link: string; isVideo: boolean }[] = []
  photoEl?.querySelectorAll('.related-pic-bd li').forEach((li) => {
    const videoEl = li.querySelector('.related-pic-video') as HTMLElement | null
    const imgEl = li.querySelector('img') as HTMLImageElement | null
    const linkEl = (li.querySelector('a') as HTMLAnchorElement) || null
    if (videoEl) {
      const bgImg = videoEl.style.backgroundImage || ''
      const src = bgImg.replace(/^url\(["']?/, '').replace(/["']?\)$/, '')
      photoItems.push({ src, link: linkEl?.href || '', isVideo: true })
    } else if (imgEl) {
      photoItems.push({ src: imgEl.src, link: linkEl?.href || '', isVideo: false })
    }
  })

  // Recommendations
  const recEl = document.querySelector('#recommendations')
  const recItems: { title: string; poster: string; rating: string; link: string; subjectId: string; isDone: boolean }[] = []
  recEl?.querySelectorAll('.recommendations-bd dl').forEach((dl) => {
    const img = dl.querySelector('dt img') as HTMLImageElement | null
    const linkEl = dl.querySelector('dd a') as HTMLAnchorElement | null
    const rate = dl.querySelector('.subject-rate')?.textContent?.trim() || ''
    const href = linkEl?.href || ''
    const idMatch = href.match(/\/subject\/(\d+)/)
    recItems.push({
      title: linkEl?.textContent?.trim() || img?.alt || '',
      poster: img?.src || '',
      rating: rate,
      link: href,
      subjectId: idMatch ? idMatch[1] : '',
      isDone: false,
    })
  })
  // Batch-check watched status from IndexedDB
  if (recItems.length > 0) {
    const subjectIds = new Set(recItems.map(r => r.subjectId).filter(Boolean))
    if (subjectIds.size > 0) {
      try {
        // Use dedicated API to get watched subject IDs instead of fetching all records
        const watchedMap = await Store.dbGetWatchedIds(['douban_records'])
        const watchedIds = watchedMap['douban_records'] || []
        const doneSet = new Set(watchedIds.map(id => id.replace(/^(movie|music|tv)::/, '')))
        for (const item of recItems) {
          if (doneSet.has(item.subjectId)) item.isDone = true
        }
      } catch { /* silent */ }
    }
  }

  return {
    identity,
    title,
    originalTitle,
    year,
    posterSrc,
    posterAlt,
    posterLink,
    ratingNum,
    ratingPeople,
    bigstarNum,
    ratingBars,
    betterThan,
    metaRows,
    synopsisHeading,
    synopsisHtml,
    celebHeading,
    celebItems,
    awardItems,
    photoItems,
    recItems,
    rankNo,
    rankText,
    rankHref,
    isMusic,
    record: null,
  }
}

async function loadRecord(identity: UrlIdentity): Promise<StoreRecord | null> {
  try {
    const prefix = `${identity.type}::`
    const key = `${prefix}${identity.providerId}`
    return await Store.dbGet('douban_records', key)
  } catch {
    return null
  }
}

export default defineContentScript({
  matches: [
    '*://movie.douban.com/subject/*',
    '*://music.douban.com/subject/*',
  ],
  runAt: 'document_idle',
  cssInjectionMode: 'manual',

  async main() {
    try {
      const overlay = document.getElementById(OVERLAY_ID)
      if (!overlay?.shadowRoot) return

      const shadow = overlay.shadowRoot

      // Inject component CSS
      const style = document.createElement('style')
      style.textContent = styleCss
      shadow.appendChild(style)

      // Apply theme synchronously BEFORE removing loading
      const host = shadow.host as HTMLElement
      const theme = host.getAttribute('data-theme') ||
        (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      host.classList.remove('umm-theme--light', 'umm-theme--dark')
      host.classList.add(`umm-theme--${theme}`)
      chrome.storage?.onChanged?.addListener((changes, area) => {
        if (area === 'local' && changes['umm:appearance']) {
          chrome.storage?.local?.get?.('umm:appearance', (data: Record<string, unknown>) => {
            const raw = (data['umm:appearance'] as Record<string, unknown> | undefined)?.theme as string ?? 'light'
            const t = raw === 'dark' ? 'dark' : (raw === 'light' ? 'light' :
              (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'))
            host.classList.remove('umm-theme--light', 'umm-theme--dark')
            host.classList.add(`umm-theme--${t}`)
          })
        }
      })

      // Extract data from underlying Douban DOM
      const detailData = await extractDetailData()
      if (!detailData) {
        console.warn('[UMM] Could not extract detail data from page')
        return
      }

      // Load record from IndexedDB
      detailData.record = await loadRecord(detailData.identity)

      // Remove loading spinner
      const loading = shadow.querySelector('.ov-loading')
      if (loading) loading.remove()

      // Hide native Douban nav bars
      const globalNav = document.getElementById('db-global-nav')
      const movieNav = document.getElementById('db-nav-movie')
      const musicNav = document.getElementById('db-nav-music')
      if (globalNav) globalNav.style.display = 'none'
      if (movieNav) movieNav.style.display = 'none'
      if (musicNav) musicNav.style.display = 'none'

      // Mount Vue app into shadow DOM
      const app = createApp(App, { detailData })
      const container = document.createElement('div')
      shadow.appendChild(container)
      app.mount(container)

      // Poll IndexedDB for record changes (updates status/rating dynamically)
      const recordPoller = setInterval(async () => {
        if (!detailData.identity) return
        const updated = await loadRecord(detailData.identity)
        if (updated && app && app._instance) {
          const vm = app._instance?.proxy as unknown as Record<string, unknown>
          if (vm && typeof vm.updateRecord === 'function') {
            vm.updateRecord(updated)
          }
        }
      }, 3000)

      // Expose dismiss function for cleanup
      ;(window as unknown as Record<string, unknown>).__ummDismissDetailMask = () => {
        clearInterval(recordPoller)
        app.unmount()
        container.remove()
        style.remove()
      }
    } catch (err) {
      console.warn('[UMM] Detail overlay error:', err)
    }
  },
})
