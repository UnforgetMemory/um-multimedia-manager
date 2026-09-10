/**
 * 色花堂风控页（年龄门）overlay 编排。
 *
 * 接管链（双路）：
 *   a. URL 命中早期入口 matches（站点根 /forum /search.php /index.php）→
 *      early 已建 shadow host + loading 骨架 → attachSehuatangOverlay() 直接接管；
 *   b. 其余任意路径（thread / portal / misc 等）→ 无壳，经共享 createOverlay
 *      自建 host（page-lock CSS + spinner + startThemeSync 全套机制复用）。
 *
 * 功能保全（核心约束）：站点 mainv2.js 把 .enter-btn 的 click 绑定为
 * 「写 safeid cookie + 重载当前页」——这是通过风控的唯一途径。重建 UI
 * 只做视觉重建，按钮点击一律委托回原 DOM 按钮；原元素缺失才退化到
 * href 导航（站点声明的兜底链接，先绝对化再过 http(s) 白名单）。
 * 绝不自行复刻 cookie 逻辑（cookie 名被站点混淆，复刻必碎）。
 *
 * 读模式：不触已看库、无菜单/手动添加/查询面板（风控页无任何记录语义）；
 * 页面内容（域名 / 按钮文案 / 警告文本）全部透传站点原文，零 i18n 键。
 */

import { createOverlay } from '@/content/douban/overlay/create-overlay'
import {
  SEHUATANG_OVERLAY_ID,
  SEHUATANG_OVERLAY_Z_INDEX,
  LOADING_SUBTITLE,
  resolveEarlyLocale,
} from './constants'
import { attachSehuatangOverlay, type SehuatangOverlayHandle } from './overlay'
import { extractRiskGate } from './extract-risk'
import { toSafeAbsoluteUrl } from './url'

function el(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

/**
 * 自建 shadow host（无 early 壳的路径兜底）：共享 createOverlay 提供
 * page-lock + spinner + startThemeSync，attach 拿 handle 注入 overlay CSS。
 */
function createDetachedOverlay(): SehuatangOverlayHandle {
  createOverlay({
    overlayId: SEHUATANG_OVERLAY_ID,
    subtitle: LOADING_SUBTITLE[resolveEarlyLocale()],
    zIndex: SEHUATANG_OVERLAY_Z_INDEX,
  })
  const handle = attachSehuatangOverlay()
  if (!handle) throw new Error('[UMM] Sehuatang risk overlay host missing after create')
  return handle
}

/** 重建进入按钮：点击委托原 DOM 按钮（写 cookie + 重载），缺失退化 href 导航。 */
function buildEnterButton(label: string, index: number, fallbackHref: string): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = `umm-sht-risk-enter ${index === 0 ? 'umm-sht-risk-enter--primary' : 'umm-sht-risk-enter--secondary'}`
  btn.textContent = label
  btn.onclick = () => {
    const originals = document.querySelectorAll<HTMLAnchorElement>('a.enter-btn')
    const target = originals[index]
    if (target) {
      target.click()
      return
    }
    const href = toSafeAbsoluteUrl(fallbackHref)
    if (href) window.location.href = href
  }
  return btn
}

/**
 * 风控页 overlay 编排入口。
 * 早期入口已建壳则接管，否则自建；构建异常 → dismiss 还原原风控页。
 */
export async function runSehuatangRiskApp(): Promise<void> {
  console.log('[UMM] Sehuatang risk gate activated')

  const overlay = attachSehuatangOverlay() ?? createDetachedOverlay()
  try {
    const gate = extractRiskGate(document)
    // 进入按钮是风控页的核心功能；缺失 = DOM 漂移，重建无意义。
    if (!gate || gate.enters.length === 0) {
      overlay.dismiss()
      return
    }

    const shell = el('div', 'umm-sht-shell umm-sht-shell--risk')
    const panel = el('div', 'umm-sht-risk-panel')

    panel.appendChild(el('div', 'umm-sht-risk-domain', gate.domain))

    gate.enters.forEach((enter, index) => {
      panel.appendChild(buildEnterButton(enter.label, index, enter.href))
    })

    panel.appendChild(el('div', 'umm-sht-risk-line'))

    if (gate.warningTitle) panel.appendChild(el('h3', 'umm-sht-risk-warn-title', gate.warningTitle))
    for (const warning of gate.warnings) {
      panel.appendChild(el('p', 'umm-sht-risk-warn', warning))
    }

    shell.appendChild(panel)
    overlay.mountContent(shell)
    console.log(
      `[UMM] Sehuatang risk gate rendered: ${gate.enters.length} enter buttons, ${gate.warnings.length} warnings`,
    )
  } catch (error) {
    console.error('[UMM] Sehuatang risk gate build failed, dismissing overlay:', error)
    overlay.dismiss()
  }
}
