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
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' },
      body: body.toString(),
      credentials: 'include',
    })
    return resp.ok || resp.status === 302
  } catch {
    return false
  }
}

async function createDoulist(params: {
  title: string; category: string; isPrivate: boolean; ck: string
}): Promise<{ id: string; name: string } | null> {
  const body = new URLSearchParams({
    title: params.title,
    category: params.category,
    is_private: String(params.isPrivate),
    ck: params.ck,
  })
  try {
    const resp = await fetch('/j/doulist/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' },
      body: body.toString(),
      credentials: 'include',
    })
    const data = await resp.json()
    if (data.r === 0 && data.id) return { id: String(data.id), name: data.name || params.title }
    return null
  } catch {
    return null
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
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' },
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

interface DialogTheme {
  overlayBg: string
  panelBg: string
  panelBorder: string
  panelShadow: string
  headerBg: string
  headerBorder: string
  titleColor: string
  closeColor: string
  closeHoverBg: string
  closeHoverColor: string
  textPrimary: string
  textSecondary: string
  textMuted: string
  surfaceAlt: string
  borderDark: string
  inputBg: string
  inputBorder: string
  accent: string
  accentGlow: string
  accentSubtle: string
  tableHeaderBg: string
  theadText: string
  rowBorder: string
  rowHover: string
  selectedBg: string
  checkedColor: string
  checkedBg: string
  uncheckedColor: string
  confirmBg: string
  emptyText: string
  scrollThumb: string
  placeholderColor: string
  labelColor: string
  yesBtnBg: string
  noBtnBg: string
  noBtnText: string
  noBtnBorder: string
  borderInputBlur: string
}

function createDialogTheme(dark: boolean): DialogTheme {
  return {
    overlayBg: dark ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.35)',
    panelBg: dark ? '#25262b' : '#fff',
    panelBorder: dark ? '#373a40' : '#e8e8e8',
    panelShadow: dark ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.15)',
    headerBg: dark ? '#2c2e33' : '#fafafa',
    headerBorder: dark ? '#373a40' : '#e8e8e8',
    titleColor: dark ? '#f0f0f0' : '#1a1a1a',
    closeColor: dark ? '#888' : '#999',
    closeHoverBg: dark ? '#373a40' : '#f0f0f0',
    closeHoverColor: dark ? '#e8e8e8' : '#333',
    textPrimary: dark ? '#e8e8e8' : '#1a1a1a',
    textSecondary: dark ? '#c8c8c8' : '#333',
    textMuted: dark ? '#999' : '#888',
    surfaceAlt: dark ? '#373a40' : '#fff',
    borderDark: dark ? '#45484f' : '#d0d0d0',
    inputBg: dark ? '#1a1b1e' : '#f5f5f5',
    inputBorder: dark ? '#45484f' : '#d0d0d0',
    accent: dark ? '#6e8aff' : '#4f6ef7',
    accentGlow: dark ? 'rgba(110,138,255,0.15)' : 'rgba(79,110,247,0.12)',
    accentSubtle: dark ? 'rgba(110,138,255,0.08)' : 'rgba(79,110,247,0.06)',
    tableHeaderBg: dark ? '#2c2e33' : '#fafafa',
    theadText: dark ? '#999' : '#888',
    rowBorder: dark ? '#2c2e33' : '#eee',
    rowHover: dark ? '#2c2e33' : '#f5f5f5',
    selectedBg: dark ? 'rgba(110,138,255,0.08)' : '#f0f4ff',
    checkedColor: dark ? '#6fcf73' : '#0f7a43',
    checkedBg: dark ? 'rgba(111,207,115,0.12)' : 'rgba(15,122,67,0.1)',
    uncheckedColor: dark ? '#555' : '#bbb',
    confirmBg: dark ? 'rgba(37,38,43,0.93)' : 'rgba(255,255,255,0.93)',
    emptyText: dark ? '#777' : '#999',
    scrollThumb: dark ? '#45484f' : '#ccc',
    placeholderColor: dark ? '#666' : '#aaa',
    labelColor: dark ? '#999' : '#666',
    yesBtnBg: dark ? '#6e8aff' : '#4f6ef7',
    noBtnBg: dark ? '#373a40' : '#fff',
    noBtnText: dark ? '#c8c8c8' : '#333',
    noBtnBorder: dark ? '#45484f' : '#d0d0d0',
    borderInputBlur: dark ? '#373a40' : '#d0d0d0',
  }
}

function buildThemedDialog(
  data: { items: DoulistItem[]; subject: SubjectInfo; comment: string }
): { overlay: HTMLElement; refresh: (newItems: DoulistItem[]) => void } {
  let items: DoulistItem[] = data.items
  let selectedId = ''
  const subject = data.subject

  // Re-read theme each time to stay in sync with extension settings
  const isDark = () => document.documentElement.classList.contains('dark') || document.documentElement.getAttribute('data-umm-theme') === 'dark'
  const theme = createDialogTheme(isDark())

  // ── Overlay (targeted resets instead of all:initial which destroys z-index/display) ──
  const overlay = document.createElement('div')
  overlay.id = DL_MODAL_ID
  overlay.style.cssText = [
    'position:fixed;inset:0;z-index:99999',
    `background:${theme.overlayBg}`,
    'display:flex;align-items:center;justify-content:center',
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
    'margin:0;padding:0;border:none;box-sizing:border-box',
    'overflow-y:auto;pointer-events:auto',
  ].join(';')

  // ── Panel ──
  const panel = document.createElement('div')
  panel.className = 'umm-dl-panel'
  panel.style.cssText = [
    `background:${theme.panelBg}`,
    `border:1px solid ${theme.panelBorder}`,
    'border-radius:14px',
    `box-shadow:0 12px 48px ${theme.panelShadow}`,
    'width:800px;max-width:calc(100vw-32px);min-width:340px',
    'max-height:calc(100vh-64px)',
    'display:flex;flex-direction:column;overflow:hidden',
  ].join(';')
  overlay.appendChild(panel)

  // ── Responsive + style isolation CSS (13-tier breakpoint system) ──
  const rStyle = document.createElement('style')
  rStyle.textContent = [
    '@media(max-width:319px){.umm-dl-panel{width:calc(100vw-16px)!important}}',
    '@media(min-width:320px)and (max-width:374px){.umm-dl-panel{width:calc(100vw-16px)!important}}',
    '@media(min-width:375px)and (max-width:479px){.umm-dl-panel{width:calc(100vw-24px)!important}}',
    '@media(min-width:480px)and (max-width:639px){.umm-dl-panel{width:480px!important}}',
    '@media(min-width:640px)and (max-width:767px){.umm-dl-panel{width:580px!important}}',
    '@media(min-width:768px)and (max-width:1023px){.umm-dl-panel{width:660px!important}}',
    '@media(min-width:1024px)and (max-width:1279px){.umm-dl-panel{width:740px!important}}',
    '@media(min-width:1280px)and (max-width:1535px){.umm-dl-panel{width:860px!important}}',
    '@media(min-width:1536px)and (max-width:1919px){.umm-dl-panel{width:880px!important}}',
    '@media(min-width:1920px)and (max-width:2559px){.umm-dl-panel{width:920px!important}}',
    '@media(min-width:2560px)and (max-width:3199px){.umm-dl-panel{width:960px!important}}',
    '@media(min-width:3200px)and (max-width:3839px){.umm-dl-panel{width:1000px!important}}',
    '@media(min-width:3840px)and (max-width:5119px){.umm-dl-panel{width:1040px!important}}',
    '@media(min-width:5120px){.umm-dl-panel{width:1080px!important}}',
    // Font-size scales with viewport
    '@media(max-width:639px){.umm-dl-panel td,.umm-dl-panel th{font-size:12px!important}}',
    '@media(min-width:640px)and (max-width:1023px){.umm-dl-panel td,.umm-dl-panel th{font-size:13px!important}}',
    '@media(min-width:1024px)and (max-width:1535px){.umm-dl-panel td,.umm-dl-panel th{font-size:14px!important}}',
    '@media(min-width:1536px){.umm-dl-panel td{font-size:14.5px!important}.umm-dl-panel th{font-size:12px!important}}',
    // Placeholder colors
    `#umm-dl-modal input::placeholder{color:${theme.placeholderColor}!important}`,
    `#umm-dl-modal textarea::placeholder{color:${theme.placeholderColor}!important}`,
    // Scrollbar
    '#umm-dl-modal ::-webkit-scrollbar{width:7px!important;height:7px!important}',
    `#umm-dl-modal ::-webkit-scrollbar-thumb{background:${theme.scrollThumb}!important;border-radius:4px!important}`,
    `#umm-dl-modal ::-webkit-scrollbar-track{background:transparent!important}`,
    // Loading spinner for add/remove operations
    '@keyframes umm-dl-spin{to{transform:rotate(360deg)}}',
    '.umm-dl-spinner{display:inline-block;width:14px;height:14px;border:2px solid rgba(128,128,128,0.25);border-top-color:currentColor;border-radius:50%;animation:umm-dl-spin .6s linear infinite;vertical-align:middle}',
  ].join('')
  overlay.appendChild(rStyle)

  // ── Header ──
  const header = document.createElement('div')
  header.style.cssText = ['display:flex;align-items:center;justify-content:space-between','padding:18px 28px',`border-bottom:1px solid ${theme.panelBorder}`,`background:${theme.headerBg}`].join(';')
  const title = document.createElement('h3')
  title.textContent = '添加到片单'
  title.style.cssText = ['margin:0','font-size:17px','font-weight:600','letter-spacing:-0.01em',`color:${theme.titleColor}`].join(';')
  const closeBtn = document.createElement('button')
  closeBtn.innerHTML = '\u2715'
  closeBtn.setAttribute('aria-label','关闭')
  closeBtn.style.cssText = ['width:34px;height:34px;border:none;background:transparent;cursor:pointer',`color:${theme.closeColor};font-size:16px`,'display:flex;align-items:center;justify-content:center;border-radius:8px','transition:background .15s,color .15s'].join(';')
  closeBtn.onmouseenter = () => { closeBtn.style.background = theme.closeHoverBg; closeBtn.style.color = theme.closeHoverColor }
  closeBtn.onmouseleave = () => { closeBtn.style.background = 'transparent'; closeBtn.style.color = theme.closeColor }
  closeBtn.addEventListener('click', () => { overlay.remove(); document.body.style.overflow = '' })
  header.append(title, closeBtn)
  panel.appendChild(header)

  // ── Body ──
  const body = document.createElement('div')
  body.style.cssText = ['flex:1;overflow-y:auto;overscroll-behavior:contain','padding:18px 24px'].join(';')
  panel.appendChild(body)

  // Loading indicator shown during initial fetch
  const bodyLoading = document.createElement('div')
  bodyLoading.style.cssText = ['display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:48px 0',`color:${theme.theadText}`,'font-size:13.5px'].join(';')
  bodyLoading.innerHTML = '<span class="umm-dl-spinner" style="width:20px;height:20px;border-width:2.5px"></span><span>加载片单列表...</span>'
  body.appendChild(bodyLoading)

  // ── Confirm overlay ──
  const confirmBox = document.createElement('div')
  confirmBox.style.display = 'none'
  confirmBox.style.cssText = ['position:absolute;inset:0;z-index:10',`background:${theme.confirmBg}`,'display:none;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:32px;text-align:center'].join(';')
  confirmBox.innerHTML = `<p id="umm-dl-confirm-text" style="margin:0;font-size:14.5px;font-weight:500;line-height:1.5;color:${theme.textPrimary}"></p><div style="display:flex;gap:12px"><button id="umm-dl-confirm-yes" style="padding:10px 28px;border:none;border-radius:10px;cursor:pointer;font-size:13.5px;font-weight:600"></button><button id="umm-dl-confirm-no" style="padding:10px 28px;border:1px solid;border-radius:10px;cursor:pointer;font-size:13.5px;font-weight:500"></button></div>`
  panel.style.position = 'relative'
  panel.appendChild(confirmBox)

  const confirmText = confirmBox.querySelector('#umm-dl-confirm-text')!
  const confirmYes = confirmBox.querySelector('#umm-dl-confirm-yes') as HTMLElement
  const confirmNo = confirmBox.querySelector('#umm-dl-confirm-no') as HTMLElement

  function showConfirm(msg: string, yesLabel: string, noLabel: string, action: () => void): void {
    confirmText.textContent = msg
    confirmYes.textContent = yesLabel
    confirmNo.textContent = noLabel
    confirmYes.style.cssText = ['padding:10px 28px;border:none;border-radius:10px;cursor:pointer;font-size:13.5px;font-weight:600',`background:${theme.accent};color:#fff`].join(';')
    confirmNo.style.cssText = ['padding:10px 28px;border-radius:10px;cursor:pointer;font-size:13.5px;font-weight:500',`border:1px solid ${theme.borderDark}`,`background:${theme.surfaceAlt};color:${theme.textSecondary}`].join(';')
    confirmBox.style.display = 'flex'
    confirmYes.onclick = () => { confirmBox.style.display = 'none'; action() }
    confirmNo.onclick = () => { confirmBox.style.display = 'none' }
  }

  // ── Search bar ──
  const searchInput = document.createElement('input')
  searchInput.type = 'text'
  searchInput.placeholder = '搜索片单...'
  searchInput.style.cssText = ['width:100%;box-sizing:border-box;height:40px;padding:0 14px;margin-bottom:14px',`background:${theme.inputBg}`,`border:1px solid ${theme.borderDark}`,`color:${theme.textPrimary}`,'border-radius:10px;font-size:14px;outline:none','transition:border-color .15s,box-shadow .15s'].join(';')
  searchInput.onfocus = () => { searchInput.style.borderColor = theme.accent; searchInput.style.boxShadow = `0 0 0 3px ${theme.accentGlow}` }
  searchInput.onblur = () => { searchInput.style.borderColor = theme.borderInputBlur; searchInput.style.boxShadow = 'none' }
  body.appendChild(searchInput)

  // ── Table ──
  const tableWrap = document.createElement('div')
  tableWrap.style.cssText = [`border:1px solid ${theme.panelBorder}`,'border-radius:10px;overflow:hidden;max-height:360px;overflow-y:auto;overscroll-behavior:contain'].join(';')

  const table = document.createElement('table')
  table.style.cssText = 'width:100%;border-collapse:collapse;table-layout:fixed'

  // Thead
  const thead = document.createElement('thead')
  thead.style.cssText = [`background:${theme.headerBg}`,`border-bottom:1px solid ${theme.panelBorder}`,'position:sticky;top:0;z-index:1'].join(';')
  const hRow = document.createElement('tr')
  const h = (w: string, align: string) => `padding:10px 12px;font-size:11.5px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:${theme.theadText};width:${w};text-align:${align}`

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
  const td = (align: string) => `padding:10px 12px;font-size:13.5px;color:${theme.textSecondary};text-align:${align};border-bottom:1px solid ${theme.rowBorder};transition:background .12s`

  function renderItems(filter: string): void {
    tbody.innerHTML = ''
    const q = filter.toLowerCase().trim()
    let hasVisible = false

    for (const item of items) {
      if (q && !item.name.toLowerCase().includes(q)) continue
      hasVisible = true
      const row = document.createElement('tr')
      row.style.cursor = 'pointer'
      row.onmouseenter = () => { row.style.background = theme.rowHover }
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
          ? `color:${theme.checkedColor};background:${theme.checkedBg}`
          : `color:${theme.uncheckedColor}`,
      ].join(';')
      toggleCell.appendChild(toggleBtn)
      toggleCell.addEventListener('click', (e) => {
        e.stopPropagation()
        const cur = item.is_collected ?? false
        async function doToggle(): Promise<void> {
          toggleBtn.innerHTML = '<span class="umm-dl-spinner"></span>'
          const ok = cur
            ? await removeFromDoulist(item.id, { tkind: subject.cat, tid: subject.subjectId, ck: subject.ck })
            : await addToDoulist(item.id, { sid: subject.subjectId, skind: subject.cat, ck: subject.ck, comment: '' })
          if (ok) {
            item.is_collected = !cur
            renderItems(searchInput.value)
          } else {
            toggleBtn.textContent = '\u2715'
            toggleBtn.style.color = '#e74c3c'
            setTimeout(() => renderItems(searchInput.value), 1200)
          }
        }
        if (cur) {
          showConfirm(`确认从片单「${item.name}」中移除此条目？`,'确认移出','取消', doToggle)
        } else {
          showConfirm(`确认将本条目添加到片单「${item.name}」？`,'确认添加','取消', doToggle)
        }
      })

      // Column 3: Name (click to select/deselect)
      const nameCell = document.createElement('td')
      nameCell.style.cssText = td('left') + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500'
      // Use a custom attribute to re-apply highlight
      nameCell.textContent = item.name
      if (item.id === selectedId) {
        row.style.background = theme.selectedBg
        row.style.outline = '1px solid ' + theme.accent
        row.style.outlineOffset = '-1px'
      }
      row.addEventListener('click', () => {
        selectedId = selectedId === item.id ? '' : item.id
        renderItems(searchInput.value)
      })

      // Column 4: Count
      const countCell = document.createElement('td')
      countCell.style.cssText = td('right') + ';font-size:12px;color:' + theme.theadText
      const m = item.count.match(/(\\d+)/)
      countCell.textContent = m ? m[1] : item.count

      row.append(lockCell, toggleCell, nameCell, countCell)
      tbody.appendChild(row)
    }

    if (!hasVisible) {
      const emptyRow = document.createElement('tr')
      const emptyCell = document.createElement('td')
      emptyCell.colSpan = 4
      emptyCell.style.cssText = ['padding:40px;text-align:center',`color:${theme.emptyText}`,'font-size:13.5px'].join(';')
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
  footer.style.cssText = ['display:flex;align-items:center;justify-content:flex-end;gap:10px','padding:14px 24px',`border-top:1px solid ${theme.panelBorder}`,`background:${theme.headerBg}`].join(';')

  // Create doulist button (left side)
  const createBtn = document.createElement('button')
  createBtn.textContent = '＋ 新建片单'
  createBtn.style.cssText = ['padding:7px 14px;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:500;transition:all .12s',`color:${theme.accent}`,`background:${theme.accentSubtle}`].join(';')
  createBtn.onmouseenter = () => { createBtn.style.background = theme.accentGlow }
  createBtn.onmouseleave = () => { createBtn.style.background = theme.accentSubtle }

  // ── Create doulist form (hidden until createBtn is clicked) ──
  const createForm = document.createElement('div')
  createForm.style.display = 'none'
  createForm.style.cssText = ['display:none;flex-direction:column;gap:10px','padding:14px 0 10px',`border-bottom:1px solid ${theme.panelBorder}`,'margin-bottom:10px'].join(';')

  const nameInput = document.createElement('input')
  nameInput.type = 'text'
  nameInput.placeholder = '请输入片单名称'
  nameInput.style.cssText = ['width:100%;box-sizing:border-box;height:38px;padding:0 14px',`background:${theme.inputBg}`,`border:1px solid ${theme.borderDark}`,`color:${theme.textPrimary}`,'border-radius:10px;font-size:14px;outline:none'].join(';')
  nameInput.onfocus = () => { nameInput.style.borderColor = theme.accent; nameInput.style.boxShadow = `0 0 0 3px ${theme.accentGlow}` }
  nameInput.onblur = () => { nameInput.style.borderColor = theme.borderInputBlur; nameInput.style.boxShadow = 'none' }

  const privateRow = document.createElement('label')
  privateRow.style.cssText = ['display:flex;align-items:center;gap:8px',`color:${theme.labelColor}`,'font-size:13px;cursor:pointer'].join(';')
  const privateCheck = document.createElement('input')
  privateCheck.type = 'checkbox'
  privateRow.append(privateCheck, '私密片单')

  const formActions = document.createElement('div')
  formActions.style.cssText = 'display:flex;gap:8px;justify-content:flex-end'
  const formCancel = document.createElement('button')
  formCancel.textContent = '取消'
  formCancel.style.cssText = `padding:7px 20px;border:1px solid ${theme.borderDark};border-radius:8px;background:${theme.surfaceAlt};color:${theme.textSecondary};font-size:13px;font-weight:500;cursor:pointer`
  const formConfirm = document.createElement('button')
  formConfirm.innerHTML = '创建'
  formConfirm.style.cssText = `padding:7px 20px;border:none;border-radius:8px;background:${theme.accent};color:#fff;font-size:13px;font-weight:600;cursor:pointer;line-height:1.4`
  formActions.append(formCancel, formConfirm)
  createForm.append(nameInput, privateRow, formActions)
  body.insertBefore(createForm, searchInput)

  createBtn.addEventListener('click', () => {
    const isOpen = createForm.style.display === 'flex'
    createForm.style.display = isOpen ? 'none' : 'flex'
    if (!isOpen) nameInput.focus()
  })
  formCancel.addEventListener('click', () => {
    createForm.style.display = 'none'
    nameInput.value = ''
    privateCheck.checked = false
  })
  formConfirm.addEventListener('click', async () => {
    const title = nameInput.value.trim()
    if (!title) { nameInput.focus(); return }
    formConfirm.disabled = true
    formConfirm.innerHTML = '<span class="umm-dl-spinner" style="width:13px;height:13px;border-width:2px;display:block;margin:0 auto"></span>'
    const result = await createDoulist({
      title,
      category: subject.kind,
      isPrivate: privateCheck.checked,
      ck: subject.ck,
    })
    if (result) {
      createForm.style.display = 'none'
      nameInput.value = ''
      privateCheck.checked = false
      const newItems = await fetchAllDoulists(subject)
      if (newItems.length > 0) {
        items = newItems
        renderItems(searchInput.value)
      }
    } else {
      formConfirm.innerHTML = '创建失败'
      setTimeout(() => { formConfirm.innerHTML = '创建'; formConfirm.disabled = false }, 2000)
    }
  })

  const closeBtn2 = document.createElement('button')
  closeBtn2.textContent = '关闭'
  closeBtn2.style.cssText = `padding:9px 28px;border:1px solid ${theme.borderDark};border-radius:10px;background:${theme.surfaceAlt};color:${theme.textSecondary};font-size:13.5px;font-weight:500;cursor:pointer`
  closeBtn2.addEventListener('click', () => { overlay.remove(); document.body.style.overflow = '' })

  footer.append(createBtn, closeBtn2)
  panel.appendChild(footer)

  searchInput.addEventListener('input', () => renderItems(searchInput.value))
  bodyLoading.remove()
  renderItems('')

  const refresh = (newItems: DoulistItem[]) => { items = newItems; selectedId = ''; renderItems(searchInput.value) }
  return { overlay, refresh }
}

export function initDoulistReplacement(identity: UrlIdentity): void {
  function getSubjectInfo(): SubjectInfo | null {
    // Prefer hidden <input name="ck">; fall back to document.cookie (user may be logged in
    // even if the input is absent — e.g. partial page load, SPA navigation)
    const inputCk = document.querySelector<HTMLInputElement>('input[name="ck"]')?.value
    const cookieMatch = document.cookie.match(/(?:^|;\s*)ck=([^;]+)/)
    const ck = inputCk || (cookieMatch ? decodeURIComponent(cookieMatch[1]) : '')
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
    // Use composedPath() to penetrate Shadow DOM — the .umm-dl-trigger
    // button lives inside the detail-page Vue overlay (Shadow DOM), so
    // e.target gets retargeted to the shadow host, making .closest() fail.
    const trigger = (e.composedPath() as HTMLElement[]).find(
      el => el instanceof Element && el.matches('.lnk-doulist-add, .umm-dl-trigger')
    ) as HTMLElement | undefined
    if (!trigger) return
    if (document.getElementById(DL_MODAL_ID)) return

    const subject = getSubjectInfo()
    if (!subject) {
      // Missing ck token or providerId — can't proceed with custom dialog.
      // Don't block the native handler: for .lnk-doulist-add the native Douban
      // dialog will open; for .umm-dl-trigger show a toast so the user isn't
      // left with a dead button.
      if (trigger.matches('.umm-dl-trigger')) {
        console.warn('[UMM Doulist] Cannot open: missing ck token or providerId')
        FloatingToast.error('UMM', '片单功能暂不可用（请确认已登录豆瓣）')
      }
      return
    }
    e.preventDefault()
    e.stopImmediatePropagation()

    // Show loading on the trigger button while fetching doulists
    const origText = trigger.textContent || ''
    trigger.setAttribute('data-loading', 'true')
    trigger.textContent = '加载中…'

    // Retry once — Douban's API sometimes returns empty on first call
    // (backend lazy init). Always opens dialog regardless of result.
    async function fetchWithRetry(s: SubjectInfo): Promise<DoulistItem[]> {
      const items = await fetchAllDoulists(s)
      if (items.length > 0) return items
      await new Promise(r => setTimeout(r, 500))
      return fetchAllDoulists(s)
    }
    const clearLoading = () => {
      trigger.removeAttribute('data-loading')
      trigger.textContent = origText
    }
    fetchWithRetry(subject).then(items => {
      clearLoading()
      const { overlay } = buildThemedDialog({ items, subject, comment: '' })
      document.body.appendChild(overlay)
      document.body.style.overflow = 'hidden'
    }).catch(() => {
      clearLoading()
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
