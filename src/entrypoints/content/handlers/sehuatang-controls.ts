/**
 * 色花堂 forumdisplay 控件重建（overlay 增量，项目令牌基准版）
 *
 * 在卡片网格（sehuatang.ts）基础上，提取原生页面控件并重建为项目基准 UI：
 *   1. 面包屑（#pt .z）+ 统计信息 → header 上行（上下文与状态）
 *   2. 主题分类选项卡（#thread_types）→ header 下行左侧（导航）
 *   3. 「返 回」「发新帖」+ 既有操作（复制磁力/菜单）→ header 下行右侧（操作）
 *   4. 分页（#fd_page_bottom）→ 底部「灵动岛」悬浮栏，现代窗口化页码
 *
 * 设计联调（DESIGN_GUIDE Layer 3 规范）：
 *   - 全部颜色消费 global.ts 注入的 --usl-* 语义令牌（表面/文本/边框/accent
 *     双主题由 html[data-umm-theme="dark"] 翻转），本文件零调色板 hex。
 *   - 自适应：clamp 流式间距/字号（--sht-* 容器级变量）+ 窄屏换行/横向滚动。
 *   - 主题源 = 扩展设置 umm:appearance（syncSehuatangTheme，auto 跟随系统）。
 *   - accent = 项目品牌色（--usl-fill-primary / --usl-accent），不再用站点 teal。
 *
 * 分页逻辑（窗口化/推导/跳转）提取自 ./sehuatang-paging（纯函数，可测）。
 */

import { COLOR_OVERLAY_SURFACE, COLOR_OVERLAY_SURFACE_DARK } from '@/entrypoints/content/styles/tokens'
import { windowPages, resolveJumpUrl, clampPage, type PaginationData, type PagerLink } from './sehuatang-paging'

export type { PaginationData, PagerLink } from './sehuatang-paging'
export { resolveJumpUrl, clampPage } from './sehuatang-paging'

export interface BreadcrumbItem {
  text: string
  href: string
  current: boolean
}

export interface TypeTab {
  text: string
  href: string
  count: string
  active: boolean
}

// ---------------------------------------------------------------------------
// 首帧背景预载（document_start 由 sehuatang-early.content 调用）
// ---------------------------------------------------------------------------

const EARLY_BG_STYLE_ID = 'umm-sht-early-bg'

/**
 * 以主题表面色立即涂刷 html,body 背景（幂等更新同一 style 元素）。
 * 目的：document_start 首帧即呈现主题背景，消除「先看到站点原始背景、
 * 后跳变主题色」的闪烁；色值与 --usl-surface 同源（vibrancy/neutral-50）。
 * body 一并覆盖——Discuz 自带 body 背景，只刷 html 会被 body 盖住。
 */
export function paintSehuatangBackground(doc: Document, theme: 'dark' | 'light'): void {
  const color = theme === 'dark' ? COLOR_OVERLAY_SURFACE_DARK : COLOR_OVERLAY_SURFACE
  let styleEl = doc.getElementById(EARLY_BG_STYLE_ID) as HTMLStyleElement | null
  if (!styleEl) {
    styleEl = doc.createElement('style')
    styleEl.id = EARLY_BG_STYLE_ID
    doc.documentElement.appendChild(styleEl)
  }
  styleEl.textContent = `html, body { background: ${color} !important; }`
}

// ---------------------------------------------------------------------------
// 主题同步（html[data-umm-theme] 驱动 global.ts 的 --usl-* 双主题翻转）
// 自 sehuatang-early.content（document_start）接入后，属性与背景由早期脚本
// 负责全程保鲜（含 SPA 内导航场景，早期脚本随文档加载即生效），本模块不再
// 保留独立同步器——避免重复 storage 监听。
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 提取（纯函数，Element → 数据）
// ---------------------------------------------------------------------------

/** 从任意 href 提取 typeid 参数（仅解析查询串，base 只作占位）。 */
function typeIdFromHref(href: string): string {
  try {
    return new URL(href, 'https://www.sehuatang.net/').searchParams.get('typeid') ?? ''
  } catch {
    return ''
  }
}

/** 面包屑：#pt .z 内全部 a 节点；过滤空文本后再标记末位为当前页。 */
export function extractBreadcrumb(container: Element | null): BreadcrumbItem[] {
  if (!container) return []
  const anchors = Array.from(container.querySelectorAll('a'))
    .map((a) => ({
      text: (a.textContent ?? '').trim(),
      href: a.getAttribute('href') ?? '',
    }))
    .filter((item) => item.text !== '')
  if (anchors.length === 0) return []
  const last = anchors.length - 1
  return anchors.map((item, idx) => ({ ...item, current: idx === last }))
}

/**
 * 选项卡：#thread_types li > a；标签文本 = 精确剔除计数 span（span.xg1.num）
 * 后的剩余子节点文本（避免 replace 首处替换误删标题中同形文本）。
 * 激活判定：URL 语义优先（typeid 参数相等者激活；无 typeid 的「全部」
 * 选项卡在 URL 无 typeid 时激活），全部未命中时回退 li.xw1/a 类名。
 */
export function extractTypeTabs(ul: Element | null, currentUrl: string): TypeTab[] {
  if (!ul) return []
  const currentTypeId = typeIdFromHref(currentUrl)

  interface RawTab { text: string; href: string; count: string; activeByUrl: boolean; marked: boolean }
  const raw: RawTab[] = []
  for (const li of Array.from(ul.querySelectorAll('li'))) {
    const a = li.querySelector('a')
    if (!a) continue
    const href = a.getAttribute('href') ?? ''
    const count = (a.querySelector('span.xg1.num')?.textContent ?? '').trim()
    const text = Array.from(a.childNodes)
      .filter((n) => !(n.nodeType === 1 && (n as Element).classList.contains('xg1')))
      .map((n) => n.textContent ?? '')
      .join('')
      .trim()
    if (!text) continue
    const tabTypeId = typeIdFromHref(href)
    raw.push({
      text,
      href,
      count,
      activeByUrl: tabTypeId ? tabTypeId === currentTypeId : currentTypeId === '',
      marked: li.classList.contains('xw1') || li.classList.contains('a'),
    })
  }

  const anyActiveByUrl = raw.some((t) => t.activeByUrl)
  return raw.map((t) => ({ text: t.text, href: t.href, count: t.count, active: anyActiveByUrl ? t.activeByUrl : t.marked }))
}

const JUMP_TEMPLATE_RE = /window\.location\s*=\s*['"]([^'"]+)['"]\s*\+/

/** 分页：.pg 块 → 数据。prev 在第 1 页、next 在末页均缺省为空串。 */
export function extractPagination(pg: Element | null): PaginationData {
  const empty: PaginationData = { current: 0, total: 0, prevHref: '', nextHref: '', pages: [], jumpTemplate: '' }
  if (!pg) return empty

  const current = parseInt(pg.querySelector('strong')?.textContent?.trim() ?? '', 10) || 0
  const prevHref = pg.querySelector('.prev')?.getAttribute('href') ?? ''
  const nextHref = pg.querySelector('.nxt')?.getAttribute('href') ?? ''

  const totalTitle = pg.querySelector('span[title]')?.getAttribute('title') ?? ''
  const totalMatch = /共\s*(\d+)\s*页/.exec(totalTitle)
  const lastEl = pg.querySelector('a.last')
  const lastHrefMatch = /-(\d+)(?:\.html)?$/.exec(lastEl?.getAttribute('href') ?? '')
  const lastTextMatch = /(\d+)\s*$/.exec(lastEl?.textContent ?? '')
  const lastPage = lastHrefMatch
    ? parseInt(lastHrefMatch[1]!, 10)
    : lastTextMatch ? parseInt(lastTextMatch[1]!, 10) : 0
  const total = totalMatch ? parseInt(totalMatch[1]!, 10) : lastPage

  const pages: PagerLink[] = []
  for (const child of Array.from(pg.children)) {
    if (child.tagName !== 'A') continue
    const a = child as HTMLAnchorElement
    if (a.classList.contains('nxt') || a.classList.contains('prev')) continue
    const pageMatch = /(\d+)/.exec((a.textContent ?? '').trim())
    if (!pageMatch) continue
    pages.push({
      label: (a.textContent ?? '').trim(),
      page: parseInt(pageMatch[1]!, 10),
      href: a.getAttribute('href') ?? '',
      last: a.classList.contains('last'),
    })
  }

  const jumpInput = pg.querySelector('input[name="custompage"]') as HTMLInputElement | null
  const jumpTemplate = JUMP_TEMPLATE_RE.exec(jumpInput?.getAttribute('onkeydown') ?? '')?.[1] ?? ''

  return { current, total, prevHref, nextHref, pages, jumpTemplate }
}

// ---------------------------------------------------------------------------
// 构建器（doc 显式传参，JSDOM 可测）
// ---------------------------------------------------------------------------

function el(doc: Document, tag: string, className: string, text?: string): HTMLElement {
  const node = doc.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

/** 面包屑条（空数据 → null）。 */
export function buildBreadcrumbBar(doc: Document, items: BreadcrumbItem[]): HTMLElement | null {
  if (items.length === 0) return null
  const bar = el(doc, 'div', 'umm-sht-breadcrumb')
  items.forEach((item, idx) => {
    if (idx > 0) bar.appendChild(el(doc, 'span', 'umm-sht-crumb-sep', '›'))
    const a = el(doc, 'a', `umm-sht-crumb${item.current ? ' umm-sht-crumb--current' : ''}`, item.text)
    if (item.href) a.setAttribute('href', item.href)
    bar.appendChild(a)
  })
  return bar
}

/** 选项卡条（空数据 → null）。 */
export function buildTabsBar(doc: Document, tabs: TypeTab[]): HTMLElement | null {
  if (tabs.length === 0) return null
  const bar = el(doc, 'div', 'umm-sht-tabs')
  for (const tab of tabs) {
    const a = el(doc, 'a', `umm-sht-tab${tab.active ? ' umm-sht-tab--active' : ''}`, tab.text)
    if (tab.href) a.setAttribute('href', tab.href)
    if (tab.active) a.setAttribute('aria-current', 'page')
    if (tab.count) a.appendChild(el(doc, 'span', 'umm-sht-tab-count', tab.count))
    bar.appendChild(a)
  }
  return bar
}

/** 现代窗口化分页条：‹ 1 … 4 5 [6] 7 8 … 1495 › + 跳转 + 计数器。空数据 → null。 */
export function buildPager(doc: Document, data: PaginationData): HTMLElement | null {
  if (data.current === 0 && data.total === 0 && data.pages.length === 0) return null

  const bar = el(doc, 'div', 'umm-sht-pager')

  const nav = (href: string, glyph: string, title: string) => {
    if (!href) {
      const span = el(doc, 'span', 'umm-sht-pg-nav umm-sht-pg-nav--disabled', glyph)
      span.setAttribute('title', title)
      return span
    }
    const a = el(doc, 'a', 'umm-sht-pg-nav', glyph)
    a.setAttribute('href', href)
    a.setAttribute('title', title)
    return a
  }

  bar.appendChild(nav(data.prevHref, '‹', '上一页'))
  for (const item of windowPages(data.pages, data.current, data.total)) {
    if (item.kind === 'gap') {
      bar.appendChild(el(doc, 'span', 'umm-sht-pg-gap', '…'))
      continue
    }
    if (item.page === data.current) {
      const cap = el(doc, 'span', 'umm-sht-pg-page umm-sht-pg-page--current', String(item.page))
      cap.setAttribute('aria-current', 'page')
      bar.appendChild(cap)
      continue
    }
    const a = el(doc, 'a', 'umm-sht-pg-page', String(item.page))
    if (item.href) a.setAttribute('href', item.href)
    bar.appendChild(a)
  }
  bar.appendChild(nav(data.nextHref, '›', '下一页'))

  if (data.jumpTemplate) {
    const input = el(doc, 'input', 'umm-sht-pg-jump') as HTMLInputElement
    input.type = 'text'
    input.setAttribute('inputmode', 'numeric')
    input.setAttribute('size', '2')
    input.setAttribute('title', '输入页码，按回车快速跳转')
    input.value = String(data.current || 1)
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return
      const raw = parseInt(input.value, 10)
      const page = clampPage(Number.isNaN(raw) ? 0 : raw, data.total)
      const base = doc.location?.href ?? doc.defaultView?.location?.href ?? ''
      const url = resolveJumpUrl(data.jumpTemplate, page, base)
      const view = doc.defaultView
      if (url && view) view.location.href = url
    })
    bar.appendChild(input)
  }
  if (data.total > 0) bar.appendChild(el(doc, 'span', 'umm-sht-pg-total', `${data.current || 1} / ${data.total}`))

  return bar
}

/** 「返 回」链接 + 「发新帖」按钮（发新帖点击 → 原版元素 click()，触发站点 showWindow）。 */
export function buildActions(doc: Document, back: HTMLAnchorElement | null, post: HTMLElement | null): HTMLElement[] {  const buttons: HTMLElement[] = []
  if (back) {
    const label = (back.textContent ?? '').replace(/\u00a0/g, ' ').trim() || '返回'
    const a = el(doc, 'a', 'umm-sht-action', label)
    const href = back.getAttribute('href')
    if (href) a.setAttribute('href', href)
    buttons.push(a)
  }
  if (post) {
    const imgAlt = (post.querySelector('img') as HTMLImageElement | null)?.getAttribute('alt') ?? ''
    const label = post.getAttribute('title') || imgAlt || '发新帖'
    const b = el(doc, 'button', 'umm-sht-action', label)
    b.setAttribute('type', 'button')
    b.addEventListener('click', () => post.click())
    buttons.push(b)
  }
  return buttons
}

/**
 * 卡片已看计数（纯 DOM 类状态，jsdom 可测）。
 * 语义（初始隐藏 / 非初始 dim）：网格内 .umm-viewed 数 = 本页已看（dimmer）。
 * 「本页隐藏」由初始挂载过滤决定（见 sehuatang.ts hiddenAtMount），
 * 运行时标记永不隐藏。
 */
export function countSehuatangCardStates(grid: HTMLElement | null): { watched: number } {
  if (!grid) return { watched: 0 }
  return { watched: grid.querySelectorAll('.umm-card.umm-viewed').length }
}

/** 已看落库接口（生产实现 = AdultAvStore，测试注入 fake）。 */
export interface MarkedStore {
  batchAdd(source: string, items: { id: string; rating?: number; url?: string }[]): Promise<number>
  /** 可选单条落库（batchAdd 失败时的逐条兜底路径）。 */
  add?(source: string, id: string, rating?: number, url?: string): Promise<void>
  /** 可选单条存在性检查（写入后读回自检，探测运行时写读不对称）。 */
  has?(id: string): Promise<boolean>
}

/**
 * 统一已看标记路径（磁力点击 / 一键复制共用）：
 *   1. 去重加 .umm-viewed —— dimmer 与「隐藏已看」（CSS display:none）
 *      在类落下的瞬间生效，无需等待任何异步结果；
 *   2. 新标记项单次 batchAdd 落库（1 消息，替代逐卡 ADD）；
 *   3. onMarked 回调（统计节流刷新）。
 * 已带 .umm-viewed 的卡片跳过（幂等，不重复计数/落库）。
 */
export function markCardsViewed(
  cards: HTMLElement[],
  source: string,
  store: MarkedStore,
  onMarked?: () => void,
  onAdded?: (added: number, ids: string[]) => void,
  onError?: (error: unknown) => void,
): void {
  const fresh = cards.filter((card) => !card.classList.contains('umm-viewed'))
  if (fresh.length === 0) {
    onMarked?.()
    return
  }
  const items: { id: string; rating?: number; url?: string }[] = []
  for (const card of fresh) {
    card.classList.add('umm-viewed')
    const avid = card.getAttribute('data-avid')
    if (avid) {
      const url = card.getAttribute('data-url') ?? undefined
      items.push({ id: avid, rating: 0, ...(url ? { url } : {}) })
    }
  }
  if (items.length > 0) {
    store.batchAdd(source, items).then((added: number) => {
      onAdded?.(added, items.map((i) => i.id))
      // 写入后读回自检：探测「写入报成功但读不回来」的运行时不对称
      // （消息层/SW 状态的最后一环证据）。
      if (added > 0 && store.has) {
        const probeId = items[0]!.id
        store.has(probeId).then((found) => {
          if (!found) onError?.(new Error(`readback-mismatch: ${probeId}`))
        }).catch((probeError: unknown) => {
          console.warn('[UMM] Sehuatang watched readback probe failed:', probeError)
        })
      }
    }).catch((error: unknown) => {
      console.warn('[UMM] Sehuatang watched batchAdd failed:', error)
      // 逐条兜底：批量路径失败时退化为单条 ADD，提高保存可靠性。
      if (store.add) {
        let fallbackAdded = 0
        const ids = items.map((i) => i.id)
        for (const item of items) {
          store.add(source, item.id, item.rating, item.url).then(() => {
            fallbackAdded++
            // 逐条兜底完成后回调 onAdded（成功条数+id），保持统计链路闭合。
            if (fallbackAdded === items.length) onAdded?.(fallbackAdded, ids)
          }).catch((fallbackError: unknown) => {
            console.warn('[UMM] Sehuatang watched single add failed:', fallbackError)
          })
        }
      }
      onError?.(error)
    })
  }
  onMarked?.()
}

// ---------------------------------------------------------------------------
// 样式（独立 style 元素；零调色板 hex，全 --usl-* 令牌 + clamp 自适应）
// ---------------------------------------------------------------------------

function injectControlsStyles(doc: Document): void {
  if (doc.getElementById('umm-sht-controls-styles')) return
  const style = doc.createElement('style')
  style.id = 'umm-sht-controls-styles'
  style.textContent = `
.umm-sehuatang-header, .umm-sht-floatbar {
  --sht-pad-x: clamp(14px, 2.5vw, 32px);
  --sht-pad-y: clamp(10px, 1.4vw, 18px);
  --sht-gap: clamp(8px, 1.2vw, 16px);
  --sht-font-caption: clamp(0.72rem, 0.68rem + 0.2vw, 0.875rem);
  --sht-font-body: clamp(0.8rem, 0.75rem + 0.25vw, 0.9375rem);
}
.umm-sehuatang-header { position: sticky; top: 0; z-index: 50; display: flex; flex-direction: column; gap: var(--sht-gap); padding: var(--sht-pad-y) var(--sht-pad-x); background: var(--usl-surface); border-bottom: 1px solid var(--usl-border); color: var(--usl-text-primary); transition: background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease; }
.umm-sht-row { display: flex; align-items: center; gap: var(--sht-gap); }
.umm-sht-row--context { justify-content: space-between; }
.umm-sht-row--nav { justify-content: space-between; flex-wrap: wrap; }
.umm-header-info { color: var(--usl-text-muted); font-size: var(--sht-font-caption); white-space: nowrap; }
.umm-sht-breadcrumb { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; font-size: var(--sht-font-caption); }
.umm-sht-crumb { color: var(--usl-accent); text-decoration: none; transition: color 0.15s ease; }
.umm-sht-crumb:hover { color: var(--usl-text-primary); text-decoration: underline; }
.umm-sht-crumb--current { color: var(--usl-text-secondary); font-weight: 600; }
.umm-sht-crumb-sep { color: var(--usl-text-muted); opacity: 0.6; }
.umm-sht-tabs { display: flex; flex-wrap: wrap; gap: 8px; overflow-x: auto; }
.umm-sht-tab { display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; border-radius: 999px; border: 1px solid var(--usl-border-strong); background: var(--usl-surface-raised); color: var(--usl-text-secondary); text-decoration: none; font-size: var(--sht-font-body); transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease; }
.umm-sht-tab:hover { border-color: var(--usl-accent); color: var(--usl-text-primary); }
.umm-sht-tab--active { background: var(--usl-fill-primary); border-color: transparent; color: var(--usl-ink-on-fill); font-weight: 700; }
.umm-sht-tab-count { font-size: var(--sht-font-caption); color: var(--usl-text-muted); background: var(--usl-surface-hover); border-radius: 999px; padding: 1px 8px; transition: background-color 0.15s ease, color 0.15s ease; }
.umm-sht-tab--active .umm-sht-tab-count { color: var(--usl-ink-on-fill); background: rgba(255, 255, 255, 0.22); }
.umm-copy-btn { background: var(--usl-fill-primary); color: var(--usl-ink-on-fill); border: none; padding: 7px 16px; border-radius: 8px; cursor: pointer; font-weight: 700; font-size: var(--sht-font-body); box-shadow: var(--usl-shadow-primary); transition: opacity 0.15s ease, background-color 0.3s ease, color 0.3s ease, box-shadow 0.3s ease; }
.umm-copy-btn:not(:disabled):hover { opacity: 0.92; }
.umm-copy-btn:disabled { background: var(--usl-surface-hover); color: var(--usl-text-muted); box-shadow: none; cursor: default; }
.umm-sht-action { display: inline-flex; align-items: center; height: 30px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--usl-border-strong); background: var(--usl-surface-raised); color: var(--usl-text-secondary); font-size: var(--sht-font-body); cursor: pointer; text-decoration: none; transition: border-color 0.15s ease, color 0.15s ease, background-color 0.3s ease; }
.umm-sht-action:hover { border-color: var(--usl-accent); color: var(--usl-text-primary); }
.umm-sht-pager { display: flex; align-items: center; gap: 6px; font-size: var(--sht-font-body); color: var(--usl-text-secondary); }
.umm-sht-pg-nav, .umm-sht-pg-page { display: inline-flex; align-items: center; justify-content: center; min-width: 30px; height: 30px; padding: 0 8px; border-radius: 8px; border: 1px solid var(--usl-border-strong); background: var(--usl-surface-raised); color: var(--usl-text-secondary); text-decoration: none; transition: border-color 0.15s ease, color 0.15s ease, background-color 0.3s ease; }
.umm-sht-pg-nav:hover, .umm-sht-pg-page:hover { border-color: var(--usl-accent); color: var(--usl-text-primary); }
.umm-sht-pg-nav--disabled { opacity: 0.4; pointer-events: none; }
.umm-sht-pg-page--current { background: var(--usl-fill-primary); border-color: transparent; color: var(--usl-ink-on-fill); font-weight: 700; }
.umm-sht-pg-gap { color: var(--usl-text-muted); padding: 0 2px; }
.umm-sht-pg-jump { width: 46px; height: 30px; border-radius: 8px; border: 1px solid var(--usl-border-strong); background: var(--usl-surface); color: var(--usl-text-primary); text-align: center; font-size: var(--sht-font-body); transition: border-color 0.15s ease, background-color 0.3s ease, color 0.3s ease; }
.umm-sht-pg-jump:focus { outline: none; border-color: var(--usl-accent); }
.umm-sht-pg-total { color: var(--usl-text-muted); font-size: var(--sht-font-caption); white-space: nowrap; }
.umm-sht-floatbar { position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 8px; padding: 8px clamp(10px, 1.6vw, 14px); border-radius: 999px; background: color-mix(in srgb, var(--usl-surface) 88%, transparent); border: 1px solid var(--usl-border); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25); backdrop-filter: blur(12px); z-index: 2147483000; max-width: 96vw; overflow-x: auto; transition: background-color 0.3s ease, border-color 0.3s ease; }
.umm-sht-floatbar .umm-sht-pager { flex-wrap: nowrap; }
`
  doc.head.appendChild(style)
}

// ---------------------------------------------------------------------------
// 编排
// ---------------------------------------------------------------------------

/**
 * 编排入口：守卫（仅 forumdisplay 列表页）→ 提取 → 隐藏原版 → 双行 header 重建。
 * headerEl 为 sehuatang.ts injectHeader() 返回的注入头部：
 *   row--context = 面包屑（左）+ 统计信息（右）
 *   row--nav     = 选项卡（左）+ 操作组（右：返回/发新帖/复制磁力/菜单）
 * 底部浮动栏（灵动岛）挂到 body。
 */
export function mountSehuatangControls(doc: Document, headerEl: HTMLElement): void {
  if (headerEl.getAttribute('data-umm-sht-mounted') === '1') return
  if (!doc.getElementById('thread_types')) return
  headerEl.setAttribute('data-umm-sht-mounted', '1')

  injectControlsStyles(doc)

  // 提取必须先于隐藏（display:none 不影响 DOM 查询，但保持顺序清晰）。
  const breadcrumb = extractBreadcrumb(doc.querySelector('#pt .z'))
  const tabs = extractTypeTabs(doc.getElementById('thread_types'), doc.location?.href ?? '')
  const bottomPg = extractPagination(doc.querySelector('#fd_page_bottom .pg'))

  const topBack = doc.querySelector('#visitedforums a') as HTMLAnchorElement | null
  const topPost = doc.getElementById('newspecial')
  const bottomBack = doc.querySelector('#visitedforumstmp a') as HTMLAnchorElement | null
  const bottomPost = doc.getElementById('newspecialtmp')

  // 隐藏原版（保留 DOM 供「发新帖」click() 接线）。
  for (const sel of ['#pt', '#thread_types', '#pgt']) {
    const origin = doc.querySelector(sel) as HTMLElement | null
    if (origin) origin.style.display = 'none'
  }
  const bottomPgContainer = doc.getElementById('fd_page_bottom')?.closest('.pgs') as HTMLElement | null
  if (bottomPgContainer) bottomPgContainer.style.display = 'none'

  // 双行 header 重建：复用既有子元素（info 统计、actions 操作组），只重组结构。
  const info = headerEl.querySelector('.umm-header-info')
  const actions = headerEl.lastElementChild as HTMLElement | null
  const crumbBar = buildBreadcrumbBar(doc, breadcrumb)
  const tabsBar = buildTabsBar(doc, tabs)

  const rowContext = el(doc, 'div', 'umm-sht-row umm-sht-row--context')
  if (crumbBar) rowContext.appendChild(crumbBar)
  if (info) rowContext.appendChild(info)

  const rowNav = el(doc, 'div', 'umm-sht-row umm-sht-row--nav')
  if (tabsBar) rowNav.appendChild(tabsBar)
  if (actions) {
    // 次要动作（返回/发新帖）置前，主要动作（复制磁力）保持靠右的主次分层。
    for (const btn of buildActions(doc, topBack, topPost).reverse()) {
      actions.insertBefore(btn, actions.firstElementChild)
    }
    rowNav.appendChild(actions)
  }

  headerEl.replaceChildren(rowContext, rowNav)

  // 底部「灵动岛」悬浮栏：底部分页 + 第二组动作按钮。
  const bottomBar = buildPager(doc, bottomPg)
  const floatActions = buildActions(doc, bottomBack, bottomPost)
  if (bottomBar || floatActions.length > 0) {
    const pill = el(doc, 'div', 'umm-sht-floatbar')
    pill.id = 'umm-sht-floatbar'
    if (bottomBar) pill.appendChild(bottomBar)
    for (const btn of floatActions) pill.appendChild(btn)
    doc.body.appendChild(pill)
  }
}
