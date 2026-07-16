/**
 * Toast Message Handler
 *
 * Handles SHOW_TOAST message — sends toast to content script or injects inline.
 * Extracted from background.ts for modularity.
 */

type SendResponse = (response?: any) => void

/** Valid toast notification types */
const VALID_TOAST_TYPES = ['success', 'error', 'info', 'loading'] as const

import { escapeHtml } from '@/utils/escape-html'
import { TOAST_CORE_CSS } from '@/shared/styles/toast-css'

/** SHOW_TOAST — send toast notification to active tab */
export async function handleShowToast(
  payload: any,
  sendResponse: SendResponse
) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) {
      sendResponse({ success: false, error: 'No active tab' })
      return
    }

    const toastType = VALID_TOAST_TYPES.includes(payload?.type) ? payload.type : 'info'
    const toastPayload = { type: toastType, title: payload?.title || '', message: payload?.message }

    // 1) Try sending to loaded content script
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'SHOW_TOAST', payload: toastPayload })
      sendResponse({ success: true })
      return
    } catch {
      // Content script not loaded — fall back to dynamic injection
    }

    // 2) Dynamically inject lightweight toast (works on any page)
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: __showInlineToast,
      args: [toastPayload.type, toastPayload.title, toastPayload.message || '', TOAST_CORE_CSS],
    })
    sendResponse({ success: true })
  } catch {
    sendResponse({ success: false })
  }
}

/** Lightweight inline toast — injected into any page, matches FloatingToast styles */
function __showInlineToast(type: string, title: string, message: string, CORE_CSS: string) {
  const CONTAINER_ID = 'umm-toast-container'
  const STYLES_ID = 'umm-toast-styles'
  const MAX_TOASTS = 3
  const AUTO_REMOVE_MS = 2800

  // Inject styles (shared canonical source: src/shared/styles/toast-css.ts)
  if (!document.getElementById(STYLES_ID)) {
    const style = document.createElement('style')
    style.id = STYLES_ID
    style.textContent = CORE_CSS
    document.documentElement.appendChild(style)
  }

  // Get or create container
  let ctr = document.getElementById(CONTAINER_ID)
  if (!ctr) {
    ctr = document.createElement('div')
    ctr.id = CONTAINER_ID
    ctr.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 500;
      display: flex;
      flex-direction: column;
      gap: 12px;
      align-items: flex-end;
      pointer-events: none;
    `
    ctr.setAttribute('role', 'region')
    ctr.setAttribute('aria-label', '通知区域')
    document.body.appendChild(ctr)
  }

  // Deduplicate: replace same-title toast within 2s
  const now = Date.now()
  for (const child of Array.from(ctr.children)) {
    const el = child as HTMLElement
    if (el.dataset.ummTitle === title && now - Number(el.dataset.ummTs || 0) < 2000) {
      el.dataset.ummTs = String(now)
      const pEl = el.querySelector('p')
      if (pEl && message) pEl.textContent = message
      return
    }
  }

  // Limit count
  while (ctr.children.length >= MAX_TOASTS) {
    const first = ctr.firstElementChild as HTMLElement | null
    if (first) {
      first.classList.remove('show')
      setTimeout(() => first.remove(), 350)
    }
    ctr.firstChild?.remove()
  }

  // Create toast element
  const toast = document.createElement('div')
  toast.className = `umm-toast umm-toast--${type}`
  toast.dataset.ummTitle = title
  toast.dataset.ummTs = String(now)
  toast.setAttribute('role', 'alert')
  toast.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite')
  toast.setAttribute('aria-atomic', 'true')

  const content = document.createElement('div')
  content.className = 'umm-toast__content'
  content.innerHTML = `<strong>${escapeHtml(title)}</strong>${message ? `<p>${escapeHtml(message)}</p>` : ''}`
  toast.appendChild(content)

  ctr.appendChild(toast)

  // Entry animation
  requestAnimationFrame(() => toast.classList.add('show'))

  // Auto-remove
  setTimeout(() => {
    toast.classList.remove('show')
    setTimeout(() => toast.remove(), 350)
  }, AUTO_REMOVE_MS)
}
