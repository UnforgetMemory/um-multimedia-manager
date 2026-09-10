/**
 * 色花堂 overlay 编排（ADR-024 D1/D3）。
 *
 * 接管链：sehuatang-early.content（document_start）已建 shadow host +
 * loading 骨架 → 本模块（document_idle 由 sehuatang-main.content 调用）。
 *
 * 渲染管线正确顺序（性能核心纪律）：
 *   1. i18n + DOM 守卫（#threadlisttableid 缺失 → dismiss overlay 退出）；
 *   2. 同步提取原生行数据/控件（覆盖层下的原页面 DOM 完整保留）；
 *   3. 行内数据（标题/日期/链接）先行渲染：hide OFF 直接挂真卡；hide ON
 *      先挂骨架卡（已看检查到达前不泄露已看条目，到达后单帧换真卡，无中途 pop）；
 *   4. 已看批量检查与渲染并行扇出——首屏不被任何消息/DB 阻塞；
 *   5. 封面/磁力 = IntersectionObserver 懒加载（detail-loader：缓存 → fetch），
 *      卡片入视口才产生请求；图片 lazy + decoding=async；
 *   6. 入场级联仅首屏可见卡（rAF + 批量读 rect 后统一写，读写不交错）。
 *
 * 查询纪律：UI 元素一律经 shell/grid/header 闭包引用或容器内 querySelector，
 * 禁止 document 级全文档扫描（原页面 DOM 巨大且与我们无关）。
 */

import { AdultAvStore } from '@/features/adult-av'
import { settingsItems } from '@/features/settings/items'
import { classifyAvId, normalizeAvId } from '@/features/adult-av/models'
import { t, initI18n } from '@/entrypoints/content/i18n'
import { showManualAddPanel } from '@/entrypoints/content/ui/manual-add-panel'
import { showCheckViewedPanel } from '@/entrypoints/content/ui/check-viewed-panel'
import { escapeHtml } from '@/utils/escape-html'
import { throttle } from '@/utils'
import { onEvent } from '@/utils/event-bus'
import { FloatingToast } from '@/entrypoints/content/utils/toast'
import { mountSehuatangControls, countSehuatangCardStates, markCardsViewed, setGridHideViewed, dimCardsVisually, runVisibleEntrance } from '@/entrypoints/content/handlers/sehuatang-controls'
import { openSehuatangMenu } from '@/entrypoints/content/handlers/sehuatang-menu'
import { initImageReveal, runCardEntrance } from '@/entrypoints/content/handlers/sehuatang-effects'
import { partitionInitialVisible, parseThreadRow, collectNewThreadRows, collectThreadTrackKeys, shouldDimOnNavigate, type SehuatangThread } from '@/entrypoints/content/handlers/sehuatang-extract'
import { attachSehuatangOverlay } from './overlay'
import { createDetailLoader, DETAIL_FLAG, type CardDetail, type DetailLoader } from './detail-loader'

// 页面生命周期状态：每次 handler 运行重置。
// 三段已看统计缓存（ADR-025 D5）：避免每卡/每次刷新都全量读三表（2N 次消息 → 1 次）。
interface AvStats { jp: number; us: number; tid: number }
let statsCache: AvStats | null = null
let statsLoading = false
// 初始进程被隐藏（不渲染）的已看数——「本页隐藏」统计源；运行时标记永不隐藏。
let hiddenAtMount = 0

// 保存失败诊断标记（sessionStorage 按源跨页存活）：复制后立即切页也能在
// 下一个页面呈现失败原因，解决「证据随页面销毁」的不可见失败。
const SAVE_FAILURE_KEY = 'umm-sht-save-failure'

function reportSaveFailure(reason: string, detail?: string): void {
  console.warn('[UMM] Sehuatang save failure:', reason, detail ?? '')
  try {
    sessionStorage.setItem(SAVE_FAILURE_KEY, JSON.stringify({ at: Date.now(), reason, detail: detail ?? '' }))
  } catch { /* 存储不可用时仅 console 可见 */ }
}

function consumeSaveFailure(): void {
  try {
    const raw = sessionStorage.getItem(SAVE_FAILURE_KEY)
    if (!raw) return
    sessionStorage.removeItem(SAVE_FAILURE_KEY)
    const parsed = JSON.parse(raw) as { reason?: string; detail?: string }
    const detail = parsed.detail ? ` (${parsed.detail})` : ''
    FloatingToast.error(t('Magnet Save Failed'), `${parsed.reason ?? ''}${detail}`)
  } catch { /* 解析失败忽略 */ }
}

// 页面级单例（重入清理）：分页观察器 / 详情加载器 / 事件订阅。
let activePaginationObserver: MutationObserver | null = null
let activeDetailLoader: DetailLoader | null = null
let activeUnsubscribeEvents: (() => void) | null = null

/**
 * 本次会话内「仅视觉」标记的卡片（点击跳转触发，不落库）。
 *
 * 必须与 DB 派生的 .umm-viewed 区分：record:updated 会触发全量重算
 * （applyWatchedClasses → classList.toggle），若不豁免，别的卡片落库会把
 * 这里的 dimmer 抹掉，用户的即时反馈会闪回。
 */
let visuallyMarked = new WeakSet<HTMLElement>()

/** 统计刷新（节流 trailing 250ms，合并高频触发；历史数走缓存）。 */
const throttledRefreshStats = throttle((headerEl: HTMLElement, grid: HTMLElement) => {
  refreshHeaderStats(headerEl, grid)
}, 250)

function refreshHeaderStats(headerEl: HTMLElement, grid: HTMLElement) {
  const infoEl = headerEl.querySelector('.umm-header-info') as HTMLElement | null
  if (!infoEl) return
  const { watched } = countSehuatangCardStates(grid)
  const render = () => {
    infoEl.textContent = t('Header Info', {
      watched: String(watched),
      hidden: String(hiddenAtMount),
      jp: String(statsCache?.jp ?? 0),
      us: String(statsCache?.us ?? 0),
      tid: String(statsCache?.tid ?? 0),
    })
  }
  render()
  if (statsCache === null && !statsLoading) {
    statsLoading = true
    AdultAvStore.stats().then((stats) => {
      statsCache = stats
      render()
    }).catch(() => { /* 降级：保持空值，下次重试 */ }).finally(() => { statsLoading = false })
  }
}

/** 本地标记已看后：三段统计缓存按分类器增量修正（不等下一次全量读三表）。 */
function bumpStats(ids: string[]): void {
  if (!statsCache) return
  for (const id of ids) {
    const kind = classifyAvId(normalizeAvId(id))
    if (kind === 'us') statsCache.us += 1
    else if (kind === 'tid') statsCache.tid += 1
    else statsCache.jp += 1
  }
}

/** 头部统计 + 复制全部按钮态（懒加载时代：按钮不再等详情全量到达，
 * 有未看卡即可点——点击后对未加载项并发补抓）。 */
function updateHeaderInfo(headerEl: HTMLElement, grid: HTMLElement) {
  throttledRefreshStats(headerEl, grid)
  const btnEl = headerEl.querySelector('.umm-copy-btn') as HTMLButtonElement | null
  if (btnEl && !btnEl.hasAttribute('data-umm-copying')) {
    const unviewed = grid.querySelectorAll('.umm-card:not(.umm-viewed)').length
    btnEl.disabled = unviewed === 0
    btnEl.textContent = `⚡ ${t('Copy All Magnets')} (${unviewed})`
  }
}

/** 构建单卡静态结构（零网络；封面/磁力由 DetailLoader 懒加载回填）。 */
function buildCard(info: SehuatangThread): HTMLElement {
  const card = document.createElement('div')
  card.className = 'umm-card'
  if (info.trackId) card.setAttribute('data-avid', info.trackId)
  if (info.tid) card.setAttribute('data-tid', info.tid)
  card.setAttribute('data-title', info.title)
  card.setAttribute('data-url', info.url)

  // 协议白名单与封面/磁力同源：非 http(s) 的 data-url 不设 href（锚点不可导航）。
  const safeUrl = /^https?:\/\//i.test(info.url) ? info.url : ''
  card.innerHTML = `
    <div class="umm-card-image"></div>
    <div class="umm-card-content">
      <h3 class="umm-card-title"><a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(info.title)}</a></h3>
      <p class="umm-card-meta">${escapeHtml(info.releaseDate)}</p>
      <div class="umm-card-links"></div>
    </div>
  `
  return card
}

/** 骨架卡占位（hide ON 时已看检查期间；数量与真实行数一致防布局跳变）。 */
function renderSkeleton(grid: HTMLElement, count: number): void {
  const fragment = document.createDocumentFragment()
  for (let i = 0; i < count; i++) {
    const card = document.createElement('div')
    card.className = 'umm-card umm-sht-skel'
    card.setAttribute('aria-hidden', 'true')
    card.innerHTML = '<div class="umm-card-image"></div><div class="umm-card-content"><div class="umm-sht-skel-line" style="width:88%"></div><div class="umm-sht-skel-line" style="width:40%"></div></div>'
    fragment.appendChild(card)
  }
  grid.replaceChildren(fragment)
}

/** 详情回填（缓存/抓取同一路径）：封面 + 磁力锚点 + 复制标记接线。
 *  headerRef 间接引用：loader 先于 header 创建（copy-all 依赖 loader），
 *  磁力点击回调触发时 header 必然已就位。 */
function makeDetailFiller(grid: HTMLElement, headerRef: { current: HTMLElement | null }): (card: HTMLElement, detail: CardDetail) => void {
  return (card, detail) => {
    const imgContainer = card.querySelector('.umm-card-image')
    if (detail.imageUrl && imgContainer && !imgContainer.querySelector('img')) {
      const img = document.createElement('img')
      img.src = detail.imageUrl
      img.loading = 'lazy'
      img.decoding = 'async'
      img.alt = ''
      // 协议白名单复用于封面跳转：仅 http(s) 可 window.open（标题链接为静态
      // 渲染的站内 URL，仍按不可信输入防御）。
      const pageUrl = card.getAttribute('data-url') ?? ''
      if (/^https?:/i.test(pageUrl.trim())) {
        img.onclick = () => window.open(pageUrl, '_blank', 'noopener,noreferrer')
      }
      imgContainer.appendChild(img)
    }

    if (detail.magnetLink && !card.querySelector('.umm-magnet-link')) {
      const magnetLink = detail.magnetLink
      // 协议白名单：磁力链接来自站点详情页文本，仍按不可信输入防御——
      // 仅 magnet:/http(s): 可作 href 导航；非法则不设 href（锚点不可导航）。
      const safeHref = /^(magnet:|https?:)/i.test(magnetLink.trim())
      const a = document.createElement('a')
      if (safeHref) a.href = magnetLink
      a.className = 'umm-magnet-link'
      a.textContent = '⚡'
      a.title = t('Copy Magnet')
      a.onclick = (e) => {
        e.preventDefault()
        navigator.clipboard.writeText(magnetLink).then(() => {
          // 复制反馈动效：按钮 pop + toast（仅复制成功时）。
          a.classList.add('umm-sht-copied')
          setTimeout(() => a.classList.remove('umm-sht-copied'), 650)
          FloatingToast.success(t('Copy Done', { count: String(1) }))
        }).catch((error: unknown) => {
          console.warn('[UMM] Sehuatang clipboard write failed:', error)
        })
        // 统一标记路径：data-avid = trackId（番号或 TID 兜底），类落下即
        // dimmer 生效；落库走单次批量消息，失败自动逐条兜底 + 跨页失败标记。
        const header = headerRef.current
        const refresh = () => { if (header) updateHeaderInfo(header, grid) }
        // 该卡若此前被「点击跳转」标记过（只加类、未落库），先摘掉视觉标记——
        // 否则会被 markCardsViewed 的「已含 .umm-viewed 即跳过」幂等过滤吞掉，
        // 观看记录永远不落库。摘除后由 markCardsViewed 同步把类补回。
        if (visuallyMarked.delete(card)) card.classList.remove('umm-viewed')
        markCardsViewed(
          [card], 'sehuatang', AdultAvStore,
          refresh,
          (added, ids) => {
            bumpStats(ids)
            refresh()
            console.log(`[UMM] saved watched ids (${added}):`, ids.join(', ') || '(none)')
          },
          (error) => { reportSaveFailure(String(error)); FloatingToast.error(t('Magnet Save Failed')) },
        )
      }
      card.querySelector('.umm-card-links')?.appendChild(a)
    }
  }
}

/** 批量构卡 → 单帧挂载 → 逐卡纳入懒加载观察。 */
function mountCards(grid: HTMLElement, threads: SehuatangThread[], loader: DetailLoader): HTMLElement[] {
  const fragment = document.createDocumentFragment()
  const cards: HTMLElement[] = []
  for (const info of threads) {
    const card = buildCard(info)
    cards.push(card)
    fragment.appendChild(card)
  }
  grid.appendChild(fragment)
  for (const card of cards) loader.watch(card)
  return cards
}

/** 卡片候选判定键（data-avid 主键 + data-tid 兜底键）——非空即纳入。 */
function cardTrackKeys(card: HTMLElement): string[] {
  return [card.getAttribute('data-avid'), card.getAttribute('data-tid')]
    .filter((key): key is string => key !== null && key !== '')
}

/** 已看类批量应用（hide OFF 异步路径与 record:updated 同步共用）。
 *  双键命中：番号键（jav_ids/usav_ids）或 TID 键（sehuatang_ids）任一即已看。
 *
 *  preserveVisualMarks：是否保留会话内「点击跳转」的视觉标记。
 *    - record:**updated** → true：别的卡片落库会触发全量重算，若此刻不豁免，
 *      被点击卡在帖子页写入到达前会被 toggle(false) 抹掉（即时反馈闪回）；
 *    - record:**deleted** → false：用户显式删除记录时视觉标记必须一并失效，
 *      否则删除不生效，且「本页已看」与三段统计自相矛盾。
 */
function applyWatchedClasses(grid: HTMLElement, watchedIds: Set<string>, preserveVisualMarks = true): void {
  for (const card of Array.from(grid.querySelectorAll('.umm-card[data-avid], .umm-card[data-tid]')) as HTMLElement[]) {
    const visual = preserveVisualMarks && visuallyMarked.has(card)
    const watched = visual || cardTrackKeys(card).some((key) => watchedIds.has(key.toUpperCase()))
    card.classList.toggle('umm-viewed', watched)
    if (!watched) visuallyMarked.delete(card)
  }
}

/**
 * 点击跳转即 dimmer（**仅页面状态，不落库**）。
 *
 * 适用面见 shouldDimOnNavigate：只提取到 TID 的条目，或详情子请求已结束
 * 但仍无磁力的条目。这两类没有自然的「复制磁力」落库路径，用户会直接点进
 * 帖子；数据变更交给目标帖子页的静默记录（sehuatang-main.content 的
 * recordThreadVisit），此处只做视觉状态，避免冗余写入。
 *
 * 委托绑定在 grid 上（捕获所有异步回填的封面/标题）；只认两个「跳转」点击
 * 面：标题链接 与 封面图（磁力锚点不在此列，它走复制落库路径）。
 */
function initNavigateDimmer(grid: HTMLElement, headerRef: { current: HTMLElement | null }): void {
  // 幂等守卫（与 initImageReveal 同款）：同一 grid 重复初始化不叠加监听器。
  if (grid.getAttribute('data-umm-sht-dim') === '1') return
  grid.setAttribute('data-umm-sht-dim', '1')

  grid.addEventListener('click', (event) => {
    const target = event.target
    if (!(target instanceof Element)) return
    if (!target.closest('.umm-card-title a, .umm-card-image img')) return
    const card = target.closest('.umm-card') as HTMLElement | null
    if (!card || card.classList.contains('umm-viewed')) return
    const eligible = shouldDimOnNavigate({
      trackId: card.getAttribute('data-avid'),
      detailSettled: card.getAttribute(DETAIL_FLAG) === 'done',
      hasMagnet: card.querySelector('.umm-magnet-link') !== null,
    })
    if (!eligible) return
    // 同步落类（同一 tick，跳转前生效）；不做任何消息/DB 调用。
    if (dimCardsVisually([card]) > 0) {
      visuallyMarked.add(card)
      const header = headerRef.current
      if (header) updateHeaderInfo(header, grid)
    }
  })
}

/** 跨标签/面板写入同步：record 更新 → 重跑批量检查 → 类对齐 + 三段统计失效重取。
 *  更新与删除分开节流：删除必须走 preserveVisualMarks=false（见 applyWatchedClasses）。 */
function subscribeRecordUpdates(grid: HTMLElement, headerEl: HTMLElement): () => void {
  const runSync = (preserveVisualMarks: boolean) => {
    const cards = Array.from(grid.querySelectorAll('.umm-card[data-avid], .umm-card[data-tid]')) as HTMLElement[]
    const ids = cards.flatMap(cardTrackKeys)
    if (ids.length === 0) return
    void AdultAvStore.batchCheckExists(ids).then((watchedIds) => {
      applyWatchedClasses(grid, watchedIds, preserveVisualMarks)
      statsCache = null
      updateHeaderInfo(headerEl, grid)
    })
  }
  const syncUpdated = throttle(() => runSync(true), 300)
  const syncDeleted = throttle(() => runSync(false), 300)
  const offUpdated = onEvent('record:updated', syncUpdated)
  const offDeleted = onEvent('record:deleted', syncDeleted)
  return () => { offUpdated(); offDeleted() }
}

/** 解析原生帖子表全部行（覆盖层下的 light DOM；纯提取）。 */
function parseThreadList(): SehuatangThread[] {
  const threads: SehuatangThread[] = []
  for (const row of Array.from(document.querySelectorAll('tbody[id^="normalthread_"]'))) {
    const thread = parseThreadRow(row)
    if (thread) threads.push(thread)
  }
  return threads
}

/**
 * AJAX 静态地址分页（Discuz #autopbn）：URL 不变、新行追加到原表格。
 * 处理新行时复用初始进程语义：hide 启用 → 已看线程不渲染（隐藏策略正确
 * 作用于每次数据切换）；hide 关闭 → 已看加 dimmer 类。仅新卡入场动画。
 *
 * hide 状态**实时读取** grid 的 umm-sht-hide-viewed 类（菜单 toggle 是命令式
 * 即时生效），不能沿用挂载时读出的常量——否则运行时切 OFF 后追加的已看行
 * 仍会被隐藏，与「运行时只 dim 不隐藏」语义冲突。
 */
async function processNewThreads(rows: Element[], grid: HTMLElement, headerEl: HTMLElement, loader: DetailLoader): Promise<void> {
  const threads: SehuatangThread[] = []
  for (const row of rows) {
    const thread = parseThreadRow(row)
    if (thread) threads.push(thread)
  }
  if (threads.length === 0) return

  const hideViewed = grid.classList.contains('umm-sht-hide-viewed')
  const trackIds = collectThreadTrackKeys(threads)
  // batchCheckExists 内部吞异常（adult-av/index.ts），直接 await 即可。
  const watchedIds = trackIds.length > 0 ? await AdultAvStore.batchCheckExists(trackIds) : new Set<string>()

  let toRender: SehuatangThread[] = threads
  if (hideViewed) {
    const partitioned = partitionInitialVisible(threads, watchedIds)
    toRender = partitioned.visible
    hiddenAtMount += partitioned.hiddenCount
  }
  const newCards = mountCards(grid, toRender, loader)

  if (!hideViewed) {
    for (const card of newCards) {
      if (cardTrackKeys(card).some((key) => watchedIds.has(key.toUpperCase()))) card.classList.add('umm-viewed')
    }
  }

  runCardEntrance(grid, 45, true)
  updateHeaderInfo(headerEl, grid)
}

/**
 * 监听帖子表新增行（覆盖 #autopbn 自动翻页 / 任何 AJAX 分页），
 * throttle(250ms) 合并批量追加；既有行 ID 预先登记避免重复处理。
 */
function startPaginationSync(grid: HTMLElement, headerEl: HTMLElement, loader: DetailLoader): void {
  if (grid.getAttribute('data-umm-sht-paging') === '1') return
  const table = document.getElementById('threadlisttableid')
  if (!table) return
  grid.setAttribute('data-umm-sht-paging', '1')

  const processed = new Set<string>()
  for (const row of Array.from(table.querySelectorAll('tbody[id^="normalthread_"]'))) {
    if (row.id) processed.add(row.id)
  }

  const pendingRows: Element[] = []
  const flush = throttle(() => {
    if (pendingRows.length === 0) return
    const rows = pendingRows.splice(0)
    void processNewThreads(rows, grid, headerEl, loader)
  }, 250)

  const observer = new MutationObserver((mutations) => {
    for (const row of collectNewThreadRows(mutations, processed)) pendingRows.push(row)
    flush()
  })
  observer.observe(table, { childList: true, subtree: true })
  activePaginationObserver = observer
}

function buildHeader(shell: HTMLElement, grid: HTMLElement, loader: DetailLoader): HTMLElement {
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
    void (async () => {
      const cards = Array.from(grid.querySelectorAll('.umm-card:not(.umm-viewed)')) as HTMLElement[]
      if (cards.length === 0) return

      // 懒加载补抓：未载出磁力的卡片先并发补齐（同一缓存/队列通道），带进度。
      const pending = cards.filter((c) => !c.querySelector('.umm-magnet-link'))
      const baseLabel = t('Copy All Magnets')
      copyBtn.disabled = true
      copyBtn.setAttribute('data-umm-copying', '1')
      try {
        if (pending.length > 0) {
          let done = 0
          copyBtn.textContent = `⚡ ${baseLabel} (0/${pending.length})`
          await Promise.all(pending.map((card) => loader.loadNow(card).then(() => {
            done++
            copyBtn.textContent = `⚡ ${baseLabel} (${done}/${pending.length})`
          })))
        }
        const links = cards
          .map((c) => c.querySelector('.umm-magnet-link'))
          .filter((l): l is HTMLAnchorElement => l !== null)
        if (links.length > 0) {
          const magnets = links.map((l) => l.href).join('\r\n')
          navigator.clipboard.writeText(magnets).then(() => {
            // 复制反馈动效：全部复制按钮 pop + 计数 toast（仅复制成功时）。
            for (const link of links) {
              link.classList.add('umm-sht-copied')
              setTimeout(() => link.classList.remove('umm-sht-copied'), 650)
            }
            FloatingToast.success(t('Copy Done', { count: String(links.length) }))
          }).catch((error: unknown) => {
            console.warn('[UMM] Sehuatang clipboard write failed:', error)
          })
          // 统一标记路径：单次批量落库 + 类落下即 dimmer/统计即时刷新；失败 toast。
          const targetCards = links.map((l) => l.closest('.umm-card')).filter((c): c is HTMLElement => c !== null)
          markCardsViewed(
            targetCards, 'sehuatang', AdultAvStore,
            () => updateHeaderInfo(header, grid),
            (added, ids) => {
              bumpStats(ids)
              updateHeaderInfo(header, grid)
              console.log(`[UMM] saved watched ids (${added}):`, ids.join(', ') || '(none)')
            },
            (error) => { reportSaveFailure(String(error)); FloatingToast.error(t('Magnet Save Failed')) },
          )
        }
      } finally {
        copyBtn.removeAttribute('data-umm-copying')
        updateHeaderInfo(header, grid)
      }
    })()
  }
  actions.appendChild(copyBtn)

  const menuBtn = document.createElement('button')
  menuBtn.className = 'umm-sht-action'
  menuBtn.textContent = '☰'
  menuBtn.title = 'Menu'
  menuBtn.setAttribute('aria-haspopup', 'dialog')
  menuBtn.onclick = () => {
    const isHidden = () => grid.classList.contains('umm-sht-hide-viewed')
    const hideLabel = () => `${isHidden() ? '✓ ' : ''}${t('Hide Viewed')}`
    openSehuatangMenu(document, menuBtn, t('Menu Title'), [
      { label: t('Manual Add'), onClick: () => showManualAddPanel() },
      { label: t('Check Viewed Status'), onClick: () => showCheckViewedPanel() },
      {
        label: hideLabel(),
        onClick: () => {
          // 命令式显隐（非持久 CSS 规则）：ON 立即隐藏当前已看卡，OFF 复原；
          // 运行时标记「只 dim 不隐藏」语义不受影响。
          const nowHidden = !isHidden()
          setGridHideViewed(grid, nowHidden)
          settingsItems().sehuatangHideViewed.setValue(nowHidden).catch(() => {})
          // 隐藏切换后立即刷新本页已看/隐藏统计。
          updateHeaderInfo(header, grid)
        },
        refreshLabel: hideLabel,
        active: isHidden,
        keepOpen: true,
      },
    ])
  }
  actions.appendChild(menuBtn)

  header.appendChild(actions)
  shell.insertBefore(header, shell.firstChild)
  return header
}

/**
 * 释放页面级单例资源（重入清理 / 非法页兜底共用；幂等）。
 * 断连分页观察器、销毁详情加载器（含取消在途 fetch）、解除事件订阅。
 */
function releasePageResources(): void {
  activePaginationObserver?.disconnect()
  activePaginationObserver = null
  activeDetailLoader?.destroy()
  activeDetailLoader = null
  activeUnsubscribeEvents?.()
  activeUnsubscribeEvents = null
}

/**
 * overlay 编排入口（sehuatang-main.content 调用）。
 * 前置：早期入口已建 shadow host；本函数失败兜底 = dismiss 还原原页面。
 */
export async function runSehuatangOverlayApp(): Promise<void> {
  await initI18n()
  console.log('[UMM] Sehuatang overlay app activated')

  // Forumdisplay 列表页 DOM 守卫：帖子表格是唯一标记。早期入口仅凭 URL
  // 建壳；详情/搜索等 URL 形态已被 url.ts 排除，此处兜底 DOM 复核。
  const threadList = document.getElementById('threadlisttableid')
  const overlay = attachSehuatangOverlay()
  if (!threadList) {
    // 非法页兜底：连同上一轮遗留的观察器/加载器/订阅一起拆掉，不留悬挂资源。
    releasePageResources()
    overlay?.dismiss()
    return
  }
  if (!overlay) return

  // 上一页面遗留的保存失败诊断：立即呈现原因（跨页证据）。
  consumeSaveFailure()

  // 重入清理：断连旧观察器/加载器/订阅（幂等重挂载）。
  releasePageResources()

  // 页面生命周期状态重置。
  statsCache = null
  statsLoading = false
  hiddenAtMount = 0
  visuallyMarked = new WeakSet<HTMLElement>()

  // 隐藏已看设置读取与 UI 构建并行（storage 读不阻塞结构搭建）。
  const hideViewedPromise = settingsItems().sehuatangHideViewed.getValue().catch(() => false)

  // 原始帖子表隐藏（DOM 保留：AJAX 分页观察与发新帖 click() 转发依赖）。
  threadList.style.display = 'none'

  // overlay 内容根：壳（header + 网格）单帧挂载，替换 loading 骨架。
  // --list 修饰类：底部「灵动岛」浮岛仅列表页挂载，遮挡补偿 padding
  // （GRID_CSS 的 padding-bottom）只作用列表页，首页/搜索页不多留白。
  const shell = document.createElement('div')
  shell.className = 'umm-sht-shell umm-sht-shell--list'
  const grid = document.createElement('div')
  grid.className = 'umm-preview-grid'
  shell.appendChild(grid)

  // 封面模糊遮罩 + hover 揭示（防抖），事件委托覆盖异步加载的图片。
  initImageReveal(grid)

  // 详情懒加载器：IO 视口驱动 → 缓存 → fetch。headerRef 打破 loader（copy-all
  // 依赖）与 filler（磁力回调依赖 header）的循环：header 构建后回填引用。
  const headerRef: { current: HTMLElement | null } = { current: null }
  const loader = createDetailLoader(makeDetailFiller(grid, headerRef))
  activeDetailLoader = loader

  // 点击跳转即 dimmer（仅页面状态，不落库）——只对「无磁力可复制」的两类条目生效。
  initNavigateDimmer(grid, headerRef)

  const hideViewed = await hideViewedPromise

  const threads = parseThreadList()
  console.log(`[UMM] Found ${threads.length} threads`)

  // 已看批量检查与渲染并行扇出（首屏不被消息/DB 阻塞）。
  const trackIds = collectThreadTrackKeys(threads)
  const watchedPromise = trackIds.length > 0 ? AdultAvStore.batchCheckExists(trackIds) : Promise.resolve(new Set<string>())

  if (hideViewed) {
    grid.classList.add('umm-sht-hide-viewed')
    // 骨架先行：已看检查到达前不渲染真卡（已看条目零闪现）；
    // 检查完成后单帧换真卡（无入场中途 pop）。
    renderSkeleton(grid, threads.length)
    const headerEl = buildHeader(shell, grid, loader)
    headerRef.current = headerEl
    mountSehuatangControls(document, headerEl, { floatbarParent: shell })
    overlay.mountContent(shell)

    const watchedIds = await watchedPromise
    console.log(`[UMM] watched check: queried ${trackIds.length} → matched ${watchedIds.size}`)
    // 导航/重入致 grid 脱离文档 → 放弃本轮回填，避免对游离节点操作。
    if (!grid.isConnected) return
    const partitioned = partitionInitialVisible(threads, watchedIds)
    hiddenAtMount = partitioned.hiddenCount
    grid.replaceChildren()
    mountCards(grid, partitioned.visible, loader)
    runVisibleEntrance(grid, 45)
    updateHeaderInfo(headerEl, grid)
    startPaginationSync(grid, headerEl, loader)
    activeUnsubscribeEvents = subscribeRecordUpdates(grid, headerEl)
  } else {
    const headerEl = buildHeader(shell, grid, loader)
    headerRef.current = headerEl
    mountSehuatangControls(document, headerEl, { floatbarParent: shell })
    mountCards(grid, threads, loader)
    overlay.mountContent(shell)
    runVisibleEntrance(grid, 45)
    updateHeaderInfo(headerEl, grid)
    startPaginationSync(grid, headerEl, loader)
    activeUnsubscribeEvents = subscribeRecordUpdates(grid, headerEl)

    // hide OFF：真卡已渲染，已看检查到达后一次性批量加 dimmer 类。
    const watchedIds = await watchedPromise
    console.log(`[UMM] watched check: queried ${trackIds.length} → matched ${watchedIds.size}`)
    if (!grid.isConnected) return
    applyWatchedClasses(grid, watchedIds)
    updateHeaderInfo(headerEl, grid)
  }
}
