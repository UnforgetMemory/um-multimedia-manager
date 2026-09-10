/**
 * 色花堂 Shadow DOM overlay 接管（非 Vue，douban mount-app 的轻量等价物）。
 *
 * 职责：
 *   1. 接管 document_start 早期入口已创建的 shadow host（样式注入 + 主题类同步）；
 *   2. mountContent —— 移除 loading 骨架并挂载真实内容根；
 *   3. dismiss —— DOM 守卫失败兜底：移除 overlay 与页面锁样式，还原原页面。
 *
 * 主题类：早期入口的 startThemeSync 只维护 host[data-theme]；本模块经
 * MutationObserver 把 data-theme 镜像为 umm-theme--* 类（:host(.umm-theme--dark)
 * 是 shadow 样式表的双主题开关）。
 */

import { SEHUATANG_OVERLAY_CSS } from './styles'
import { SEHUATANG_OVERLAY_ID } from './constants'

export { SEHUATANG_OVERLAY_ID } from './constants'

export interface SehuatangOverlayHandle {
  host: HTMLElement
  shadow: ShadowRoot
  /** 移除 loading 骨架并挂载真实内容根（幂等：重复调用替换内容）。 */
  mountContent(root: HTMLElement): void
  /** 兜底拆除：移除 overlay + 页面锁样式（body 滚动锁随样式移除解除）。 */
  dismiss(): void
}

/** 注入样式表的标记属性：重入时按此清理，避免样式表叠加。 */
const STYLE_ATTR = 'data-umm-sht-style'

/** 上一次挂载的资源句柄（幂等清理：重入/HMR 不叠加样式表与主题观察器）。 */
let activeThemeObserver: MutationObserver | null = null
let activeContentRoot: HTMLElement | null = null

export function attachSehuatangOverlay(): SehuatangOverlayHandle | null {
  const host = document.getElementById(SEHUATANG_OVERLAY_ID)
  if (!host?.shadowRoot) return null
  const shadow = host.shadowRoot

  // 幂等清理上一轮挂载遗留（重入场景：软导航 / dev 重载）。
  activeThemeObserver?.disconnect()
  activeThemeObserver = null
  activeContentRoot?.remove()
  activeContentRoot = null
  shadow.querySelectorAll(`style[${STYLE_ATTR}]`).forEach((el) => el.remove())

  const style = document.createElement('style')
  style.setAttribute(STYLE_ATTR, '')
  style.textContent = SEHUATANG_OVERLAY_CSS
  shadow.appendChild(style)

  const syncThemeClass = () => {
    const theme = host.getAttribute('data-theme') ||
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    host.classList.remove('umm-theme--light', 'umm-theme--dark')
    host.classList.add(`umm-theme--${theme}`)
  }
  syncThemeClass()
  const themeObserver = new MutationObserver(syncThemeClass)
  themeObserver.observe(host, { attributes: true, attributeFilter: ['data-theme'] })
  activeThemeObserver = themeObserver

  let contentRoot: HTMLElement | null = null

  return {
    host,
    shadow,
    mountContent(root: HTMLElement) {
      shadow.querySelector('.ov-loading')?.remove()
      contentRoot?.remove()
      activeContentRoot?.remove()
      contentRoot = root
      activeContentRoot = root
      shadow.appendChild(root)
    },
    dismiss() {
      themeObserver.disconnect()
      if (activeThemeObserver === themeObserver) activeThemeObserver = null
      if (activeContentRoot === contentRoot) activeContentRoot = null
      host.remove()
      document.getElementById(`${SEHUATANG_OVERLAY_ID}-page-style`)?.remove()
    },
  }
}
