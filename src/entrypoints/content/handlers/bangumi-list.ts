/**
 * Bangumi (bgm.tv / bangumi.tv / chii.in) 浏览列表页处理器。
 *
 * 仅注入 /(anime|book|music|game)/browser 列表页（路由层已按 URL 过滤，
 * 此处 waitForElement 亦确认 ul.browserFull.browser-list 存在）。
 * 页面服务端静态渲染，无 MutationObserver。
 *
 * 流程：一次性读取本地 bangumi_records（{type}::{providerId} → status + rating），
 * 为每个 li#item_{subjectId} 卡片注入 umm-list-status 标记（已标记的跳过），
 * 全部状态全覆盖：1=想看 2=已看 3=在看 0/无记录=未看；
 * /music/browser 列表按“听”语义显示（想听/已听/在听/未听）。
 * 标记样式由全局样式系统（#umm-global-styles，global.ts 的 LIST_STATUS_STYLES）驱动：
 * .umm-list-status[data-status=...] 使用语义色 token（与详情页状态标签一致），
 * 暗色主题自动适配；已评分条目附带 .umm-rating 评分徽章（如 "8.5/10"）。
 */

import { STORE_NAMES } from '@/features/database/models'
import { dbGetAll, dbGetBulk } from '@/features/database/api'
import { t, initI18n } from '../i18n'
import { waitForElement } from '../utils/dom'
import {
  extractListItemId,
  extractBrowserPathType,
  extractProviderIdFromKey,
  bangumiListMarkerSpec,
  bangumiListRatingText,
  bangumiTypePrefix,
} from './bangumi-list-extract'

const LIST_SELECTOR = 'ul.browserFull.browser-list'
// 幂等标识属性：与语义色属性 data-status 分离（全局样式选择器只认 data-status，
// 见 global.ts LIST_STATUS_STYLES；data-umm-list-status 仅为标记存在性判断）。
const MARKER_ATTR = 'data-umm-list-status'

/**
 * 构建状态标记。规格（labelKey + statusAttr）由 bangumiListMarkerSpec 统一定义：
 * status 0/1/2/3 → 未看/想看/已看/在看，其余回退未看；
 * mediaType === 'music' 时改用音乐语义（未听/想听/已听/在听）。
 * data-status 承载语义值（驱动全局语义色），data-umm-list-status="1" 承担幂等标识。
 * 已评分（rating > 0）条目附带 .umm-rating 评分徽章；
 * 全部文本经 textContent 写入（XSS 安全，与 createStatusChip 转义思路一致）。
 */
function createListMarker(status: number, rating: number, mediaType?: string): HTMLElement {
  const spec = bangumiListMarkerSpec(status, mediaType)
  const marker = document.createElement('span')
  marker.className = 'umm-list-status'
  marker.dataset.ummListStatus = '1'
  marker.dataset.status = spec.statusAttr

  const label = document.createElement('span')
  label.textContent = t(spec.labelKey)
  marker.appendChild(label)

  const ratingText = bangumiListRatingText(rating)
  if (ratingText) {
    const ratingSpan = document.createElement('span')
    ratingSpan.className = 'umm-rating'
    ratingSpan.textContent = ratingText
    marker.appendChild(ratingSpan)
  }

  return marker
}

/**
 * 为单个卡片注入状态标记（已标记的卡片跳过）。
 * 主锚点：卡片 .inner 末尾；兜底：li 末尾。
 */
function markCard(li: HTMLElement, status: number, rating: number, mediaType?: string): void {
  if (li.querySelector(`[${MARKER_ATTR}]`)) return

  const marker = createListMarker(status, rating, mediaType)
  const inner = li.querySelector<HTMLElement>('.inner')
  if (inner) {
    inner.insertAdjacentElement('beforeend', marker)
  } else {
    li.appendChild(marker)
  }
}

/**
 * Bangumi 浏览列表页入口（供 router 调用）。
 * 路由层已按 URL 过滤，handler 无需 identity。
 */
export async function handleBangumiListPage(): Promise<void> {
  await initI18n()
  console.log('[UMM] Bangumi list handler activated')

  // 页面服务端静态渲染；超时异常由 router 统一捕获记录
  await waitForElement(LIST_SELECTOR)

  // 浏览列表类型（anime/book/music/game）：music 列表的状态标记用“听”语义文案
  const mediaType = extractBrowserPathType(window.location.pathname)

  // 只读可见条目的 store keys（{type}::{subjectId}），而非全表扫描；
  // 空 key 集（无卡片 / 未知类型）回退全表拉取，保证标记永不静默消失。
  const items = document.querySelectorAll<HTMLElement>(`${LIST_SELECTOR} li.item`)
  const prefix = bangumiTypePrefix(mediaType)
  const keys = prefix === null
    ? []
    : [...items]
        .map((li) => {
          const subjectId = extractListItemId(li.id)
          return subjectId !== null ? `${prefix}::${subjectId}` : null
        })
        .filter((key): key is string => key !== null)

  // 定向读取可见条目记录 → Map<providerId, { status, rating }>
  const entries = keys.length > 0
    ? await dbGetBulk(STORE_NAMES.BANGUMI, keys)
    : await dbGetAll(STORE_NAMES.BANGUMI)
  const statusMap = new Map<string, { status: number; rating: number }>()
  for (const { key, record } of entries) {
    const providerId = extractProviderIdFromKey(key)
    if (providerId !== null) {
      statusMap.set(providerId, { status: record.status, rating: record.rating ?? 0 })
    }
  }

  let marked = 0
  for (const li of items) {
    const subjectId = extractListItemId(li.id)
    if (subjectId === null) continue
    // 全状态注入：无本地记录或 status 0 均按 未看 标记
    const entry = statusMap.get(subjectId)
    const status = entry?.status ?? 0
    const rating = entry?.rating ?? 0
    markCard(li, status, rating, mediaType ?? undefined)
    marked++
  }

  console.log(`[UMM] Bangumi list: ${items.length} cards, ${marked} marked`)
}
