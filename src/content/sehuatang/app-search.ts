/**
 * 色花堂搜索页（search.php?mod=forum）overlay 编排（结果卡片 + 已看 dimmer）。
 *
 * 接管链：sehuatang-early.content（document_start）已建 shadow host +
 * loading 骨架 → 本模块（document_idle 由 sehuatang-main.content 调用）。
 *
 * 渲染管线：
 *   1. i18n + DOM 守卫（无 #threadlist → dismiss overlay）；
 *   2. 解析结果项（li.pbw[id]）+ 元信息（#ct 内 h2 「结果:」段）；
 *   3. 批量检查 avId + tid 双键（与列表页 dimmer 链路同款，sehuatang_ids
 *      兜底命中——搜索结果通常没有磁力但已被帖子页静默记录）；
 *   4. 隐藏原搜索结果容器（#threadlist / .tl / 分页），DOM 保留便于
 *      「发新帖」类外部调用；
 *   5. 头：结果计数 + 关键词 + 复制链接按钮；
 *   6. 主：结果卡片 grid（每条卡片：标题、摘要位、作者、时间、回复/查看数），
 *      命中已看集 → dimmer（与列表页同款 .umm-viewed 类、相同视觉契约）；
 *   7. 底部分页：复用 sehuatang-controls.buildPager（搜索页 .pg 结构与列表
 *      页同源，跳转模板「search.php?…&page=N」由站点原 DOM 提供）。
 *
 * 视觉契约：消费现有 --usl-* 令牌（与列表页同款），不写裸色值；卡片结构
 * 复用 .umm-card 基础类（hover/grid 行为一致）。
 *
 * 已看 dimmer：搜索页条目**无磁力**，故 dimmer 是页面状态，**不落库**——
 * 数据变更由用户点击进入帖子后的 sehuatang-main.content 静默记录负责。
 */

import { AdultAvStore } from '@/features/adult-av'
import { initI18n, t } from '@/entrypoints/content/i18n'
import { openSehuatangMenu } from '@/entrypoints/content/handlers/sehuatang-menu'
import { showManualAddPanel } from '@/entrypoints/content/ui/manual-add-panel'
import { showCheckViewedPanel } from '@/entrypoints/content/ui/check-viewed-panel'
import {
  buildPager,
  extractPagination,
  runVisibleEntrance,
} from '@/entrypoints/content/handlers/sehuatang-controls'
import { escapeHtml } from '@/utils/escape-html'
import { attachSehuatangOverlay } from './overlay'
import { collectThreadTrackKeys } from '@/entrypoints/content/handlers/sehuatang-extract'
import {
  extractSearchResults,
  extractSearchMeta,
  type SehuatangSearchResult,
} from './extract-search'

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

function buildHeader(meta: ReturnType<typeof extractSearchMeta>): HTMLElement {
  const header = el('div', 'umm-sehuatang-header')
  const info = el('div', 'umm-header-info')
  if (meta) {
    info.textContent = t('sht.search_results_count', {
      count: String(meta.count),
      keyword: meta.keyword,
    })
  } else {
    info.textContent = t('sht.search_title')
  }
  header.appendChild(info)

  const actions = el('div', 'umm-sht-search-actions')

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
  actions.appendChild(menuBtn)
  header.appendChild(actions)
  return header
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

  // DOM 守卫：必须找到 #threadlist 且至少一条 li.pbw。
  const results = extractSearchResults()
  const meta = extractSearchMeta()
  const overlay = attachSehuatangOverlay()
  if (results.length === 0) {
    overlay?.dismiss()
    return
  }
  if (!overlay) return

  // 提取分页（#threadlist 之后是 .pgs.mbm > .pg，结构与列表页同源）。
  const pagination = extractPagination(document.querySelector('.pgs .pg'))

  // 隐藏原内容（DOM 保留）。
  hideOriginalContent()

  // 重建 overlay 内容根。
  const shell = el('div', 'umm-sht-shell')
  shell.appendChild(buildHeader(meta))

  const grid = el('div', 'umm-sht-search-grid')
  shell.appendChild(grid)

  // 已看 dimmer：先空挂卡片（统一行为：hide OFF），已看检查后批量加类。
  for (const r of results) grid.appendChild(buildResultCard(r, false))

  // 底部分页（如有）
  if (pagination) {
    const pager = buildPager(document, pagination)
    if (pager) {
      const pagerWrap = el('div', 'umm-sht-search-pager')
      pagerWrap.appendChild(pager)
      shell.appendChild(pagerWrap)
    }
  }

  overlay.mountContent(shell)
  runVisibleEntrance(shell)

  // 已看批量检查（与列表页同款，await 不阻塞首屏；首屏真卡已就位，到达后
  // 单帧统一加 .umm-viewed）。collectThreadTrackKeys 直接消费搜索结果——
  // 字段语义已与列表页 SehuatangThread 对齐（tid = TID-<tid> 键）。
  const trackIds = collectThreadTrackKeys(results)
  if (trackIds.length === 0) {
    console.log('[UMM] Sehuatang search: no trackable ids (no avId, no tid)')
    return
  }
  const watched = await AdultAvStore.batchCheckExists(trackIds)
  if (!grid.isConnected) return
  let dimmed = 0
  for (const card of Array.from(grid.querySelectorAll('.umm-card[data-avid], .umm-card[data-tid]')) as HTMLElement[]) {
    const avid = card.getAttribute('data-avid')
    const tid = card.getAttribute('data-tid')
    if ((avid && watched.has(avid.toUpperCase())) || (tid && watched.has(tid.toUpperCase()))) {
      card.classList.add('umm-viewed')
      dimmed++
    }
  }
  console.log(`[UMM] Sehuatang search rendered: ${results.length} results, ${dimmed} dimmed`)
}
