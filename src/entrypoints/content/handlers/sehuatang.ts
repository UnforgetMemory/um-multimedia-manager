/**
 * 色花堂论坛列表页处理器
 * 功能：替换原始帖子列表为卡片网格预览，支持磁力一键复制
 */

import { AdultAvStore } from '@/features/adult-av'
import { settingsItems } from '@/features/settings/items'
import { isTidTrackKey } from '@/features/adult-av/models'
import { t, initI18n } from '../i18n'
import { showManualAddPanel } from '../ui/manual-add-panel'
import { showCheckViewedPanel } from '../ui/check-viewed-panel'
import { escapeHtml } from '@/utils/escape-html'
import { throttle } from '@/utils'
import { RequestQueue } from '@/utils/requestQueue'
import { FloatingToast } from '@/entrypoints/content/utils/toast'
import { mountSehuatangControls, countSehuatangCardStates, markCardsViewed } from './sehuatang-controls'
import { openSehuatangMenu } from './sehuatang-menu'
import { initImageReveal, runCardEntrance } from './sehuatang-effects'
import { partitionInitialVisible, parseThreadRow, collectNewThreadRows, type SehuatangThread } from './sehuatang-extract'

// 页面生命周期状态：每次 handler 运行重置（SPA 重入安全）。
let totalTasks = 0
let finishedTasks = 0
// 历史总数缓存：避免每卡/每次刷新都全量读 jav_ids（2N 次消息 → 1 次）。
let historyTotalCache: number | null = null
let historyTotalLoading = false
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

// 分页观察器（页面级单例）：SPA 重入时先断连旧实例，防止监听累积。
let activePaginationObserver: MutationObserver | null = null

/** 统计刷新（节流 trailing 250ms，合并高频触发；历史数走缓存）。 */
const throttledRefreshStats = throttle((headerEl: HTMLElement) => {
  refreshHeaderStats(headerEl)
}, 250)

function refreshHeaderStats(headerEl: HTMLElement) {
  const infoEl = headerEl.querySelector('.umm-header-info') as HTMLElement | null
  if (!infoEl) return
  const grid = document.querySelector('.umm-preview-grid') as HTMLElement | null
  const { watched } = countSehuatangCardStates(grid)
  const render = () => {
    infoEl.textContent = t('Header Info', {
      watched: String(watched),
      hidden: String(hiddenAtMount),
      total: String(historyTotalCache ?? 0),
    })
  }
  render()
  if (historyTotalCache === null && !historyTotalLoading) {
    historyTotalLoading = true
    AdultAvStore.getAll().then((items: unknown[]) => {
      historyTotalCache = items.length
      render()
    }).catch(() => { /* 降级：保持缓存空值，下次重试 */ }).finally(() => { historyTotalLoading = false })
  }
}

/** 本地标记已看后：历史总数缓存增量修正（不等下一次全量读）。 */
function bumpHistoryCache(delta: number): void {
  if (historyTotalCache !== null) historyTotalCache += delta
}

function updateHeaderInfo(headerEl: HTMLElement) {
  throttledRefreshStats(headerEl)
  const btnEl = headerEl.querySelector('.umm-copy-btn') as HTMLButtonElement | null
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

function createCard(info: SehuatangThread, container: HTMLElement, headerEl: HTMLElement) {
  const card = document.createElement('div')
  card.className = 'umm-card'
  if (info.trackId) card.setAttribute('data-avid', info.trackId)
  card.setAttribute('data-title', info.title)
  card.setAttribute('data-url', info.url)

  card.innerHTML = `
    <div class="umm-card-image"></div>
    <div class="umm-card-content">
      <h3 class="umm-card-title"><a href="${escapeHtml(info.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(info.title)}</a></h3>
      <p class="umm-card-meta">${escapeHtml(info.releaseDate)}</p>
      <div class="umm-card-links"></div>
    </div>
  `
  container.appendChild(card)

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
      // 协议白名单：磁力链接来自站点详情页文本，仍按不可信输入防御——
      // 仅 magnet:/http(s): 可作 href 导航；非法则不设 href（锚点不可导航）。
      const safeHref = /^(magnet:|https?:)/i.test(magnetLink.trim())
      const a = document.createElement('a')
      if (safeHref) a.href = magnetLink
      a.className = 'umm-magnet-link'
      a.textContent = '⚡'
      a.title = 'Copy Magnet'
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
        markCardsViewed(
          [card], 'sehuatang', AdultAvStore,
          () => updateHeaderInfo(headerEl),
          (added, ids) => {
            bumpHistoryCache(countRealIds(ids))
            updateHeaderInfo(headerEl)
            console.log(`[UMM] saved watched ids (${added}):`, ids.join(', ') || '(none)')
          },
          (error) => { reportSaveFailure(String(error)); FloatingToast.error(t('Magnet Save Failed')) },
        )
      }
      card.querySelector('.umm-card-links')?.appendChild(a)
    }
  }).catch(console.error).finally(() => {
    // 卡片已被重入清理摘除时跳过计数（在途抓取不污染新页状态）。
    if (card.isConnected) {
      finishedTasks++
      updateHeaderInfo(headerEl)
    }
  })
}

/** 真实番号计数（排除 TID 兜底键）——「历史总阅」语义 = 真实番号数，
 * 与 GET_ALL 的 isTidTrackKey 过滤对齐（adult-av.ts）。 */
function countRealIds(ids: string[]): number {
  return ids.filter((id) => !isTidTrackKey(`sehuatang::${id}`)).length
}

// 详情页抓取并发限流：N 帖 = N 请求的 N+1 风暴收敛到并发 4 + 8s 超时。
const detailQueue = new RequestQueue({ maxConcurrent: 4, minDelayMs: 0, maxDelayMs: 0 })

async function fetchDetailPage(url: string): Promise<{ imageUrl: string | null; magnetLink: string | null }> {
  return detailQueue.enqueue(url, async () => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    try {
      const res = await fetch(url, { credentials: 'include', signal: controller.signal })
      const html = await res.text()
      const doc = new DOMParser().parseFromString(html, 'text/html')

      const imgEl = doc.querySelector('ignore_js_op > img')
      const imageUrl = imgEl?.getAttribute('zoomfile') || imgEl?.getAttribute('file') || null

      const magnetEl = doc.querySelector('.blockcode > div > ol > li')
      const magnetLink = magnetEl?.textContent?.trim() || null

      return { imageUrl, magnetLink }
    } catch {
      return { imageUrl: null, magnetLink: null }
    } finally {
      clearTimeout(timer)
    }
  })
}

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
 */
async function processNewThreads(rows: Element[], container: HTMLElement, headerEl: HTMLElement, hideViewed: boolean): Promise<void> {
  const threads: SehuatangThread[] = []
  for (const row of rows) {
    const thread = parseThreadRow(row)
    if (thread) threads.push(thread)
  }
  if (threads.length === 0) return

  const trackIds = threads.map((t) => t.trackId).filter((id): id is string => id !== null)
  // batchCheckExists 内部吞异常（adult-av/index.ts），直接 await 即可。
  const watchedIds = trackIds.length > 0 ? await AdultAvStore.batchCheckExists(trackIds) : new Set<string>()

  let toRender: SehuatangThread[] = threads
  if (hideViewed) {
    const partitioned = partitionInitialVisible(threads, watchedIds)
    toRender = partitioned.visible
    hiddenAtMount += partitioned.hiddenCount
  }
  for (const thread of toRender) {
    createCard(thread, container, headerEl)
  }

  if (!hideViewed) {
    for (const card of Array.from(container.querySelectorAll('.umm-card[data-avid]'))) {
      const avid = card.getAttribute('data-avid')!
      if (watchedIds.has(avid.toUpperCase())) card.classList.add('umm-viewed')
    }
  }

  runCardEntrance(container, 45, true)
  updateHeaderInfo(headerEl)
}

/**
 * 监听帖子表新增行（覆盖 #autopbn 自动翻页 / 任何 AJAX 分页），
 * throttle(250ms) 合并批量追加；既有行 ID 预先登记避免重复处理。
 */
function startPaginationSync(container: HTMLElement, headerEl: HTMLElement, hideViewed: boolean): void {
  if (container.getAttribute('data-umm-sht-paging') === '1') return
  const table = document.getElementById('threadlisttableid')
  if (!table) return
  container.setAttribute('data-umm-sht-paging', '1')

  const processed = new Set<string>()
  for (const row of Array.from(table.querySelectorAll('tbody[id^="normalthread_"]'))) {
    if (row.id) processed.add(row.id)
  }

  const pendingRows: Element[] = []
  const flush = throttle(() => {
    if (pendingRows.length === 0) return
    const rows = pendingRows.splice(0)
    void processNewThreads(rows, container, headerEl, hideViewed)
  }, 250)

  const observer = new MutationObserver((mutations) => {
    for (const row of collectNewThreadRows(mutations, processed)) pendingRows.push(row)
    flush()
  })
  observer.observe(table, { childList: true, subtree: true })
  activePaginationObserver = observer
}

function injectStyles() {
  if (document.getElementById('umm-sehuatang-styles')) return

  const style = document.createElement('style')
  style.id = 'umm-sehuatang-styles'
  // 卡片网格层样式：颜色全部消费 global.ts 注入的 --usl-* 令牌（双主题由
  // html[data-umm-theme] 翻转），间距/字号 clamp 自适应。header/pager 等控件
  // 样式归 sehuatang-controls.ts（单一所有者，避免跨文件同元素样式漂移）。
  style.textContent = `
    .umm-sht-shell { display: flex; flex-direction: column; background: var(--usl-surface); border-bottom: 1px solid var(--usl-border); box-shadow: 0 12px 32px rgba(0,0,0,0.18); transition: background-color 0.3s ease, border-color 0.3s ease; }
    .umm-preview-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr)); gap: clamp(14px, 2vw, 25px); padding: clamp(14px, 2.5vw, 28px); background: var(--usl-surface); transition: background-color 0.3s ease; }
    .umm-card { background: var(--usl-surface-raised); border-radius: 12px; border: 1px solid var(--usl-border); overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 4px 15px rgba(0,0,0,0.25); transition: transform 0.3s ease, box-shadow 0.3s ease, background-color 0.3s ease, border-color 0.3s ease; }
    .umm-card:hover { transform: translateY(-4px); box-shadow: 0 10px 24px rgba(0,0,0,0.32); }
    .umm-card.umm-viewed { opacity: 0.5; transition: opacity 0.3s ease; }
    .umm-card.umm-viewed:hover { opacity: 1; }
    .umm-card-image { aspect-ratio: 16/10; background: var(--usl-surface-hover); overflow: hidden; }
    /* 布局归 sehuatang.ts；filter/transform/transition 单一所有者 =
       sehuatang-effects.ts（含揭示与已看灰度），此处不重复声明。 */
    .umm-card-image img { width: 100%; height: 100%; object-fit: cover; cursor: pointer; }
    .umm-card-content { padding: clamp(10px, 1.4vw, 15px); display: flex; flex-direction: column; flex-grow: 1; gap: 4px; }
    .umm-card-title a { color: var(--usl-text-primary); text-decoration: none; font-size: clamp(0.95rem, 0.85rem + 0.35vw, 1.05rem); font-weight: 600; transition: color 0.15s ease; }
    .umm-card-title a:hover { color: var(--usl-accent); }
    .umm-card-meta { color: var(--usl-text-muted); font-size: clamp(0.72rem, 0.68rem + 0.2vw, 0.8rem); }
    .umm-card-links { margin-top: auto; display: flex; justify-content: flex-end; gap: 15px; padding-top: 10px; }
    .umm-magnet-link { font-size: 1.5rem; padding: 6px 12px; border-radius: 8px; text-decoration: none; background: var(--usl-fill-wish); color: var(--usl-ink-wish); border: 1px solid var(--usl-border-wish); transition: opacity 0.15s ease; }
    .umm-magnet-link:hover { opacity: 0.9; }
    .umm-magnet-link.umm-sht-copied { animation: umm-sht-copied-pop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1); }
    @keyframes umm-sht-copied-pop { 0% { transform: scale(1); } 40% { transform: scale(1.28); filter: brightness(1.35); } 100% { transform: scale(1); } }
  `
  document.head.appendChild(style)
}

function injectHeader(shell: HTMLElement): HTMLElement {
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
      const cards = links.map(l => l.closest('.umm-card')).filter((c): c is HTMLElement => c !== null)
      markCardsViewed(
        cards, 'sehuatang', AdultAvStore,
        () => updateHeaderInfo(header),
        (added, ids) => {
          bumpHistoryCache(countRealIds(ids))
          updateHeaderInfo(header)
          console.log(`[UMM] saved watched ids (${added}):`, ids.join(', ') || '(none)')
        },
        (error) => { reportSaveFailure(String(error)); FloatingToast.error(t('Magnet Save Failed')) },
      )
    }
  }
  actions.appendChild(copyBtn)

  const menuBtn = document.createElement('button')
  menuBtn.className = 'umm-sht-action'
  menuBtn.textContent = '☰'
  menuBtn.title = 'Menu'
  menuBtn.setAttribute('aria-haspopup', 'dialog')
  menuBtn.onclick = () => {
    const grid = () => document.querySelector('.umm-preview-grid') as HTMLElement | null
    const isHidden = () => grid()?.classList.contains('umm-sht-hide-viewed') ?? false
    const hideLabel = () => `${isHidden() ? '✓ ' : ''}${t('Hide Viewed')}`
    openSehuatangMenu(document, menuBtn, t('Menu Title'), [
      { label: t('Manual Add'), onClick: () => showManualAddPanel() },
      { label: t('Check Viewed Status'), onClick: () => showCheckViewedPanel() },
      {
        label: hideLabel(),
        onClick: () => {
          const g = grid()
          g?.classList.toggle('umm-sht-hide-viewed')
          settingsItems().sehuatangHideViewed.setValue(g?.classList.contains('umm-sht-hide-viewed') ?? false).catch(() => {})
          // 隐藏切换后立即刷新本页已看/隐藏统计。
          const hdr = document.querySelector('.umm-sehuatang-header') as HTMLElement | null
          if (hdr) updateHeaderInfo(hdr)
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

export async function handleSehuatangListPage(): Promise<void> {
  await initI18n()
  console.log('[UMM] Sehuatang handler activated')

  // Forumdisplay 列表页守卫：帖子表格是唯一标记。详情/搜索等同样命中
  // /forum 路由前缀的页面（forum.php?mod=viewthread 等）不得注入列表 UI。
  const threadList = document.getElementById('threadlisttableid')
  if (!threadList) return

  // 上一页面遗留的保存失败诊断：立即呈现原因（跨页证据）。
  consumeSaveFailure()

  // SPA 重入清理：断连旧分页观察器 + 移除旧 overlay 壳（幂等重挂载）。
  activePaginationObserver?.disconnect()
  activePaginationObserver = null
  document.querySelector('.umm-sht-shell')?.remove()

  // 页面生命周期状态重置（SPA 重入/路由重发安全）。
  totalTasks = 0
  finishedTasks = 0
  historyTotalCache = null
  historyTotalLoading = false
  hiddenAtMount = 0

  // 主题属性与首帧背景由 sehuatang-early.content（document_start）负责——
  // 主脚本挂载时 html[data-umm-theme] 与背景已是正确主题，无需再同步。
  injectStyles()

  threadList.style.display = 'none'

  // 统一 overlay 壳（参考 Douban create-overlay / video-overlay 模式）：
  // 表面背景 + 边界 + 阴影，header/网格全部收纳其中，站点原始内容之上
  // 形成完整应用层；浮层悬浮栏保持 fixed（壳无 transform，不建包含块）。
  const shell = document.createElement('div')
  shell.className = 'umm-sht-shell'
  document.body.prepend(shell)

  const container = document.createElement('div')
  container.className = 'umm-preview-grid'
  shell.appendChild(container)

  // 隐藏已看状态持久化（settings item，fallback=false）：页面重建时恢复，
  // 菜单切换时写回——刷新/重开页面后保持用户选择。
  const hideViewed = await settingsItems().sehuatangHideViewed.getValue().catch(() => false)
  if (hideViewed) container.classList.add('umm-sht-hide-viewed')

  // 封面模糊遮罩 + hover 揭示（防抖），事件委托覆盖异步加载的图片。
  initImageReveal(container)

  const headerEl = injectHeader(shell)

  // 重建原生控件（面包屑/选项卡/分页/返回/发新帖），原版隐藏。
  mountSehuatangControls(document, headerEl)

  const threads = parseThreadList()
  console.log(`[UMM] Found ${threads.length} threads`)

  // 初始进程已看判定：一次 ADULT_AV_CHECK_BATCH 消息
  // （batchCheckExists 内部吞异常，直接 await）。
  const trackIds = threads.map((t) => t.trackId).filter((id): id is string => id !== null)
  const watchedIds = trackIds.length > 0 ? await AdultAvStore.batchCheckExists(trackIds) : new Set<string>()
  console.log(`[UMM] watched check: queried ${trackIds.length} → matched ${watchedIds.size}:`, Array.from(watchedIds).slice(0, 12).join(', ') || '(none)')

  // 语义：初始进程（首次加载/分页切换）只隐藏；非初始进程（点击/复制磁力）
  // 只 dimmer。hide 启用时已看线程根本不渲染（无入场中途 pop）；hide 关闭时
  // 全部渲染、已看卡片加 dimmer 类。运行时的 markCardsViewed 只加类 → 只 dim。
  let toRender: SehuatangThread[] = threads
  if (hideViewed) {
    const partitioned = partitionInitialVisible(threads, watchedIds)
    toRender = partitioned.visible
    hiddenAtMount = partitioned.hiddenCount
  }

  toRender.forEach(info => {
    createCard(info, container, headerEl)
  })

  if (!hideViewed) {
    for (const card of Array.from(container.querySelectorAll('.umm-card[data-avid]'))) {
      const avid = card.getAttribute('data-avid')!
      if (watchedIds.has(avid.toUpperCase())) card.classList.add('umm-viewed')
    }
  }

  // 卡片入场级联动效（纯 CSS keyframes + 逐卡递增延迟）。
  runCardEntrance(container)

  updateHeaderInfo(headerEl)

  // AJAX 静态地址分页同步：URL 不变的数据切换同样触发隐藏策略/渲染。
  startPaginationSync(container, headerEl, hideViewed)
}
