/**
 * 色花堂 ☰ 菜单对话框（居中模态，令牌化，焦点陷阱）。
 *
 * 从 sehuatang-controls.ts 拆出（上帝模块瘦身）：菜单接口/样式/编排全部
 * 归本模块，header 操作按钮的接线方（sehuatang.ts）直接 import。
 */

export interface SehuatangMenuAction {
  label: string
  onClick: () => void
  /** toggle 项：点击后刷新文案（如「隐藏已看 → ✓ 隐藏已看」） */
  refreshLabel?: () => string
  /** 激活态提供者（打开时与点击后刷新） */
  active?: () => boolean
  /** toggle 项点击后不关闭菜单，仅刷新状态 */
  keepOpen?: boolean
}

const MENU_OVERLAY_ID = 'umm-sht-menu-overlay'
const MENU_STYLE_ID = 'umm-sht-menu-styles'
let activeMenuCleanup: (() => void) | null = null

function el(doc: Document, tag: string, className: string, text?: string): HTMLElement {
  const node = doc.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function injectMenuStyles(doc: Document): void {
  if (doc.getElementById(MENU_STYLE_ID)) return
  const style = doc.createElement('style')
  style.id = MENU_STYLE_ID
  style.textContent = `
.umm-sht-menu-panel { background: var(--usl-surface-raised); border-color: var(--usl-border); color: var(--usl-text-primary); transition: background-color 0.3s ease, border-color 0.3s ease, color 0.3s ease; }
.umm-sht-menu-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-bottom: 10px; border-bottom: 1px solid var(--usl-border); transition: border-color 0.3s ease; }
.umm-sht-menu-title { margin: 0; font-size: clamp(0.9rem, 0.85rem + 0.2vw, 1rem); font-weight: 600; color: var(--usl-text-primary); }
.umm-sht-menu-close { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 8px; background: none; border: none; color: var(--usl-text-muted); font-size: 18px; cursor: pointer; line-height: 1; flex-shrink: 0; transition: background-color 0.15s ease, color 0.15s ease; }
.umm-sht-menu-close:hover, .umm-sht-menu-close:focus-visible { background: var(--usl-surface-hover); color: var(--usl-text-primary); outline: none; }
.umm-sht-menu-item { display: flex; align-items: center; gap: 8px; width: 100%; padding: 11px 14px; border-radius: 8px; border: 1px solid var(--usl-border-strong); background: var(--usl-surface); color: var(--usl-text-primary); font-size: clamp(0.8rem, 0.75rem + 0.25vw, 0.9375rem); cursor: pointer; text-align: left; transition: border-color 0.15s ease, background-color 0.15s ease, color 0.15s ease; }
.umm-sht-menu-item:hover, .umm-sht-menu-item:focus-visible { border-color: var(--usl-accent); outline: none; }
.umm-sht-menu-item--active { border-color: var(--usl-accent); background: var(--usl-surface-hover); }
`
  doc.head.appendChild(style)
}

/**
 * 打开 ☰ 菜单对话框：居中 overlay + 规范 header（标题 + 32px close icon
 * button）+ 令牌化菜单项列表。
 * 关闭路径：菜单项点击（toggle 项除外）/ 外部点击 / Escape / × 按钮；
 * 关闭后焦点归还 anchor；Tab/Shift+Tab 在面板内循环（焦点陷阱）。
 * 重复打开时先销毁旧实例（幂等单例）。
 */
export function openSehuatangMenu(doc: Document, anchor: HTMLElement, title: string, actions: SehuatangMenuAction[]): void {
  injectMenuStyles(doc)
  activeMenuCleanup?.()
  activeMenuCleanup = null

  const overlay = doc.createElement('div')
  overlay.id = MENU_OVERLAY_ID
  overlay.className = 'umm-overlay'

  const panel = doc.createElement('div')
  panel.className = 'umm-panel umm-sht-menu-panel'
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-modal', 'true')
  panel.style.cssText = 'padding:16px;width:min(320px,90vw);display:flex;flex-direction:column;gap:12px'

  const headerRow = el(doc, 'div', 'umm-sht-menu-header')
  headerRow.appendChild(el(doc, 'h3', 'umm-sht-menu-title', title))
  const closeBtn = doc.createElement('button')
  closeBtn.type = 'button'
  closeBtn.className = 'umm-sht-menu-close'
  closeBtn.textContent = '×'
  closeBtn.setAttribute('aria-label', 'Close')
  headerRow.appendChild(closeBtn)
  panel.appendChild(headerRow)

  const refreshItem = (btn: HTMLButtonElement, action: SehuatangMenuAction) => {
    if (action.refreshLabel) btn.textContent = action.refreshLabel()
    btn.classList.toggle('umm-sht-menu-item--active', action.active?.() ?? false)
  }

  const itemButtons: HTMLButtonElement[] = []
  for (const action of actions) {
    const btn = doc.createElement('button')
    btn.type = 'button'
    btn.className = 'umm-sht-menu-item'
    btn.textContent = action.label
    btn.classList.toggle('umm-sht-menu-item--active', action.active?.() ?? false)
    btn.addEventListener('click', () => {
      action.onClick()
      refreshItem(btn, action)
      if (!action.keepOpen) cleanup()
    })
    panel.appendChild(btn)
    itemButtons.push(btn)
  }

  overlay.appendChild(panel)
  doc.body.appendChild(overlay)

  const cleanup = () => {
    doc.removeEventListener('keydown', onKeydown, true)
    doc.removeEventListener('pointerdown', onPointerDown, true)
    overlay.remove()
    if (activeMenuCleanup === cleanup) activeMenuCleanup = null
    anchor.focus()
  }
  const onKeydown = (e: Event) => {
    const key = (e as KeyboardEvent).key
    if (key === 'Escape') {
      e.stopPropagation()
      cleanup()
      return
    }
    // 焦点陷阱：Tab/Shift+Tab 在面板可聚焦元素间循环，不逃逸到背景页面。
    if (key === 'Tab') {
      const focusables = Array.from(panel.querySelectorAll<HTMLElement>('button, [href], input, select, textarea'))
      if (focusables.length === 0) return
      const first = focusables[0]!
      const last = focusables[focusables.length - 1]!
      const active = doc.activeElement as HTMLElement | null
      if ((e as KeyboardEvent).shiftKey) {
        if (active === first || !panel.contains(active)) {
          e.preventDefault()
          last.focus()
        }
      } else if (active === last || !panel.contains(active)) {
        e.preventDefault()
        first.focus()
      }
    }
  }
  const onPointerDown = (e: Event) => {
    if (!panel.contains(e.target as Node)) cleanup()
  }

  doc.addEventListener('keydown', onKeydown, true)
  doc.addEventListener('pointerdown', onPointerDown, true)
  closeBtn.addEventListener('click', cleanup)

  activeMenuCleanup = cleanup
  ;(itemButtons[0] ?? closeBtn).focus()
}
