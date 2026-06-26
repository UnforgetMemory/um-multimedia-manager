/**
 * 色花堂论坛列表页处理器
 * 功能：替换原始帖子列表为卡片网格预览，支持磁力一键复制
 */

import { AdultAvStore } from '@/features/adult-av'
import { t, initI18n } from '../i18n'
import { showManualAddPanel } from '../ui/manual-add-panel'
import { showCheckViewedPanel } from '../ui/check-viewed-panel'

const AVID_REGEX = /[a-zA-Z]{2,6}[-\s]?\d{2,5}/gi

interface ThreadInfo {
  url: string
  title: string
  avId: string | null
  releaseDate: string
}

let totalTasks = 0
let finishedTasks = 0

function updateHeaderInfo(headerEl: HTMLElement) {
  const infoEl = headerEl.querySelector('.umm-header-info') as HTMLElement
  const btnEl = headerEl.querySelector('.umm-copy-btn') as HTMLButtonElement
  if (infoEl) {
    AdultAvStore.getAll().then((items: any[]) => {
      infoEl.textContent = t('Header Info', {
        hidden: String(0),
        total: String(items.length),
      })
    })
  }
  if (btnEl) {
    if (totalTasks > 0 && finishedTasks >= totalTasks) {
      const magnets = document.querySelectorAll('.umm-card:not(.umm-viewed) .umm-magnet-link').length
      btnEl.disabled = false
      btnEl.textContent = `⚡ ${t('Copy All Magnets')} (${magnets})`
    } else {
      btnEl.disabled = true
      btnEl.textContent = t('Copy All Magnets')
    }
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

function createCard(info: ThreadInfo, container: HTMLElement, headerEl: HTMLElement) {
  const card = document.createElement('div')
  card.className = 'umm-card'
  if (info.avId) card.setAttribute('data-avid', info.avId)
  card.setAttribute('data-title', info.title)

  card.innerHTML = `
    <div class="umm-card-image"></div>
    <div class="umm-card-content">
      <h3 class="umm-card-title"><a href="${escapeHtml(info.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(info.title)}</a></h3>
      <p class="umm-card-meta">${escapeHtml(info.releaseDate)}</p>
      <div class="umm-card-links"></div>
    </div>
  `
  container.appendChild(card)

  if (info.avId) {
    AdultAvStore.has(info.avId).then((viewed: boolean) => {
      if (viewed) card.classList.add('umm-viewed')
    })
  }

  totalTasks++
  updateHeaderInfo(headerEl)

  fetchDetailPage(info.url).then(({ imageUrl, magnetLink }) => {
    const imgContainer = card.querySelector('.umm-card-image')!
    if (imageUrl) {
      const img = document.createElement('img')
      img.src = imageUrl
      img.loading = 'lazy'
      img.onclick = () => window.open(info.url, '_blank')
      imgContainer.appendChild(img)
    }

    if (magnetLink) {
      const a = document.createElement('a')
      a.href = magnetLink
      a.className = 'umm-magnet-link'
      a.textContent = '⚡'
      a.title = 'Copy Magnet'
      a.onclick = (e) => {
        e.preventDefault()
        navigator.clipboard.writeText(magnetLink)
        if (info.avId) AdultAvStore.add('sehuatang', info.avId, 0, info.url)
        card.classList.add('umm-viewed')
      }
      card.querySelector('.umm-card-links')?.appendChild(a)
    }
  }).catch(console.error).finally(() => {
    finishedTasks++
    updateHeaderInfo(headerEl)
  })
}

async function fetchDetailPage(url: string): Promise<{ imageUrl: string | null; magnetLink: string | null }> {
  try {
    const res = await fetch(url, { credentials: 'include' })
    const html = await res.text()
    const doc = new DOMParser().parseFromString(html, 'text/html')

    const imgEl = doc.querySelector('ignore_js_op > img')
    const imageUrl = imgEl?.getAttribute('zoomfile') || imgEl?.getAttribute('file') || null

    const magnetEl = doc.querySelector('.blockcode > div > ol > li')
    const magnetLink = magnetEl?.textContent?.trim() || null

    return { imageUrl, magnetLink }
  } catch {
    return { imageUrl: null, magnetLink: null }
  }
}

function parseThreadList(): ThreadInfo[] {
  const threads: ThreadInfo[] = []
  const rows = document.querySelectorAll('tbody[id^="normalthread_"]')

  rows.forEach(row => {
    const linkEl = row.querySelector('th a.s.xst') as HTMLAnchorElement | null
    if (!linkEl) return

    const title = linkEl.innerText.trim()
    const match = title.match(AVID_REGEX)

    threads.push({
      url: linkEl.href,
      title,
      avId: match ? match[0].toUpperCase() : null,
      releaseDate: (row.querySelector('td.by em span') as HTMLElement)?.innerText || 'N/A',
    })
  })

  return threads
}

function injectStyles() {
  if (document.getElementById('umm-sehuatang-styles')) return

  const style = document.createElement('style')
  style.id = 'umm-sehuatang-styles'
  style.textContent = `
    .umm-preview-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 25px; padding: 25px; }
    .umm-card { background: #1e1e1e; border-radius: 12px; border: 1px solid #333; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 4px 15px rgba(0,0,0,0.4); transition: transform 0.3s ease; }
    .umm-card:hover { transform: translateY(-8px); }
    .umm-card.umm-viewed { opacity: 0.6; }
    .umm-card.umm-viewed:hover { opacity: 1; }
    .umm-card-image { aspect-ratio: 16/10; background: #2a2a2a; overflow: hidden; }
    .umm-card-image img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.3s ease; cursor: pointer; }
    .umm-card:hover .umm-card-image img { transform: scale(1.05); }
    .umm-card-content { padding: 15px; display: flex; flex-direction: column; flex-grow: 1; }
    .umm-card-title a { color: #e0e0e0; text-decoration: none; font-size: 1.1rem; font-weight: 600; }
    .umm-card-meta { color: #888; font-size: 0.85rem; margin-top: 4px; }
    .umm-card-links { margin-top: auto; display: flex; justify-content: flex-end; gap: 15px; padding-top: 10px; }
    .umm-magnet-link { font-size: 1.5rem; padding: 6px 12px; border-radius: 8px; text-decoration: none; background: #443b17; color: #ffc107; }
    .umm-sehuatang-header { background: #1e1e1e; color: #a0a0a0; padding: 10px 25px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #333; position: sticky; top: 0; z-index: 1000; }
    .umm-copy-btn { background: #03dac6; color: #000; border: none; padding: 6px 16px; border-radius: 6px; cursor: pointer; font-weight: bold; }
    .umm-copy-btn:disabled { background: #3a3a3a; color: #888; }
  `
  document.head.appendChild(style)
}

function injectHeader(): HTMLElement {
  const header = document.createElement('div')
  header.className = 'umm-sehuatang-header'

  const info = document.createElement('div')
  info.className = 'umm-header-info'
  header.appendChild(info)

  const actions = document.createElement('div')
  actions.style.cssText = 'display:flex; gap:8px; align-items:center'

  const copyBtn = document.createElement('button')
  copyBtn.className = 'umm-copy-btn'
  copyBtn.disabled = true
  copyBtn.onclick = () => {
    const links = Array.from(document.querySelectorAll('.umm-card:not(.umm-viewed) .umm-magnet-link'))
    if (links.length) {
      const magnets = links.map(l => (l as HTMLAnchorElement).href).join('\r\n')
      navigator.clipboard.writeText(magnets)
      links.forEach(l => {
        const card = l.closest('.umm-card')
        const avid = card?.getAttribute('data-avid')
        if (avid) AdultAvStore.add('sehuatang', avid, 0)
        card?.classList.add('umm-viewed')
      })
    }
  }
  actions.appendChild(copyBtn)

  const menuBtn = document.createElement('button')
  menuBtn.className = 'umm-copy-btn'
  menuBtn.textContent = '☰'
  menuBtn.title = 'Menu'
  menuBtn.onclick = () => {
    const choice = prompt('1 = Manual Add\n2 = Check Viewed\n3 = Toggle Hide Viewed')
    if (choice === '1') showManualAddPanel()
    else if (choice === '2') showCheckViewedPanel()
  }
  actions.appendChild(menuBtn)

  header.appendChild(actions)
  document.body.prepend(header)
  return header
}

export async function handleSehuatangListPage(): Promise<void> {
  await initI18n()
  console.log('[UMM] Sehuatang handler activated')

  injectStyles()

  const threadList = document.getElementById('threadlisttableid')
  if (threadList) threadList.style.display = 'none'

  const container = document.createElement('div')
  container.className = 'umm-preview-grid'
  document.body.prepend(container)

  const headerEl = injectHeader()

  const threads = parseThreadList()
  console.log(`[UMM] Found ${threads.length} threads`)

  threads.forEach(info => {
    createCard(info, container, headerEl)
  })

  updateHeaderInfo(headerEl)
}
