/**
 * 色花堂 forumdisplay 控件重建（overlay 增量，项目令牌基准版）
 *
 * 在卡片网格（sehuatang.ts）基础上，提取原生页面控件并重建为项目基准 UI：
 *   1. 面包屑（#pt .z）+ 统计信息 → header 上行（上下文与状态）
 *   2. 主题分类选项卡（#thread_types）→ header 下行左侧（导航）
 *   3. 「返 回」「发新帖」+ 复制磁力 → header 下行右侧（操作）；🏠 首页 +
 *      ☰ 菜单 → header 上行「top center 簇」（三列网格中列）
 *   4. 搜索框 + 分页（#fd_page_bottom）→ 底部「灵动岛」悬浮栏
 *      （buildFloatbar 统一合成，现代窗口化页码；返回/发新帖不入岛，仅 header
 *      持有，重复入岛只会撑宽岛体、窄屏溢出）
 *
 * 设计联调（DESIGN_GUIDE Layer 3 规范）：
 *   - 全部颜色消费 --usl-* 语义令牌（light DOM 由 global.ts 注入 html
 *     [data-umm-theme]；shadow overlay 由 styles.ts 重宿主到 :host），
 *     本文件零调色板 hex。
 *   - 自适应：clamp 流式间距/字号（--sht-* 容器级变量）+ 窄屏换行/横向滚动。
 *   - 主题源 = 扩展设置 umm:appearance（auto 跟随系统）。
 *   - accent = 项目品牌色（--usl-fill-primary / --usl-accent），不再用站点 teal。
 *
 * 分页逻辑（窗口化/推导/跳转）提取自 ./sehuatang-paging（纯函数，可测）。
 */

import { COLOR_OVERLAY_SURFACE, COLOR_OVERLAY_SURFACE_DARK } from '@/entrypoints/content/styles/tokens'
import { t } from '@/entrypoints/content/i18n'
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

/**
 * 入场级联收窄到首屏可见卡：rAF 内批量读 rect、统一写类名（读写不交错）。
 * 列表页 / 首页 / 搜索页三处编排共用；stepMs = 卡片入场延迟步进
 * （列表页 45ms，首页/搜索页 25ms）。
 */
export function runVisibleEntrance(root: HTMLElement, stepMs = 25): void {
  requestAnimationFrame(() => {
    const cards = Array.from(root.querySelectorAll('.umm-card:not(.umm-sht-enter)')) as HTMLElement[]
    if (cards.length === 0) return
    const viewportH = window.innerHeight
    const visible: HTMLElement[] = []
    for (const card of cards) {
      const rect = card.getBoundingClientRect()
      if (rect.top < viewportH && rect.bottom > 0) visible.push(card)
    }
    visible.forEach((card, idx) => {
      card.classList.add('umm-sht-enter')
      card.style.animationDelay = `${idx * stepMs}ms`
    })
  })
}

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
      span.setAttribute('aria-label', title)
      return span
    }
    const a = el(doc, 'a', 'umm-sht-pg-nav', glyph)
    a.setAttribute('href', href)
    a.setAttribute('title', title)
    a.setAttribute('aria-label', title)
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

/**
 * 搜索 URL 构建（纯函数，JSDOM/Node 可测）：Discuz 搜索的 GET 契约，
 * 形态与站点原生结果页链接一致（search.php?mod=forum&srchtxt=…&searchsubmit=yes）。
 * action 优先取原生 #scbar_form 的端点（调用方传入），空串回退通用形态；
 * URLSearchParams.set 保证参数幂等（action 自带 searchsubmit=yes 时原地覆盖，
 * 不产生重复键）；协议白名单仅 http(s)（非可信输入防御，与磁力/封面同纪律）。
 * 返回 null = 关键词空白或解析失败（调用方静默 no-op）。
 */
export function buildSearchUrl(action: string, base: string, keyword: string): string | null {
  const kw = keyword.trim()
  if (!kw) return null
  try {
    const u = new URL(action || 'search.php?mod=forum&searchsubmit=yes', base || undefined)
    if (!/^https?:$/.test(u.protocol)) return null
    u.searchParams.set('mod', 'forum')
    u.searchParams.set('srchtxt', kw)
    u.searchParams.set('searchsubmit', 'yes')
    return u.href
  } catch {
    return null
  }
}

/**
 * 批量上色免过渡执行器（dimmer 提速）：一次给多张卡落 `.umm-viewed` 时，若
 * 每张都播 0.18s opacity + 0.22s 图片 filter 过渡，几十张同时动画会造成
 * 长尾卡顿（首屏 dim 观感「慢」的主因）。本函数在批量期间给网格挂
 * `.umm-sht-dim-batch`（CSS 侧 `transition: none`），下一帧 rAF 撤销——
 * 批量变更是瞬时完成，之后单卡（点击/复制）的过渡动效不受影响。
 * apply 同步执行（classList 变更与批量类同帧生效，无中间态闪烁）。
 */
export function withDimBatch(grid: HTMLElement, apply: () => void): void {
  const already = grid.classList.contains('umm-sht-dim-batch')
  if (!already) grid.classList.add('umm-sht-dim-batch')
  try {
    apply()
  } finally {
    if (!already) {
      // rAF 兜底：非视觉宿主无 requestAnimationFrame 时退化为宏任务（类必被
      // 撤销，绝不残留免过渡态）；不抽取函数引用调用，规避 Illegal invocation。
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => grid.classList.remove('umm-sht-dim-batch'))
      } else {
        setTimeout(() => grid.classList.remove('umm-sht-dim-batch'), 16)
      }
    }
  }
}

/**
 * 搜索框（原生 #scbar 搜索条被 overlay 取代后的重建；列表页 header 与首页
 * header 共用）。Enter 或按钮 → buildSearchUrl 同页导航，结果页由搜索
 * overlay 接管（app-search）。关键词空白 / 端点解析失败 → 静默 no-op。
 * navigate 可注入（JSDOM 无导航实现，测试传 spy；生产默认同页跳转）。
 * value：预填关键词（搜索页从 URL 的 kw/srchtxt 提取后回填，便于用户改词重搜）。
 */
export function buildSearchBox(
  doc: Document,
  opts?: { navigate?: (url: string) => void; value?: string },
): HTMLElement {
  const box = el(doc, 'div', 'umm-sht-searchbox')
  const input = el(doc, 'input', 'umm-sht-search-input') as HTMLInputElement
  input.type = 'text'
  input.placeholder = t('sht.search_placeholder')
  input.setAttribute('aria-label', t('sht.search_placeholder'))
  const preset = (opts?.value ?? '').trim()
  if (preset) input.value = preset
  const navigate = opts?.navigate ?? ((url: string) => {
    const view = doc.defaultView
    if (view) view.location.href = url
  })
  const go = () => {
    const action = doc.getElementById('scbar_form')?.getAttribute('action') ?? ''
    const url = buildSearchUrl(action, doc.location?.href ?? '', input.value)
    if (url) navigate(url)
  }
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') go()
  })
  const btn = el(doc, 'button', 'umm-sht-action umm-sht-search-btn', '🔍') as HTMLButtonElement
  btn.type = 'button'
  btn.title = t('sht.search_go')
  btn.addEventListener('click', go)
  box.appendChild(input)
  box.appendChild(btn)
  return box
}

/**
 * 「首页」按钮（🏠 图标，零文字占位）：header 操作组的导航入口，指向论坛
 * 根 `forum.php`（相对解析，Discuz 首页与 overlay 首页判型同源）。
 * 列表/搜索页 header 接入；首页本身不加（当前页即首页，自链无意义）。
 */
export function buildHomeLink(doc: Document): HTMLElement {
  const a = el(doc, 'a', 'umm-sht-action umm-sht-home-btn', '🏠')
  a.setAttribute('href', 'forum.php')
  a.setAttribute('title', t('sht.home'))
  a.setAttribute('aria-label', t('sht.home'))
  return a
}

/** 「返 回」链接 + 「发新帖」按钮（发新帖点击 → 原版元素 click()，触发站点 showWindow）。 */
export function buildActions(doc: Document, back: HTMLAnchorElement | null, post: HTMLElement | null): HTMLElement[] {
  const buttons: HTMLElement[] = []
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

/**
 * 「隐藏已看」运行时 toggle（命令式一次性显隐，非持久 CSS 规则）：
 * ON → 当前已渲染的已看卡片立即 display:none 并返回隐藏数；OFF → 复原。
 * 网格类 umm-sht-hide-viewed 仅作状态标记（菜单激活态），不挂 CSS 规则——
 * 运行时标记（磁力点击/复制）「只 dim 不隐藏」的既定语义因此不受牵连。
 */
export function setGridHideViewed(grid: HTMLElement, hide: boolean): number {
  grid.classList.toggle('umm-sht-hide-viewed', hide)
  let hidden = 0
  for (const card of Array.from(grid.querySelectorAll('.umm-card.umm-viewed'))) {
    ;(card as HTMLElement).style.display = hide ? 'none' : ''
    if (hide) hidden++
  }
  return hidden
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

/**
 * 仅页面状态标记（**不落库**）：点击跳转时同步加 dimmer，类落下即生效。
 *
 * 用于「只提取到 TID」或「详情已结束但无磁力」的条目——这两类没有自然的
 * 复制磁力落库路径，用户会直接点进帖子；数据变更交给目标帖子页的静默记录
 * 逻辑（sehuatang-main.content），此处重复落库属冗余。
 * 幂等：已带 .umm-viewed 的卡片跳过（不重复触发统计刷新）。
 */
export function dimCardsVisually(cards: HTMLElement[]): number {
  let marked = 0
  for (const card of cards) {
    if (card.classList.contains('umm-viewed')) continue
    card.classList.add('umm-viewed')
    marked++
  }
  return marked
}

/** 岛内展示组件（摩天轮两舱）。 */
export type IslandMode = 'search' | 'pager'

/** 岛句柄：pill 供挂载，mode 读取当前组件，show 执行摩天轮轮替。 */
export interface FloatbarHandle {
  /** 岛根（.umm-sht-floatbar）。 */
  pill: HTMLElement
  /** 当前展示组件（有分页时初始 = pager；仅搜索时 = search）。 */
  readonly mode: IslandMode
  /**
   * 摩天轮轮替：切到指定组件。搜索舱恒在上舱、分页舱恒在下舱——切换时
   * 一舱滚出、另一舱滚入（位置由舱位唯一决定，**单次赋值即完成方向正确的
   * 过渡，无 double-rAF 时序依赖**）。不可切换（仅一方在场）时 no-op。
   */
  show(mode: IslandMode): void
}

/**
 * 统一「灵动岛」合成器（全站页面的浮动 UI 单一定义点）。
 *
 * 组合顺序固定 = [搜索舱/分页舱（摩天轮舞台）] → 轮替控件；两者全空 → null
 * （不渲染空岛）。挂岛页面（列表/首页/搜索）按场景传入所需成分：
 *   - 列表页：search + pager（有分页 → 默认展示分页，⇅ 可切搜索）
 *   - 搜索页：search + pager（同上；空结果分支仅 search，无轮替控件）
 *   - 首页：仅 search（导航层，无分页，无轮替控件）
 * 策略性显示：搜索与分页同时在场时**优先展示分页**（分页是浏览主路径，搜索
 * 为次要入口）；舱位固定使过渡方向天然正确（摩天轮观感）。
 * 岛是全站唯一搜索入口（header 不持有搜索框）。
 */
export function buildFloatbar(
  doc: Document,
  opts?: { search?: boolean; searchValue?: string; pager?: HTMLElement | null },
): FloatbarHandle | null {
  const searchEl = opts?.search ? buildSearchBox(doc, { value: opts.searchValue }) : null
  const pagerEl = opts?.pager ?? null
  if (!searchEl && !pagerEl) return null

  const pill = el(doc, 'div', 'umm-sht-floatbar')
  pill.id = 'umm-sht-floatbar'

  let mode: IslandMode = pagerEl ? 'pager' : 'search'

  const applySlots = () => {
    // 隐藏舱同步 aria-hidden（配合 CSS visibility:hidden：不可见即不可达，
    // 读屏与键盘不会再进入不可见舱）。
    if (searchEl) {
      const active = mode === 'search'
      searchEl.setAttribute('data-umm-slot', active ? 'active' : 'hidden-up')
      searchEl.setAttribute('aria-hidden', String(!active))
    }
    if (pagerEl) {
      const active = mode === 'pager'
      pagerEl.setAttribute('data-umm-slot', active ? 'active' : 'hidden-down')
      pagerEl.setAttribute('aria-hidden', String(!active))
    }
  }

  if (searchEl && pagerEl) {
    // 摩天轮舞台：两舱固定舱位（搜索上 / 分页下），切换即轮替入窗。
    const stage = el(doc, 'div', 'umm-sht-island-stage')
    stage.appendChild(searchEl)
    stage.appendChild(pagerEl)
    applySlots()
    pill.appendChild(stage)

    const switchBtn = el(doc, 'button', 'umm-sht-island-switch', '⇅') as HTMLButtonElement
    switchBtn.type = 'button'
    switchBtn.setAttribute('title', t('sht.island_switch'))
    switchBtn.setAttribute('aria-label', t('sht.island_switch'))
    switchBtn.addEventListener('click', () => show(mode === 'pager' ? 'search' : 'pager'))
    pill.appendChild(switchBtn)
  } else if (searchEl) {
    pill.appendChild(searchEl)
  } else if (pagerEl) {
    pill.appendChild(pagerEl)
  }

  const show = (next: IslandMode): void => {
    if (!(searchEl && pagerEl)) return
    if (next === mode) return
    mode = next
    applySlots()
  }

  return {
    pill,
    get mode() {
      return mode
    },
    show,
  }
}

// ---------------------------------------------------------------------------
// 样式已收编：组件 CSS 唯一事实源 = src/content/sehuatang/styles.ts
// （Shadow DOM 编译期常量，含运行时 hide-viewed 规则），本模块不再注入样式。
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 编排
// ---------------------------------------------------------------------------

/**
 * 编排入口：守卫（仅 forumdisplay 列表页）→ 提取 → 隐藏原版 → 双行 header 重建。
 * headerEl 为 overlay 内容根内的注入头部：
 *   row--context = 面包屑（左）+ 统计信息（右）
 *   row--nav     = 选项卡（左）+ 操作组（右：返回/发新帖/复制磁力/菜单；
 *                  搜索框不入 header——统一移至底部灵动岛）
 * 底部浮动栏（灵动岛，buildFloatbar 统一合成 = 搜索 + 分页）默认挂
 * doc.body（legacy light-DOM 路径），shadow 模式经 opts.floatbarParent 挂入
 * overlay 内容根；返回/发新帖不入岛（header 操作组已持有，重复入岛只会
 * 撑宽岛体、窄屏溢出）。
 */
export function mountSehuatangControls(
  doc: Document,
  headerEl: HTMLElement,
  opts?: { floatbarParent?: HTMLElement },
): void {
  if (headerEl.getAttribute('data-umm-sht-mounted') === '1') return
  if (!doc.getElementById('thread_types')) return
  headerEl.setAttribute('data-umm-sht-mounted', '1')

  // 提取必须先于隐藏（display:none 不影响 DOM 查询，但保持顺序清晰）。
  const breadcrumb = extractBreadcrumb(doc.querySelector('#pt .z'))
  const tabs = extractTypeTabs(doc.getElementById('thread_types'), doc.location?.href ?? '')
  const bottomPg = extractPagination(doc.querySelector('#fd_page_bottom .pg'))

  const topBack = doc.querySelector('#visitedforums a') as HTMLAnchorElement | null
  const topPost = doc.getElementById('newspecial')

  // 隐藏原版（保留 DOM 供「发新帖」click() 接线）。
  for (const sel of ['#pt', '#thread_types', '#pgt']) {
    const origin = doc.querySelector(sel) as HTMLElement | null
    if (origin) origin.style.display = 'none'
  }
  const bottomPgContainer = doc.getElementById('fd_page_bottom')?.closest('.pgs') as HTMLElement | null
  if (bottomPgContainer) bottomPgContainer.style.display = 'none'

  // 双行 header 重建：复用既有子元素（统计区 / 居中簇 / actions 操作组），只重组结构。
  // 上行三列网格 = [面包屑（左）| 居中簇 .umm-sht-center（🏠 + ☰，top center）
  // | 统计区（右）]；居中簇缺失时补空 spacer 保证三列轨道（右列仍靠右）。
  const statArea = headerEl.querySelector('.umm-sht-stat-area')
  const center = headerEl.querySelector('.umm-sht-center')
  const info = headerEl.querySelector('.umm-header-info')
  const actions = headerEl.lastElementChild as HTMLElement | null
  const crumbBar = buildBreadcrumbBar(doc, breadcrumb)
  const tabsBar = buildTabsBar(doc, tabs)

  const rowContext = el(doc, 'div', 'umm-sht-row umm-sht-row--context')
  if (crumbBar) rowContext.appendChild(crumbBar)
  rowContext.appendChild(center ?? el(doc, 'div', 'umm-sht-center'))
  if (statArea) rowContext.appendChild(statArea)
  else if (info) rowContext.appendChild(info)

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

  // 底部「灵动岛」悬浮栏：搜索 + 底部分页（buildFloatbar 统一合成；岛是
  // 全站唯一搜索入口）。返回/发新帖不再入岛——header 操作组已有同款，
  // 重复按钮只会把岛撑宽、窄屏溢出；上下页切换由 pager 的 ‹ › 图标承担。
  // 有分页时岛默认展示分页舱（策略性优先），⇅ 可轮替到搜索舱。
  const bottomBar = buildPager(doc, bottomPg)
  const island = buildFloatbar(doc, { search: true, pager: bottomBar })
  if (island) (opts?.floatbarParent ?? doc.body).appendChild(island.pill)
}
