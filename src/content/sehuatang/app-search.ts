/**
 * 色花堂搜索页（search.php?mod=forum）overlay 编排（结果卡片 + 已看 dimmer）。
 *
 * 接管链：sehuatang-early.content（document_start）已建 shadow host +
 * loading 骨架 → 本模块（document_idle 由 sehuatang-main.content 调用）。
 *
 * 渲染管线：
 *   1. i18n + DOM 守卫（#threadlist 与「结果:」meta 双双缺失 → dismiss overlay；
 *      任一在场即托管——空结果页的确切 DOM 无夹具，宽容处理）；
 *   2. 解析结果项（li.pbw[id]）+ 元信息（#ct 内 h2 「结果:」段）；
 *   3. 无关分区过滤（isSearchNoiseForum，如「求片问答悬赏区」forum-143——
 *      与记录管理无关的噪音，用户裁决直接不渲染）；
 *   4. 批量检查 avId + tid 双键（与列表页 dimmer 链路同款，sehuatang_ids
 *      兜底命中——搜索结果通常没有磁力但已被帖子页静默记录）；
 *   5. 隐藏原搜索结果容器（#threadlist / .tl / 分页），DOM 保留便于
 *      「发新帖」类外部调用；
 *   6. 头：结果计数 + 关键词 + 过滤注记（有过滤时）；顶部居中簇 = 🏠 首页 +
 *      ☰ 菜单（搜索框不入 header——统一移至底部灵动岛）；
 *   7. 主：结果卡片 grid（每条卡片：标题、摘要位、作者、时间、回复/查看数），
 *      命中已看集 → dimmer（与列表页同款 .umm-viewed 类、相同视觉契约）；
 *      过滤后 0 条或站点空结果 → 复用列表页空态插图（文案区分两种情形）；
 *   8. 底部「灵动岛」（buildFloatbar）：搜索框 + 分页——搜索结果页原生无
 *      #scbar（夹具实证），岛补全站唯一搜索入口；分页复用 buildPager
 *      （搜索页 .pg 结构与列表页同源，跳转模板由站点原 DOM 提供）；
 *      空结果分支岛仅搜索框。
 *
 * 视觉契约：消费现有 --usl-* 令牌（与列表页同款），不写裸色值；卡片结构
 * 复用 .umm-card 基础类（hover/grid 行为一致）。
 *
 * 已看 dimmer：搜索页条目**无磁力**，dimmer 是纯页面状态，**不落库**——
 * 数据变更由帖子页静默记录负责。点击 dimmer（initSearchClickDimmer）同契约：
 * 点击标题链接立即落 .umm-viewed（同 tick、跳转前生效），不产生任何
 * store/消息调用；搜索页无磁力无复制落库路径，不存在列表页的资格收窄
 * （shouldDimOnNavigate），点击即 dim。
 */

import { AdultAvStore } from '@/features/adult-av'
import { initI18n, t } from '@/entrypoints/content/i18n'
import { openSehuatangMenu } from '@/entrypoints/content/handlers/sehuatang-menu'
import { showManualAddPanel } from '@/entrypoints/content/ui/manual-add-panel'
import { showCheckViewedPanel } from '@/entrypoints/content/ui/check-viewed-panel'
import {
  buildFloatbar,
  buildHomeLink,
  buildPager,
  countSehuatangCardStates,
  extractPagination,
  runVisibleEntrance,
  dimCardsVisually,
  withDimBatch,
} from '@/entrypoints/content/handlers/sehuatang-controls'
import { escapeHtml } from '@/utils/escape-html'
import { attachSehuatangOverlay } from './overlay'
import { extractSearchKeyword } from './url'
import { collectThreadTrackKeys } from '@/entrypoints/content/handlers/sehuatang-extract'
import {
  extractSearchResults,
  extractSearchMeta,
  isSearchNoiseForum,
  type SehuatangSearchResult,
} from './extract-search'
import { buildEmptyState } from './empty-state'

function el(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function buildResultCard(result: SehuatangSearchResult, watched: boolean): HTMLElement {
  const card = el('div', 'umm-card umm-sht-search-card')
  if (watched) card.classList.add('umm-viewed')
  if (result.trackId) card.setAttribute('data-avid', result.trackId)
  if (result.tid) card.setAttribute('data-tid', result.tid)
  card.setAttribute('data-title', result.title)
  card.setAttribute('data-url', result.url)

  const safeUrl = /^https?:\/\//i.test(result.url) ? result.url : ''
  const replies = result.replies ?? 0
  const views = result.views ?? 0

  card.innerHTML = `
    <div class="umm-sht-search-body">
      <h3 class="umm-sht-search-title">
        <a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(result.title)}</a>
      </h3>
      <p class="umm-sht-search-meta">${escapeHtml(t('sht.search_replies_views', { replies: String(replies), views: String(views) }))}</p>
      ${result.preview ? `<p class="umm-sht-search-preview">${escapeHtml(result.preview)}</p>` : ''}
      <p class="umm-sht-search-foot">
        ${result.postedAt ? `<span class="umm-sht-search-when">${escapeHtml(result.postedAt)}</span>` : ''}
        ${result.author ? `<span class="umm-sht-search-author">${escapeHtml(t('sht.search_by', { author: result.author }))}</span>` : ''}
      </p>
    </div>
  `
  return card
}

function buildHeader(meta: ReturnType<typeof extractSearchMeta>, filteredCount = 0): HTMLElement {
  const header = el('div', 'umm-sehuatang-header')

  // 上行：结果计数 + 过滤注记（左，.umm-sht-context）｜ 右上角统计区（两个
  // box：本页状态 + 全局三段——与列表页/首页同构，整组 margin-left:auto）。
  const rowContext = el('div', 'umm-sht-row umm-sht-row--context')
  const context = el('div', 'umm-sht-context')
  if (meta) {
    context.textContent = t('sht.search_results_count', {
      count: String(meta.count),
      keyword: meta.keyword,
    })
  } else {
    context.textContent = t('sht.search_title')
  }
  // 过滤透明化：站点计数是全量，不注明会把「过滤」误读为「站点没结果」。
  // 分隔符并入文案值（en = em dash，中文 = 全角逗号），避免 CJK 前出现半角空格。
  if (filteredCount > 0) {
    context.textContent += t('sht.search_filtered_note', { count: String(filteredCount) })
  }
  rowContext.appendChild(context)

  // 顶部居中簇（header top center）：🏠 首页 + ☰ 菜单——row--context 三列
  // 网格的中列；搜索页动作仅此二者，故不再有 nav 行（header 收为单行）。
  const center = el('div', 'umm-sht-center')
  center.appendChild(buildHomeLink(document))

  const menuBtn = el('button', 'umm-sht-action')
  menuBtn.textContent = '☰'
  menuBtn.setAttribute('aria-haspopup', 'dialog')
  menuBtn.title = t('Menu Title')
  menuBtn.onclick = () => {
    openSehuatangMenu(document, menuBtn, t('Menu Title'), [
      { label: t('Manual Add'), onClick: () => showManualAddPanel() },
      { label: t('Check Viewed Status'), onClick: () => showCheckViewedPanel() },
    ])
  }
  center.appendChild(menuBtn)
  rowContext.appendChild(center)

  const statArea = el('div', 'umm-sht-stat-area')
  statArea.appendChild(el('div', 'umm-header-info'))
  statArea.appendChild(el('div', 'umm-sht-stats'))
  rowContext.appendChild(statArea)
  header.appendChild(rowContext)
  return header
}

/**
 * 点击 dimmer（grid 事件委托，参考列表页 initNavigateDimmer 形态）：
 * 点击卡片标题链接 → 立即落 .umm-viewed（同一 tick，新标签页打开前生效）。
 *
 * **不落库**（dimCardsVisually 契约）：写入仍由目标帖子页的静默记录负责，
 * 此处重复落库属冗余。搜索页无磁力、无复制落库路径——不存在列表页
 * shouldDimOnNavigate 的资格收窄（那是为保护「磁力复制才落库」信号设计的），
 * 点击即 dim。幂等守卫 + dimCardsVisually 自带幂等（已 dim 卡跳过）。
 * onDim：可选回调（每次实际落 dim 后触发；统计行「本页已看」即时刷新用）。
 */
export function initSearchClickDimmer(grid: HTMLElement, onDim?: () => void): void {
  if (grid.getAttribute('data-umm-sht-dim') === '1') return
  grid.setAttribute('data-umm-sht-dim', '1')

  grid.addEventListener('click', (event) => {
    const target = event.target
    if (!(target instanceof Element)) return
    // 唯一跳转面 = 标题链接（搜索卡无封面图、无磁力锚点）。
    if (!target.closest('.umm-sht-search-title a')) return
    const card = target.closest('.umm-card') as HTMLElement | null
    if (!card) return
    const marked = dimCardsVisually([card])
    if (marked > 0) onDim?.()
  })
}

/** 隐藏原搜索结果容器（DOM 保留，规避站点行为）。 */
function hideOriginalContent(): void {
  // .tl = 搜索结果外层容器
  for (const sel of ['.tl', '.pgs']) {
    const node = document.querySelector(sel) as HTMLElement | null
    if (node) node.style.display = 'none'
  }
}

/**
 * 搜索 overlay 编排入口。
 * 早期入口已建 shadow host；DOM 守卫失败 → dismiss 还原原页面。
 */
export async function runSehuatangSearchApp(): Promise<void> {
  await initI18n()
  console.log('[UMM] Sehuatang search app activated')

  // DOM 守卫：#threadlist 与「结果:」meta 双双缺失 → 结构未知/非结果态，
  // dismiss 还原原生页；任一在场即托管（空结果页的确切 DOM 无夹具核实，
  // 宽容处理——站点空结果时二者通常至少其一在场）。
  const results = extractSearchResults()
  const meta = extractSearchMeta()
  const overlay = attachSehuatangOverlay()
  if (!document.getElementById('threadlist') && !meta) {
    overlay?.dismiss()
    return
  }
  if (!overlay) return

  // 无关分区过滤（如「求片问答悬赏区」forum-143，用户裁决：无意义内容不渲染）。
  const kept = results.filter((r) => !isSearchNoiseForum(r.forumId))
  const filteredCount = results.length - kept.length

  // 搜索词回填：结果页 URL 用 kw（夹具核实）、本扩展生成用 srchtxt——两者都取；
  // URL 无参数时退化到页面「结果:」h2 的关键词（宽容兜底）。
  const initialKeyword = extractSearchKeyword(document.location?.href ?? '') || meta?.keyword || ''

  // 提取分页（#threadlist 之后是 .pgs.mbm > .pg，结构与列表页同源）。
  const pagination = extractPagination(document.querySelector('.pgs .pg'))

  // 隐藏原内容（DOM 保留）。
  hideOriginalContent()

  // 重建 overlay 内容根（--island：挂岛页面，底部遮挡补偿 padding 生效）。
  const shell = el('div', 'umm-sht-shell umm-sht-shell--island')
  const headerEl = buildHeader(meta, filteredCount)
  shell.appendChild(headerEl)

  const grid = el('div', 'umm-sht-search-grid')
  shell.appendChild(grid)

  // 全空反馈：过滤后 0 条（站点空结果 / 结果全部来自无关分区）→ 复用列表页
  // 空态插图，文案区分两种情形；无卡可渲染时跳过分页与后续 dimmer 链路，
  // 岛降级为仅搜索入口（仍可改关键词重搜）。
  if (kept.length === 0) {
    shell.appendChild(
      buildEmptyState(
        document,
        results.length === 0
          ? { title: t('sht.search_empty_title'), hint: t('sht.search_empty_hint') }
          : {
              title: t('sht.search_empty_filtered_title'),
              hint: t('sht.search_empty_filtered_hint'),
            },
      ),
    )
    const emptyIsland = buildFloatbar(document, { search: true, searchValue: initialKeyword })
    if (emptyIsland) shell.appendChild(emptyIsland.pill)
    overlay.mountContent(shell)
    console.log(`[UMM] Sehuatang search: ${results.length} results, empty after filter (filtered=${filteredCount})`)
    return
  }

  // 已看 dimmer：先空挂卡片（统一行为：hide OFF），已看检查后批量加类。
  for (const r of kept) grid.appendChild(buildResultCard(r, false))

  // 点击 dimmer：点击标题链接 → 立即落 .umm-viewed（不落库，写入归帖子页静默记录）。
  // 统计行接线：本页已看即时读 DOM 类状态（初检 dim 与点击 dim 后各刷一次），
  // 全局三段走 stats 消息单次拉取（失败降级 0——与列表页同纪律，不阻塞首屏）。
  let globalStats = { jp: 0, us: 0, tid: 0 }
  const pageBoxEl = headerEl.querySelector('.umm-header-info') as HTMLElement | null
  const globalBoxEl = headerEl.querySelector('.umm-sht-stats') as HTMLElement | null
  const renderStats = () => {
    if (!grid.isConnected) return
    if (pageBoxEl?.isConnected) {
      pageBoxEl.textContent = t('sht.page_watched', {
        watched: String(countSehuatangCardStates(grid).watched),
      })
    }
    if (globalBoxEl?.isConnected) {
      globalBoxEl.textContent = t('sht.global_stats', {
        jp: String(globalStats.jp),
        us: String(globalStats.us),
        tid: String(globalStats.tid),
      })
    }
  }
  AdultAvStore.stats().then((s) => {
    globalStats = s
    renderStats()
  }).catch(() => {})
  initSearchClickDimmer(grid, () => renderStats())

  // 底部「灵动岛」：搜索框 + 分页统一入岛（buildFloatbar 统一合成；搜索页
  // 无 返回/发新帖 场景动作）。buildPager 对空分页数据返回 null → 岛自然
  // 退化为仅搜索。
  const pager = buildPager(document, pagination)
  const island = buildFloatbar(document, { search: true, searchValue: initialKeyword, pager })
  if (island) shell.appendChild(island.pill)

  overlay.mountContent(shell)
  runVisibleEntrance(shell)

  // 已看批量检查（与列表页同款，await 不阻塞首屏；首屏真卡已就位，到达后
  // 单帧统一加 .umm-viewed）。collectThreadTrackKeys 直接消费搜索结果——
  // 字段语义已与列表页 SehuatangThread 对齐（tid = TID-<tid> 键）。
  const trackIds = collectThreadTrackKeys(kept)
  if (trackIds.length === 0) {
    console.log('[UMM] Sehuatang search: no trackable ids (no avId, no tid)')
    return
  }
  const watched = await AdultAvStore.batchCheckExists(trackIds)
  if (!grid.isConnected) return
  // 已看集归一化一次（大写），避免逐卡两侧 toUpperCase 分配；批量落类走
  // withDimBatch（几十张同帧加类不各播过渡——首屏 dim 提速）。
  const watchedUpper = new Set(Array.from(watched).map((key) => key.toUpperCase()))
  let dimmed = 0
  withDimBatch(grid, () => {
    for (const card of Array.from(grid.querySelectorAll('.umm-card[data-avid], .umm-card[data-tid]')) as HTMLElement[]) {
      if (card.classList.contains('umm-viewed')) continue // 点击标记已落类 → 跳过
      const avid = card.getAttribute('data-avid')
      const tid = card.getAttribute('data-tid')
      if ((avid !== null && avid !== '' && watchedUpper.has(avid.toUpperCase()))
        || (tid !== null && tid !== '' && watchedUpper.has(tid.toUpperCase()))) {
        card.classList.add('umm-viewed')
        dimmed++
      }
    }
  })
  // 初检 dim 落定后刷新统计行（本页已看从占位 → 实际 dim 数）。
  renderStats()
  console.log(`[UMM] Sehuatang search rendered: ${kept.length} results (filtered=${filteredCount}), ${dimmed} dimmed`)
}
