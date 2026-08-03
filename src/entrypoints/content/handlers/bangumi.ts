/**
 * Bangumi (bgm.tv / bangumi.tv / chii.in) 详情页处理器。
 *
 * 仅注入 /subject/{数字} 页面（路由层已按 URL 过滤，此处 waitForElement 亦确认
 * #headerSubject 存在）。纯 DOM 注入 createStatusChip（非 Shadow DOM）。
 *
 * 关键点：Bangumi URL 不含媒体类型（Identity.fromUrl 默认 'tv'），
 * 真实类型（book/music/tv/game/movie）从 #infobox 推断 —— 通过工厂新增的
 * resolveIdentity 钩子在 dbGet 之前替换 identity.type，使 store key
 * `${type}::${providerId}` 与实际类型一致。
 *
 * 交互：点击状态标签弹出状态菜单（无/想看/在看/看过），选择后经 Store.dbPut
 * 写入 bangumi_records 并重渲染标签 + 成功 toast；页面本身标记 done 时，
 * 工厂基础保存逻辑仍会兜底写入（两处写入以最后一次为准，行为一致）。
 */

import type { UrlIdentity, StoreRecord } from '@/types'
import { Store } from '@/features/database'
import { createStatusChip } from '../utils/dom'
import { FloatingToast } from '../utils/toast'
import { t } from '../i18n'
import { createDetailPageHandler, type PageScanResult } from './create-detail-handler'
import {
  extractBangumiRating,
  extractBangumiStatus,
  inferBangumiInterestFromText,
  inferBangumiMediaType,
  type BangumiInfoboxRow,
  type BangumiPageStatus,
} from './bangumi-extract'

// ---- DOM 读取 ----

/** 读取收藏状态：优先 window.INTEREST_TYPE（1=想看 2=看过 3=在看 4=搁置 5=抛弃），
 *  缺失时回退解析 .interest_now 文本（未登录时无此变量也无收藏盒）。 */
function readBangumiInterestType(): number | null {
  const raw = (window as unknown as { INTEREST_TYPE?: unknown }).INTEREST_TYPE
  if (typeof raw === 'number' && Number.isInteger(raw)) return raw

  const interestText =
    document.querySelector<HTMLElement>('#panelInterestWrapper .interest_now')?.textContent?.trim() ?? ''
  return inferBangumiInterestFromText(interestText)
}

/** 读取用户评分（0-10）：form[name="rate-now"] 内 checked 的 name="rate" radio。 */
function readBangumiUserRating(): number {
  const checked = document.querySelector<HTMLInputElement>(
    'form[name="rate-now"] input[name="rate"]:checked'
  )
  return extractBangumiRating(checked?.value ?? null)
}

/** 提取 #infobox 各行：label = span.tip 文本，value = li 文本减去 label。 */
function readBangumiInfoboxRows(): BangumiInfoboxRow[] {
  const rows: BangumiInfoboxRow[] = []
  const items = document.querySelectorAll<HTMLElement>('#infobox li')
  for (const li of items) {
    const tip = li.querySelector('span.tip')
    if (!tip) continue
    const label = tip.textContent?.trim() ?? ''
    if (!label) continue
    const value = (li.textContent ?? '').replace(label, '').trim()
    rows.push({ label, value })
  }
  return rows
}

// ---- 扫描 / 解析 ----

/**
 * 扫描页面状态：INTEREST_TYPE → wish/done/doing/none；checked radio → 用户评分。
 */
export async function scanBangumiPageStatus(): Promise<{ status: BangumiPageStatus; rating: number }> {
  const status = extractBangumiStatus(readBangumiInterestType())
  const rating = readBangumiUserRating()
  return { status, rating }
}

/**
 * 从 #infobox 推断媒体类型并替换 identity.type（URL 无法编码类型）。
 */
async function resolveBangumiIdentity(
  identity: UrlIdentity,
  _pageState: PageScanResult
): Promise<UrlIdentity> {
  const inferredType = inferBangumiMediaType(readBangumiInfoboxRows())
  if (inferredType === identity.type) return identity
  return { ...identity, type: inferredType }
}

// ---- 渲染 ----

/** 状态菜单选项：0=无 1=想看 3=在看 2=看过（顺序即菜单展示顺序）。 */
const STATUS_MENU_OPTIONS: ReadonlyArray<{ status: number; labelKey: string }> = [
  { status: 0, labelKey: 'status.none' },
  { status: 1, labelKey: 'status.wish' },
  { status: 3, labelKey: 'status.doing' },
  { status: 2, labelKey: 'status.done' },
]

/** 菜单容器内联样式（浅色深色自适应：CSS 系统色 Canvas/CanvasText）。 */
const STATUS_MENU_STYLE = [
  'position:absolute',
  'top:calc(100% + 6px)',
  'left:0',
  'z-index:1000',
  'display:flex',
  'flex-direction:column',
  'gap:2px',
  'padding:4px',
  'border-radius:8px',
  'background:Canvas',
  'color:CanvasText',
  'border:1px solid rgba(128,128,128,0.35)',
  'box-shadow:0 10px 24px rgba(15,23,42,0.18)',
].join(';')

/** 菜单选项内联样式；current 高亮当前状态。 */
function statusOptionStyle(current: boolean): string {
  const base = [
    'border:0',
    'border-radius:6px',
    'padding:6px 14px',
    'font-size:13px',
    'font-weight:600',
    'text-align:left',
    'cursor:pointer',
    'color:inherit',
    'background:transparent',
  ]
  if (current) {
    base.push('background:rgba(99,102,241,0.16)')
    base.push('box-shadow:inset 0 0 0 1px rgba(99,102,241,0.6)')
  }
  return base.join(';')
}

/**
 * 幂等挂载状态标签。主锚点：收藏盒 #panelInterestWrapper .SidePanel（插到评分表单前）；
 * 兜底锚点（未登录时收藏盒缺失）：#headerSubject .subjectNav（末尾追加）。
 * 已存在 data-umm-owner = bangumi-{type} 的标签则原位替换（重渲染复用同一锚点）。
 */
function mountBangumiChip(chip: HTMLElement): void {
  const sidePanel = document.querySelector('#panelInterestWrapper .SidePanel')
  if (sidePanel) {
    const existingChip = sidePanel.querySelector<HTMLElement>('.umm-status-chip[data-umm-owner]')
    if (existingChip) {
      existingChip.replaceWith(chip)
      return
    }
    const rateForm = sidePanel.querySelector('form[name="rate-now"]')
    if (rateForm) {
      rateForm.insertAdjacentElement('beforebegin', chip)
    } else {
      sidePanel.insertAdjacentElement('beforeend', chip)
    }
    return
  }

  const subjectNav = document.querySelector('#headerSubject .subjectNav')
  if (!subjectNav) {
    console.warn('[UMM] Could not find Bangumi anchor element for status chip')
    return
  }
  const existingChip = subjectNav.querySelector<HTMLElement>('.umm-status-chip[data-umm-owner]')
  if (existingChip) {
    existingChip.replaceWith(chip)
  } else {
    subjectNav.appendChild(chip)
  }
}

/**
 * 渲染可交互状态标签：点击标签切换状态菜单（无/想看/在看/看过），
 * 选择即保存到 bangumi_records 并重渲染 + 成功 toast。
 *
 * storeName/key 由 identity 派生；渲染时读取一次本地记录，用于：
 * 1. 保存时保留已有 rating（无则回退页面评分）与 comment/linkedIds；
 * 2. 菜单高亮当前状态（与标签显示一致）。
 */
export async function renderBangumiStatusChip(
  identity: UrlIdentity,
  status: number, // 0/1/2/3
  rating: number,
  note: string = ''
): Promise<void> {
  const storeName = `${identity.platform}_records`
  const key = `${identity.type}::${identity.providerId}`
  const localRecord: StoreRecord | null = await Store.dbGet(storeName, key)
  // 保留本地评分（有则用之，无则回退页面评分）
  const localRating = localRecord?.rating && localRecord.rating > 0 ? localRecord.rating : rating

  /** 选中菜单项：写入 DB → 重渲染 → toast。 */
  const saveStatus = async (nextStatus: number): Promise<void> => {
    try {
      await Store.dbPut(storeName, key, {
        url: identity.url,
        status: nextStatus,
        rating: localRating,
        comment: localRecord?.comment ?? '',
        updatedAt: new Date().toISOString(),
        linkedIds: localRecord?.linkedIds ?? {},
      })
    } catch (error) {
      console.error('[UMM] Failed to save Bangumi status:', error)
      FloatingToast.error('UMM', t('neodb.comm_failed'))
      return
    }
    renderChip(nextStatus, localRating, '')
    FloatingToast.success('UMM', t('bangumi.saved'))
  }

  /** 创建标签 + 菜单交互，并幂等挂载。重渲染走同一路径（replaceWith 旧标签）。 */
  const renderChip = (chipStatus: number, chipRating: number, chipNote: string): void => {
    const chip = createStatusChip(identity.type, chipStatus, chipRating, chipNote)
    chip.dataset.ummOwner = `bangumi-${identity.type}`
    chip.style.position = 'relative'
    chip.style.cursor = 'pointer'
    chip.setAttribute('aria-haspopup', 'menu')

    let menu: HTMLElement | null = null
    const closeMenu = (): void => {
      if (menu) {
        menu.remove()
        menu = null
      }
      document.removeEventListener('click', closeMenu)
    }

    const openMenu = (): void => {
      if (menu) {
        closeMenu()
        return
      }
      menu = document.createElement('div')
      menu.className = 'umm-status-menu'
      menu.style.cssText = STATUS_MENU_STYLE
      menu.setAttribute('role', 'menu')

      for (const option of STATUS_MENU_OPTIONS) {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'umm-status-option'
        button.dataset.status = String(option.status)
        button.textContent = t(option.labelKey)
        button.style.cssText = statusOptionStyle(option.status === chipStatus)
        button.setAttribute('role', 'menuitem')
        button.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          closeMenu()
          void saveStatus(option.status)
        })
        menu.appendChild(button)
      }

      chip.appendChild(menu)
      // 点击标签以外任意处关闭菜单（标签自身点击 stopPropagation，不触发此监听）
      document.addEventListener('click', closeMenu)
    }

    chip.addEventListener('click', (event) => {
      event.stopPropagation()
      openMenu()
    })

    mountBangumiChip(chip)
  }

  renderChip(status, rating, note)
}

// ---- Handler ----

/**
 * Bangumi 详情页入口（供 router 调用）。
 */
export const handleBangumiDetailPage = createDetailPageHandler({
  platform: 'bangumi',
  titleSelector: '#headerSubject h1.nameSingle a',
  scanFn: scanBangumiPageStatus,
  resolveIdentity: resolveBangumiIdentity,
  // 页面 wish→1、done→2、doing→3；页面 none（含 4/5 搁置/抛弃）→ 保留本地状态
  mergeStatusFn: (pageState, localRecord) => {
    if (pageState.status === 'wish') return 1
    if (pageState.status === 'done') return 2
    if (pageState.status === 'doing') return 3
    return localRecord?.status ?? 0
  },
  renderFn: renderBangumiStatusChip,
  savedMessageKey: 'bangumi.saved',
})
