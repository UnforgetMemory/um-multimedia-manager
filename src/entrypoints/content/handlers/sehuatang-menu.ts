/**
 * 色花堂 ☰ 菜单对话框（居中模态，令牌化，焦点陷阱）。
 *
 * 从 sehuatang-controls.ts 拆出（上帝模块瘦身）：菜单接口/样式/编排全部
 * 归本模块，header 操作按钮的接线方（sehuatang.ts）直接 import。
 *
 * 焦点陷阱与 dialog ARIA 走 `libraries` 共享契约（与 umm-interest-bar /
 * doulist-dialog 同一实现）——overlay 组件库合并波的 DOM 契约层统一。
 */

import { applyDialogAria } from '@/libraries/ui-contracts/dialog-aria';
import { handleTrapTabKey, returnFocusIfLost } from '@/libraries/utils/focus-trap';

export interface SehuatangMenuAction {
  label: string;
  onClick: () => void;
  /** toggle 项：点击后刷新文案（如「隐藏已看 → ✓ 隐藏已看」） */
  refreshLabel?: () => string;
  /** 激活态提供者（打开时与点击后刷新） */
  active?: () => boolean;
  /** toggle 项点击后不关闭菜单，仅刷新状态 */
  keepOpen?: boolean;
}

const MENU_OVERLAY_ID = 'umm-sht-menu-overlay';
const MENU_STYLE_ID = 'umm-sht-menu-styles';
let activeMenuCleanup: (() => void) | null = null;

function el(doc: Document, tag: string, className: string, text?: string): HTMLElement {
  const node = doc.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function injectMenuStyles(doc: Document): void {
  if (doc.getElementById(MENU_STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = MENU_STYLE_ID;
  style.textContent = `
.umm-sht-menu-panel { background: var(--umm-surface-raised); border-color: var(--umm-overlay-border); color: var(--umm-overlay-text-primary); transition: background-color 0.3s ease, border-color 0.3s ease, color 0.3s ease; }
.umm-sht-menu-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-bottom: 10px; border-bottom: 1px solid var(--umm-overlay-border); transition: border-color 0.3s ease; }
.umm-sht-menu-title { margin: 0; font-size: clamp(0.9rem, 0.85rem + 0.2vw, 1rem); font-weight: 600; color: var(--umm-overlay-text-primary); }
.umm-sht-menu-close { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 8px; background: none; border: none; color: var(--umm-overlay-text-muted); font-size: 18px; cursor: pointer; line-height: 1; flex-shrink: 0; transition: background-color 0.15s ease, color 0.15s ease; }
.umm-sht-menu-close:hover, .umm-sht-menu-close:focus-visible { background: var(--umm-surface-hover); color: var(--umm-overlay-text-primary); outline: none; }
.umm-sht-menu-item { display: flex; align-items: center; gap: 8px; width: 100%; padding: 11px 14px; border-radius: 8px; border: 1px solid var(--umm-border-strong); background: var(--umm-surface); color: var(--umm-overlay-text-primary); font-size: clamp(0.8rem, 0.75rem + 0.25vw, 0.9375rem); cursor: pointer; text-align: left; transition: border-color 0.15s ease, background-color 0.15s ease, color 0.15s ease; }
.umm-sht-menu-item:hover, .umm-sht-menu-item:focus-visible { border-color: var(--umm-accent); outline: none; }
.umm-sht-menu-item--active { border-color: var(--umm-accent); background: var(--umm-surface-hover); }
`;
  doc.head.appendChild(style);
}

/**
 * 打开 ☰ 菜单对话框：居中 overlay + 规范 header（标题 + 32px close icon
 * button）+ 令牌化菜单项列表。
 * 关闭路径：菜单项点击（toggle 项除外）/ 外部点击 / Escape / × 按钮；
 * 关闭后焦点归还 anchor；Tab/Shift+Tab 在面板内循环（焦点陷阱）。
 * 重复打开时先销毁旧实例（幂等单例）。
 */
export function openSehuatangMenu(
  doc: Document,
  anchor: HTMLElement,
  title: string,
  actions: SehuatangMenuAction[],
): void {
  injectMenuStyles(doc);
  activeMenuCleanup?.();
  activeMenuCleanup = null;

  const overlay = doc.createElement('div');
  overlay.id = MENU_OVERLAY_ID;
  overlay.className = 'umm-overlay';

  const panel = doc.createElement('div');
  panel.className = 'umm-panel umm-sht-menu-panel';
  applyDialogAria(panel, { labelledBy: 'umm-sht-menu-title' });
  panel.style.cssText =
    'padding:16px;width:min(320px,90vw);display:flex;flex-direction:column;gap:12px';

  const headerRow = el(doc, 'div', 'umm-sht-menu-header');
  const titleEl = el(doc, 'h3', 'umm-sht-menu-title', title);
  titleEl.id = 'umm-sht-menu-title';
  headerRow.appendChild(titleEl);
  const closeBtn = doc.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'umm-sht-menu-close';
  closeBtn.textContent = '×';
  closeBtn.setAttribute('aria-label', 'Close');
  headerRow.appendChild(closeBtn);
  panel.appendChild(headerRow);

  const refreshItem = (btn: HTMLButtonElement, action: SehuatangMenuAction) => {
    if (action.refreshLabel) btn.textContent = action.refreshLabel();
    btn.classList.toggle('umm-sht-menu-item--active', action.active?.() ?? false);
  };

  const itemButtons: HTMLButtonElement[] = [];
  for (const action of actions) {
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'umm-sht-menu-item';
    btn.textContent = action.label;
    btn.classList.toggle('umm-sht-menu-item--active', action.active?.() ?? false);
    btn.addEventListener('click', () => {
      action.onClick();
      refreshItem(btn, action);
      if (!action.keepOpen) cleanup();
    });
    panel.appendChild(btn);
    itemButtons.push(btn);
  }

  overlay.appendChild(panel);
  doc.body.appendChild(overlay);

  const cleanup = () => {
    doc.removeEventListener('keydown', onKeydown, true);
    doc.removeEventListener('pointerdown', onPointerDown, true);
    overlay.remove();
    if (activeMenuCleanup === cleanup) activeMenuCleanup = null;
    returnFocusIfLost(anchor, doc);
  };
  const onKeydown = (e: Event) => {
    const key = (e as KeyboardEvent).key;
    if (key === 'Escape') {
      e.stopPropagation();
      cleanup();
      return;
    }
    handleTrapTabKey(e as KeyboardEvent, panel);
  };
  const onPointerDown = (e: Event) => {
    if (!panel.contains(e.target as Node)) cleanup();
  };

  doc.addEventListener('keydown', onKeydown, true);
  doc.addEventListener('pointerdown', onPointerDown, true);
  closeBtn.addEventListener('click', cleanup);

  activeMenuCleanup = cleanup;
  (itemButtons[0] ?? closeBtn).focus();
}
