/**
 * 色花堂首页（pg_index）overlay 编排（首页分区网格）。
 *
 * 接管链：sehuatang-early.content（document_start）已建 shadow host +
 * loading 骨架 → 本模块（document_idle 由 sehuatang-main.content 调用）。
 *
 * 渲染管线：
 *   1. i18n + DOM 守卫（无 category_ 容器 → dismiss overlay 退出）；
 *   2. 提取分区（category_X）与首页统计（#chart .chart）—— 覆盖层下的原
 *      页面 DOM 完整保留；图标态由提取层一次解出（零编排层 DOM 重扫）；
 *   3. 隐藏原 #ct 容器（公告 + 分区网格 + 站点统计全部藏起，DOM 保留以便
 *      「发新帖」类外部调用）；保留 #wp 的内层结构避免破坏全局 SPA 行为；
 *   4. 头：站点名 + 统计摘要；
 *   5. 主：分区折叠（每个分区 = 标题 + 子版块卡片 grid），分区之间为分组
 *      视觉断点；
 *   6. 卡片：图标（站点自带的 `forum_new.gif` / `forum.gif` 二态区分）、
 *      子版块名、今日新增徽标、主题/帖数/最后发表；
 *   7. 入场级联：rAF + 批量读 rect 后统一写类名（首屏可见卡才有延迟，
 *      共享 sehuatang-controls.runVisibleEntrance）。
 *
 * 视觉契约：消费现有 --usl-* 令牌（与列表页同款），不写裸色值；卡片结构
 * 复用 .umm-card 基础类（与列表页同款 hover/grid 行为）。
 */

import { initI18n, t } from '@/entrypoints/content/i18n'
import { openSehuatangMenu } from '@/entrypoints/content/handlers/sehuatang-menu'
import { showManualAddPanel } from '@/entrypoints/content/ui/manual-add-panel'
import { showCheckViewedPanel } from '@/entrypoints/content/ui/check-viewed-panel'
import { runVisibleEntrance, buildSearchBox } from '@/entrypoints/content/handlers/sehuatang-controls'
import { escapeHtml } from '@/utils/escape-html'
import { attachSehuatangOverlay } from './overlay'
import { toSafeAbsoluteUrl } from './url'
import {
  extractIndexCategories,
  extractIndexStats,
  type SehuatangCategory,
  type SehuatangSubForum,
} from './extract-home'

function el(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function buildSubForumCard(forum: SehuatangSubForum): HTMLElement {
  const safeHref = toSafeAbsoluteUrl(forum.href)
  const safeIconSrc = toSafeAbsoluteUrl(forum.iconSrc)

  const card = el('div', 'umm-card umm-sht-home-card')
  card.innerHTML = `
    <a class="umm-sht-home-link" href="${escapeHtml(safeHref)}" target="_blank" rel="noopener noreferrer">
      <div class="umm-sht-home-icon ${forum.hasNew ? 'is-new' : ''}">
        ${safeIconSrc ? `<img src="${escapeHtml(safeIconSrc)}" alt="" loading="lazy" decoding="async">` : ''}
      </div>
      <div class="umm-sht-home-body">
        <div class="umm-sht-home-name">${escapeHtml(forum.name)}</div>
        <div class="umm-sht-home-meta">
          ${forum.todayCount !== null
            ? `<span class="umm-sht-home-pill">${escapeHtml(t('sht.forum_today', { count: String(forum.todayCount) }))}</span>`
            : ''}
          ${forum.threadsCount
            ? `<span>${escapeHtml(t('sht.forum_threads', { count: forum.threadsCount }))}</span>`
            : ''}
          ${forum.postsCount
            ? `<span>${escapeHtml(t('sht.forum_posts', { count: forum.postsCount }))}</span>`
            : ''}
        </div>
        <div class="umm-sht-home-last">
          ${forum.lastPostLabel
            ? escapeHtml(t('sht.forum_last', { when: forum.lastPostLabel }))
            : escapeHtml(t('sht.forum_never'))}
        </div>
      </div>
    </a>
  `
  return card
}

function buildCategorySection(category: SehuatangCategory): HTMLElement {
  const section = el('section', 'umm-sht-home-section')
  section.setAttribute('data-cat', category.id)

  const titleRow = el('div', 'umm-sht-home-cat')
  titleRow.textContent = category.title
  section.appendChild(titleRow)

  const grid = el('div', 'umm-sht-home-grid')
  for (const forum of category.forums) {
    grid.appendChild(buildSubForumCard(forum))
  }
  section.appendChild(grid)
  return section
}

function buildHeader(stats: ReturnType<typeof extractIndexStats>): HTMLElement {
  const header = el('div', 'umm-sehuatang-header')
  const info = el('div', 'umm-header-info')
  header.appendChild(info)
  if (stats) {
    info.textContent = t('sht.index_stats', {
      today: stats.today,
      yesterday: stats.yesterday,
      posts: stats.posts,
      members: stats.members,
    })
  } else {
    info.textContent = t('sht.index_title')
  }

  const actions = el('div', 'umm-sht-home-actions')

  // 搜索框：原生 #scbar 搜索条被 overlay 取代后的重建（首页导航层，搜索最前置）。
  actions.appendChild(buildSearchBox(document))

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

/** 隐藏原首页内容（#ct 容器）。保留 #wp 外壳（与站点 SPA 行为兼容）。 */
function hideOriginalContent(): void {
  const ct = document.getElementById('ct')
  if (ct) ct.style.display = 'none'
}

/**
 * 首页 overlay 编排入口。
 * 早期入口已建 shadow host；失败兜底 = dismiss 还原原页面。
 * 构建期任何异常（DOM 漂移等）→ dismiss 拆壳：#ct 已隐藏，不能把用户
 * 困在骨架屏上。
 */
export async function runSehuatangIndexApp(): Promise<void> {
  await initI18n()
  console.log('[UMM] Sehuatang index app activated')

  const overlay = attachSehuatangOverlay()
  try {
    // DOM 守卫：必须存在至少一个 category_ 容器，否则视为非首页。
    const categories = extractIndexCategories()
    const stats = extractIndexStats()
    if (categories.length === 0) {
      overlay?.dismiss()
      return
    }
    if (!overlay) return

    // 隐藏原内容（DOM 保留，规避站点 SPA 行为）。
    hideOriginalContent()

    // 重建 overlay 内容根。
    const shell = el('div', 'umm-sht-shell')
    shell.appendChild(buildHeader(stats))

    for (const category of categories) {
      shell.appendChild(buildCategorySection(category))
    }
    overlay.mountContent(shell)
    runVisibleEntrance(shell)
    // 样式已就位（attachSehuatangOverlay 已注入完整 overlay CSS，包含 HOME_CSS）。
    console.log(`[UMM] Sehuatang index rendered: ${categories.length} categories, ${categories.reduce((n, c) => n + c.forums.length, 0)} sub-forums`)
  } catch (error) {
    console.error('[UMM] Sehuatang index build failed, dismissing overlay:', error)
    overlay?.dismiss()
  }
}
