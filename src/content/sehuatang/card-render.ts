/**
 * 卡片渲染原语（自 app.ts 拆出，2026-09-25）。
 *
 * 只做「把线程数据变成我们自己的卡片 DOM」：真卡、骨架卡、以及卡片的跟踪键
 * 读取。三者都不触碰 app.ts 的页面级单例状态，故可独立以 JSDOM 测试
 * （原先嵌在 678 行编排模块内，无法单独覆盖）。
 *
 * 卡片 DOM 契约（dimmer / 隐藏 / 已看标记全依赖这些属性，勿改）：
 *   - `data-avid` = trackId（番号优先，提取失败回退 `TID-<tid>`）
 *   - `data-tid`  = 帖子 tid（兜底键；双键任一命中即已看，ADR-024）
 *   - `data-title` / `data-url` = 复制与落库用
 */

import { escapeHtml } from '@/utils/escape-html'
import type { SehuatangThread } from '@/entrypoints/content/handlers/sehuatang-extract'

export function buildCard(info: SehuatangThread): HTMLElement {
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
export function renderSkeleton(grid: HTMLElement, count: number): void {
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

/** 卡片候选判定键（data-avid 主键 + data-tid 兜底键）——非空即纳入。 */
export function cardTrackKeys(card: HTMLElement): string[] {
  return [card.getAttribute('data-avid'), card.getAttribute('data-tid')]
    .filter((key): key is string => key !== null && key !== '')
}
