/**
 * PT 模块通用工具函数
 */

/**
 * 暗化元素
 */
export function dimElement(element: HTMLElement): void {
  element.classList.add('umm-dimmed');
}

/**
 * Un-dim an element after a fresh "not watched" verdict (e.g. DB_DELETE).
 * Without this, dimElement's class would persist for the page lifetime —
 * no PT path removed it (defect D1). Contrast mukaku/refresh.ts.
 */
export function undimElement(element: HTMLElement): void {
  element.classList.remove('umm-dimmed');
}
