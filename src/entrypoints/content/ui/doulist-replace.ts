/**
 * Self-contained doulist management modal for Douban detail pages.
 *
 * Fetches all doulists via Douban API, shows a themed modal,
 * and uses addToDoulist/removeFromDoulist API calls to toggle
 * the current subject's membership in the selected doulist.
 *
 * Triggered by clicking ".lnk-doulist-add" on the page.
 */

import type { UrlIdentity } from '@/types'
import { FloatingToast } from '../utils/toast'

export const DL_MODAL_ID = 'umm-dl-modal'
const DOULIST_API_PAGE_SIZE = 100

interface DoulistItem {
  id: string
  name: string
  count: string
  is_collected?: boolean
  is_private?: boolean
}

interface SubjectInfo {
  subjectId: string
  cat: string
  kind: string
  url: string
  ck: string
}

const DOULIST_CAT_MAP: Record<string, string> = {
  movie: '1002',
  tv: '1002',
  music: '1003',
  book: '1001',
}

async function addToDoulist(doulistId: string, params: {
  sid: string; skind: string; comment: string; ck: string
}): Promise<boolean> {
  const body = new URLSearchParams({
    sid: params.sid,
    skind: params.skind,
    comment: params.comment,
    ck: params.ck,
  })
  try {
    const resp = await fetch(`/j/doulist/${doulistId}/additem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      credentials: 'include',
    })
    return resp.ok || resp.status === 302
  } catch {
    return false
  }
}

async function removeFromDoulist(doulistId: string, params: {
  tkind: string; tid: string; ck: string
}): Promise<boolean> {
  const body = new URLSearchParams({
    tkind: params.tkind,
    tid: params.tid,
    ck: params.ck,
  })
  try {
    const resp = await fetch(`/j/doulist/${doulistId}/removeitem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      credentials: 'include',
    })
    return resp.ok || resp.status === 302
  } catch {
    return false
  }
}

/**
 * Direct API call to fetch ALL doulists for a subject.
 * Douban's UI only renders 10 items initially; the full list
 * requires a paginated API call with a larger limit.
 */
async function fetchAllDoulists(subject: SubjectInfo): Promise<DoulistItem[]> {
  const url = `/j/doulist/subject_doulists?start=0&limit=${DOULIST_API_PAGE_SIZE}&tkind=${subject.cat}&tid=${subject.subjectId}`
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    const resp = await fetch(url, {
      credentials: 'include',
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!resp.ok) {
      console.warn('[UMM] Doulist API returned', resp.status)
      return []
    }
    const raw = await resp.text()
    let parsed: unknown
    try { parsed = JSON.parse(raw) } catch {
      console.warn('[UMM] Doulist API response is not JSON:', raw.slice(0, 200))
      return []
    }
    console.log('[UMM] Doulist API raw response:', JSON.stringify(parsed).slice(0, 500))
    // Try multiple response shapes: direct array, or object with
    // doulists / items / data / results key
    let arr: unknown[] = []
    if (Array.isArray(parsed)) {
      arr = parsed
    } else if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>
      arr = (obj.doulists as unknown[]) ||
            (obj.doulist as unknown[]) ||
            (obj.items as unknown[]) ||
            (obj.data as unknown[]) ||
            (obj.results as unknown[]) ||
            (obj.list as unknown[]) ||
            []
    }
    if (arr.length > 0) {
      console.log('[UMM] Doulist item keys:', Object.keys(arr[0] as Record<string, unknown>))
      console.log('[UMM] Doulist first item:', JSON.stringify(arr[0]).slice(0, 300))
    }
    const items = arr.map((item: unknown) => {
      const i = item as Record<string, unknown>
      const doulistId = String(i.id ?? i.ID ?? i.doulist_id ?? i.doulistId ?? '')
      return {
      id: doulistId,
      name: (String(i.name ?? i.title ?? i.Name ?? '')).trim(),
      count: i.count ? String(i.count) : '',
      is_collected: Boolean(i.is_collected ?? false),
      is_private: Boolean(i.is_private ?? false),
    }}).filter(item => item.id && item.name)
    console.log(`[UMM] fetchAllDoulists: parsed ${items.length} items from API`)
    return items
  } catch (e) {
    console.warn('[UMM] fetchAllDoulists failed:', e)
    return []
  }
}

function buildThemedDialog(
  data: { items: DoulistItem[]; subject: SubjectInfo; comment: string }
): { overlay: HTMLElement; refresh: (newItems: DoulistItem[]) => void } {
  let items: DoulistItem[] = data.items
  let selectedId = ''
  const subject = data.subject

  // Re-read theme each time to stay in sync with extension settings
  const isDark = () => document.documentElement.getAttribute('data-umm-theme') === 'dark'
  const c = (l: string, d: string): string => isDark() ? d : l

  // ── Overlay (targeted resets instead of all:initial which destroys z-index/display) ──
  const overlay = document.createElement('div')
  overlay.id = DL_MODAL_ID
  overlay.style.cssText = [
    'position:fixed;inset:0;z-index:99999',
    `background:${c('rgba(0,0,0,0.35)','rgba(0,0,0,0.55)')}`,
    'display:flex;align-items:center;justify-content:center',
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
    'margin:0;padding:0;border:none;box-sizing:border-box',
    'overflow-y:auto;pointer-events:auto',
  ].join(';')

  // ── Panel ──
  const panel = document.createElement('div')
  panel.className = 'umm-dl-panel'
  panel.style.cssText = [
    `background:${c('#fff','#25262b')}`,
    `border:1px solid ${c('#e8e8e8','#373a40')}`,
    'border-radius:14px',
    `box-shadow:0 12px 48px ${c('rgba(0,0,0,0.15)','rgba(0,0,0,0.4)')}`,
    'width:800px;max-width:calc(100vw-32px);min-width:340px',
    'max-height:calc(100vh-64px)',
    'display:flex;flex-direction:column;overflow:hidden',
  ].join(';')
  overlay.appendChild(panel)

  // ── Responsive + style isolation CSS ──
  const rStyle = document.createElement('style')
  rStyle.textContent = [
    '@media(max-width:479px){.umm-dl-panel{width:calc(100vw-16px)!important}}',
    '@media(min-width:480px)and (max-width:639px){.umm-dl-panel{width:480px!important}}',
    '@media(min-width:640px)and (max-width:767px){.umm-dl-panel{width:580px!important}}',
    '@media(min-width:768px)and (max-width:1023px){.umm-dl-panel{width:660px!important}}',
    '@media(min-width:1024px)and (max-width:1279px){.umm-dl-panel{width:740px!important}}',
    '@media(min-width:1280px){.umm-dl-panel{width:860px!important}}',
    // Font-size scales with viewport
    '@media(max-width:639px){.umm-dl-panel td,.umm-dl-panel th{font-size:12px!important}}',
    '@media(min-width:640px)and (max-width:1023px){.umm-dl-panel td,.umm-dl-panel th{font-size:13px!important}}',
    '@media(min-width:1024px){.umm-dl-panel td,.umm-dl-panel th{font-size:14px!important}}',
    '@media(min-width:1280px){.umm-dl-panel td{font-size:14.5px!important}.umm-dl-panel th{font-size:12px!important}}',
    // Placeholder colors
    `#umm-dl-modal input::placeholder{color:${c('#aaa','#666')}!important}`,
    `#umm-dl-modal textarea::placeholder{color:${c('#aaa','#666')}!important}`,
    // Scrollbar
    '#umm-dl-modal ::-webkit-scrollbar{width:7px!important;height:7px!important}',
    `#umm-dl-modal ::-webkit-scrollbar-thumb{background:${c('#ccc','#45484f')}!important;border-radius:4px!important}`,
    `#umm-dl-modal ::-webkit-scrollbar-track{background:transparent!important}`,
  ].join('')
  overlay.appendChild(rStyle)

  // ── Header ──
  const header = document.createElement('div')
  header.style.cssText = ['display:flex;align-items:center;justify-content:space-between','padding:18px 28px',`border-bottom:1px solid ${c('#e8e8e8','#373a40')}`,`background:${c('#fafafa','#2c2e33')}`].join(';')
  const title = document.createElement('h3')
  title.textContent = '添加到片单'
  title.style.cssText = ['margin:0','font-size:17px','font-weight:600','letter-spacing:-0.01em',`color:${c('#1a1a1a','#f0f0f0')}`].join(';')
  const closeBtn = document.createElement('button')
  closeBtn.innerHTML = '\u2715'
  closeBtn.setAttribute('aria-label','关闭')
  closeBtn.style.cssText = ['width:34px;height:34px;border:none;background:transparent;cursor:pointer',`color:${c('#999','#888')};font-size:16px`,'display:flex;align-items:center;justify-content:center;border-radius:8px','transition:background .15s,color .15s'].join(';')
  closeBtn.onmouseenter = () => { closeBtn.style.background = c('#f0f0f0','#373a40'); closeBtn.style.color = c('#333','#e8e8e8') }
  closeBtn.onmouseleave = () => { closeBtn.style.background = 'transparent'; closeBtn.style.color = c('#999','#888') }
  closeBtn.addEventListener('click', () => { overlay.remove(); document.body.style.overflow = '' })
  header.append(title, closeBtn)
  panel.appendChild(header)

  // ── Body ──
  const body = document.createElement('div')
  body.style.cssText = ['flex:1;overflow-y:auto;overscroll-behavior:contain','padding:18px 24px'].join(';')
  panel.appendChild(body)

  // ── Confirm overlay ──
  const confirmBox = document.createElement('div')
  confirmBox.style.display = 'none'
  confirmBox.style.cssText = ['position:absolute;inset:0;z-index:10',`background:${c('rgba(255,255,255,0.93)','rgba(37,38,43,0.93)')}`,'display:none;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:32px;text-align:center'].join(';')
  confirmBox.innerHTML = '<p id="umm-dl-confirm-text" style="margin:0;font-size:14.5px;font-weight:500;line-height:1.5"></p><div style="display:flex;gap:12px"><button id="umm-dl-confirm-yes" style="padding:10px 28px;border:none;border-radius:10px;cursor:pointer;font-size:13.5px;font-weight:600"></button><button id="umm-dl-confirm-no" style="padding:10px 28px;border:1px solid;border-radius:10px;cursor:pointer;font-size:13.5px;font-weight:500"></button></div>'
  panel.style.position = 'relative'
  panel.appendChild(confirmBox)

  const confirmText = confirmBox.querySelector('#umm-dl-confirm-text')!
  const confirmYes = confirmBox.querySelector('#umm-dl-confirm-yes') as HTMLElement
  const confirmNo = confirmBox.querySelector('#umm-dl-confirm-no') as HTMLElement

  function showConfirm(msg: string, yesLabel: string, noLabel: string, action: () => void): void {
    confirmText.textContent = msg
    confirmYes.textContent = yesLabel
    confirmNo.textContent = noLabel
    confirmYes.style.cssText = ['padding:10px 28px;border:none;border-radius:10px;cursor:pointer;font-size:13.5px;font-weight:600',`background:${c('#4f6ef7','#6e8aff')};color:#fff`].join(';')
    confirmNo.style.cssText = ['padding:10px 28px;border-radius:10px;cursor:pointer;font-size:13.5px;font-weight:500',`border:1px solid ${c('#d0d0d0','#45484f')}`,`background:${c('#fff','#373a40')};color:${c('#333','#c8c8c8')}`].join(';')
    confirmBox.style.display = 'flex'
    confirmYes.onclick = () => { confirmBox.style.display = 'none'; action() }
    confirmNo.onclick = () => { confirmBox.style.display = 'none' }
  }

  // ── Search bar ──
  const searchInput = document.createElement('input')
  searchInput.type = 'text'
  searchInput.placeholder = '搜索片单...'
  searchInput.style.cssText = ['width:100%;box-sizing:border-box;height:40px;padding:0 14px;margin-bottom:14px',`background:${c('#f5f5f5','#1a1b1e')}`,`border:1px solid ${c('#d0d0d0','#45484f')}`,`color:${c('#1a1a1a','#e8e8e8')}`,'border-radius:10px;font-size:14px;outline:none','transition:border-color .15s,box-shadow .15s'].join(';')
  searchInput.onfocus = () => { searchInput.style.borderColor = c('#4f6ef7','#6e8aff'); searchInput.style.boxShadow = `0 0 0 3px ${c('rgba(79,110,247,0.12)','rgba(110,138,255,0.15)')}` }
  searchInput.onblur = () => { searchInput.style.borderColor = c('#d0d0d0','#373a40'); searchInput.style.boxShadow = 'none' }
  body.appendChild(searchInput)

  // ── Table ──
  const tableWrap = document.createElement('div')
  tableWrap.style.cssText = [`border:1px solid ${c('#e8e8e8','#373a40')}`,'border-radius:10px;overflow:hidden;max-height:360px;overflow-y:auto;overscroll-behavior:contain'].join(';')

  const table = document.createElement('table')
  table.style.cssText = 'width:100%;border-collapse:collapse;table-layout:fixed'

  // Thead
  const thead = document.createElement('thead')
  thead.style.cssText = [`background:${c('#fafafa','#2c2e33')}`,`border-bottom:1px solid ${c('#e8e8e8','#373a40')}`,'position:sticky;top:0;z-index:1'].join(';')
  const hRow = document.createElement('tr')
  const h = (w: string, align: string) => `padding:10px 12px;font-size:11.5px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:${c('#888','#999')};width:${w};text-align:${align}`

  hRow.innerHTML = [
    '<th style="' + h('38px','center') + '">🔒</th>',
    '<th style="' + h('64px','center') + '">收藏</th>',
    '<th style="' + h('auto','left') + '">片单名称</th>',
    '<th style="' + h('76px','right') + '">统计</th>',
  ].join('')
  thead.appendChild(hRow)
  table.appendChild(thead)

  // Tbody
  const tbody = document.createElement('tbody')
  const td = (align: string) => `padding:10px 12px;font-size:13.5px;color:${c('#333','#c8c8c8')};text-align:${align};border-bottom:1px solid ${c('#eee','#2c2e33')};transition:background .12s`

  function renderItems(filter: string): void {
    tbody.innerHTML = ''
    const q = filter.toLowerCase().trim()
    let hasVisible = false

    for (const item of items) {
      if (q && !item.name.toLowerCase().includes(q)) continue
      hasVisible = true
      const row = document.createElement('tr')
      row.style.cursor = 'pointer'
      row.onmouseenter = () => { row.style.background = c('#f5f5f5','#2c2e33') }
      row.onmouseleave = () => {
        if (item.id !== selectedId) row.style.background = 'transparent'
      }

      // Column 1: Lock icon
      const lockCell = document.createElement('td')
      lockCell.style.cssText = td('center')
      lockCell.textContent = item.is_private ? '🔒' : ''

      // Column 2: Toggle button (larger, clickable)
      const toggleCell = document.createElement('td')
      toggleCell.style.cssText = td('center') + ';cursor:pointer'
      const toggleBtn = document.createElement('span')
      const collected = item.is_collected ?? false
      toggleBtn.textContent = collected ? '\u2713' : '\u25CB'
      toggleBtn.style.cssText = [
        'display:inline-flex;align-items:center;justify-content:center',
        'width:28px;height:28px;border-radius:50%',
        'font-size:16px;font-weight:700',
        'transition:all .15s',
        collected
          ? `color:${c('#0f7a43','#6fcf73')};background:${c('rgba(15,122,67,0.1)','rgba(111,207,115,0.12)')}`
          : `color:${c('#bbb','#555')}`,
      ].join(';')
      toggleCell.appendChild(toggleBtn)
      toggleCell.addEventListener('click', (e) => {
        e.stopPropagation()
        const cur = item.is_collected ?? false
        if (cur) {
          showConfirm('确认从该片单中移除此条目？','确认移出','取消', async () => {
            const ok = await removeFromDoulist(item.id, { tkind: subject.cat, tid: subject.subjectId, ck: subject.ck })
            if (ok) { item.is_collected = false; renderItems(searchInput.value) }
          })
        } else {
          showConfirm('确认将本条目添加到该片单？','确认添加','取消', async () => {
            const ok = await addToDoulist(item.id, { sid: subject.subjectId, skind: subject.kind, ck: subject.ck, comment: '' })
            if (ok) { item.is_collected = true; renderItems(searchInput.value) }
          })
        }
      })

      // Column 3: Name (click to select/deselect)
      const nameCell = document.createElement('td')
      nameCell.style.cssText = td('left') + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500'
      // Use a custom attribute to re-apply highlight
      nameCell.textContent = item.name
      if (item.id === selectedId) {
        row.style.background = c('#f0f4ff','rgba(110,138,255,0.08)')
        row.style.outline = '1px solid ' + c('#4f6ef7','#6e8aff')
        row.style.outlineOffset = '-1px'
      }
      row.addEventListener('click', () => {
        selectedId = selectedId === item.id ? '' : item.id
        renderItems(searchInput.value)
      })

      // Column 4: Count
      const countCell = document.createElement('td')
      countCell.style.cssText = td('right') + ';font-size:12px;color:' + c('#888','#999')
      const m = item.count.match(/(\\d+)/)
      countCell.textContent = m ? m[1] : item.count

      row.append(lockCell, toggleCell, nameCell, countCell)
      tbody.appendChild(row)
    }

    if (!hasVisible) {
      const emptyRow = document.createElement('tr')
      const emptyCell = document.createElement('td')
      emptyCell.colSpan = 4
      emptyCell.style.cssText = ['padding:40px;text-align:center',`color:${c('#999','#777')}`,'font-size:13.5px'].join(';')
      emptyCell.textContent = q ? '未找到匹配的片单' : '暂无片单'
      emptyRow.appendChild(emptyCell)
      tbody.appendChild(emptyRow)
    }
  }

  table.appendChild(tbody)
  tableWrap.appendChild(table)
  body.appendChild(tableWrap)

  // ── Footer ──
  const footer = document.createElement('div')
  footer.style.cssText = ['display:flex;align-items:center;justify-content:flex-end;gap:10px','padding:14px 24px',`border-top:1px solid ${c('#e8e8e8','#373a40')}`,`background:${c('#fafafa','#2c2e33')}`].join(';')

  const cancelBtn = document.createElement('button')
  cancelBtn.textContent = '取消'
  cancelBtn.style.cssText = `padding:9px 28px;border:1px solid ${c('#d0d0d0','#45484f')};border-radius:10px;background:${c('#fff','#373a40')};color:${c('#333','#c8c8c8')};font-size:13.5px;font-weight:500;cursor:pointer`
  cancelBtn.addEventListener('click', () => { overlay.remove(); document.body.style.overflow = '' })

  const saveBtn = document.createElement('button')
  saveBtn.textContent = '保存'
  saveBtn.style.cssText = `padding:9px 28px;border:none;border-radius:10px;background:${c('#4f6ef7','#6e8aff')};color:#fff;font-size:13.5px;font-weight:600;cursor:pointer;transition:opacity .15s`
  saveBtn.addEventListener('click', async () => {
    if (!selectedId) return
    const item = items.find(it => it.id === selectedId)
    if (!item) return
    saveBtn.disabled = true
    saveBtn.textContent = '保存中...'
    try {
      const ok = item.is_collected
        ? await removeFromDoulist(selectedId, { tkind: subject.cat, tid: subject.subjectId, ck: subject.ck })
        : await addToDoulist(selectedId, { sid: subject.subjectId, skind: subject.kind, ck: subject.ck, comment: '' })
      if (ok) {
        item.is_collected = !item.is_collected
        saveBtn.textContent = '✓ 已保存'
        setTimeout(() => overlay.remove(), 800)
      } else { throw new Error('API fail') }
    } catch {
      saveBtn.textContent = '保存失败'
      setTimeout(() => { saveBtn.textContent = '保存'; saveBtn.disabled = false }, 2000)
    }
  })

  footer.append(cancelBtn, saveBtn)
  panel.appendChild(footer)

  searchInput.addEventListener('input', () => renderItems(searchInput.value))
  renderItems('')

  const refresh = (newItems: DoulistItem[]) => { items = newItems; selectedId = ''; renderItems(searchInput.value) }
  return { overlay, refresh }
}

export function initDoulistReplacement(identity: UrlIdentity): void {
  function getSubjectInfo(): SubjectInfo | null {
    const ck = document.querySelector<HTMLInputElement>('input[name="ck"]')?.value || ''
    if (!identity.providerId || !ck) return null
    return {
      subjectId: identity.providerId,
      cat: DOULIST_CAT_MAP[identity.type] || '',
      kind: identity.type,
      url: location.href,
      ck,
    }
  }

  document.addEventListener('click', (e) => {
    const trigger = (e.target as HTMLElement).closest('.lnk-doulist-add, .umm-dl-trigger') as HTMLElement | null
    if (!trigger) return
    e.preventDefault()
    e.stopImmediatePropagation()
    if (document.getElementById(DL_MODAL_ID)) return

    const subject = getSubjectInfo()
    if (!subject) return

    fetchAllDoulists(subject).then(items => {
      if (items.length === 0) {
        FloatingToast.info('UMM', '无法加载片单列表，请重试')
        return
      }
      const { overlay } = buildThemedDialog({ items, subject, comment: '' })
      document.body.appendChild(overlay)
      document.body.style.overflow = 'hidden'
    }).catch(() => {
      FloatingToast.error('UMM', '片单加载失败')
    })
  }, { capture: true })

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const m = document.getElementById(DL_MODAL_ID)
      if (m) { m.remove(); document.body.style.overflow = '' }
    }
  })
}
