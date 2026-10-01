/**
 * Focus trap for modal dialogs — single source for the Tab/Shift+Tab cycle.
 *
 * WHY shared: the same ~20-line cycle was copy-pasted in sehuatang-menu and
 * umm-interest-bar (and nearly again in doulist-dialog). Shadow DOM needs
 * `getRootNode().activeElement` instead of `document.activeElement`; the helper
 * resolves that so every modal agrees. SPA dialogs use reka-ui's built-in trap —
 * this module is the content-script / overlay twin of that behaviour (D7-style
 * contract split: same semantics, two renderers).
 */

export const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** Focusable descendants of `root`, in document order. */
export function getFocusableElements(root: Element): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

/**
 * Active element inside a light-DOM or shadow tree. Falls back to
 * `document.activeElement` when the root is a plain Document.
 *
 * Duck-typed (not `instanceof Element`): jsdom / shadow nodes from another
 * realm fail `instanceof` against the worker's global `Element`, and the trap
 * would then treat a focused element as "nowhere" and wrap on every Tab.
 */
export function getActiveElement(root: Element | Document | ShadowRoot): Element | null {
  const maybeEl = root as Partial<Element>;
  if (typeof maybeEl.getRootNode === 'function') {
    const tree = maybeEl.getRootNode() as Document | ShadowRoot;
    return tree.activeElement ?? null;
  }
  return (root as Document).activeElement ?? null;
}

/**
 * Tab / Shift+Tab cycle inside `panel`. Call from a capture-phase keydown.
 * Returns true when the event was consumed (caller may stopPropagation).
 *
 * Focus that has escaped the panel is pulled back to the first/last stop —
 * without that, a host-page focus steal would strand the keyboard user outside
 * the modal they just opened.
 */
export function handleTrapTabKey(e: KeyboardEvent, panel: Element): boolean {
  if (e.key !== 'Tab') return false;
  const focusables = getFocusableElements(panel);
  if (focusables.length === 0) return false;
  const first = focusables[0]!;
  const last = focusables[focusables.length - 1]!;
  const active = getActiveElement(panel);
  if (e.shiftKey) {
    if (active === first || !panel.contains(active)) {
      e.preventDefault();
      last.focus();
      return true;
    }
  } else if (active === last || !panel.contains(active)) {
    e.preventDefault();
    first.focus();
    return true;
  }
  return false;
}

/** Move focus to the first focusable in `panel` (open path). Null-safe. */
export function focusFirst(panel: Element | null | undefined): void {
  if (!panel) return;
  getFocusableElements(panel)[0]?.focus();
}

/**
 * Return focus to `anchor` only when the close path left it nowhere: a menu
 * item that opens a nested panel focuses that panel's input, and yanking focus
 * back strands keyboard users outside the thing they just opened.
 */
export function returnFocusIfLost(anchor: HTMLElement | null, root: Element | Document): void {
  if (!anchor) return;
  const active = getActiveElement(root instanceof Element ? root : (root as Document));
  if (!active || active === (root as Document).body || active === anchor) anchor.focus();
}
