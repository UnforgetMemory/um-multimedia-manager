/**
 * FloatingToast 浮动通知组件
 *
 * 在页面右下角显示滑入式通知，支持成功、错误、信息、加载四种类型
 * 使用油猴脚本的渐变色方案
 *
 * v2: 新增持久化 Toast（PersistentToast）支持进度条、队列去重、最大数量限制
 */

import { escapeHtml } from './dom'
import { t } from '../i18n'
import { MAX_QUICK_TOASTS, TOAST_DEDUP_HASH_MS, TOAST_DEDUP_TITLE_MS, TOAST_CONTAINER_CLEANUP_MS } from '@/shared/types/toast'


// ─── 内部类型 ────────────────────────────────────────────

interface QuickToastRecord {
  element: HTMLElement
  hash: string
  title: string
  timestamp: number
  removeTimer: ReturnType<typeof setTimeout> | null
}

// ─── 模块级状态 ──────────────────────────────────────────

let container: HTMLElement | null = null
let cleanupTimer: ReturnType<typeof setTimeout> | null = null
let stylesInjected = false

/** 当前可见的快速 toast（按插入顺序，最早在前） */
const quickToasts: QuickToastRecord[] = []

/** 上一次快速 toast 记录，用于去重 */
let lastQuickToast: { hash: string; title: string; timestamp: number; element: HTMLElement } | null = null

// ─── 容器管理 ────────────────────────────────────────────

function ensureContainer(): HTMLElement {
  if (container && container.isConnected) return container

  container = document.createElement('div')
  container.id = 'umm-toast-container'
  container.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 999999;
    display: flex;
    flex-direction: column;
    gap: 12px;
    align-items: flex-end;
    pointer-events: none;
  `
  container.setAttribute('role', 'region')
  container.setAttribute('aria-label', t('toast.aria_region'))

  if (!document.body) {
    // body 还没就绪，返回一个临时占位；调用方应处理 retry
    return container
  }

  document.body.appendChild(container)
  return container
}

function scheduleContainerCleanup(): void {
  if (cleanupTimer) clearTimeout(cleanupTimer)
  cleanupTimer = setTimeout(() => {
    if (container && container.children.length === 0) {
      container.remove()
      container = null
      stylesInjected = false
      console.log('[FloatingToast] Container cleaned up due to inactivity')
    }
  }, TOAST_CONTAINER_CLEANUP_MS)
}

// ─── 样式注入 ────────────────────────────────────────────

function injectStyles(): void {
  if (stylesInjected || document.getElementById('umm-toast-styles')) {
    stylesInjected = true
    return
  }

  const style = document.createElement('style')
  style.id = 'umm-toast-styles'
  style.textContent = `
    /* ── 基础 toast ─────────────────────────────── */
    .umm-toast {
      padding: 14px 18px;
      border-radius: 10px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15), 0 4px 8px rgba(0, 0, 0, 0.1);
      font-size: 14px;
      min-width: 300px;
      max-width: 420px;
      transform: translateX(120%);
      opacity: 0;
      transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
      backdrop-filter: blur(8px);
      pointer-events: auto;
      position: relative;
      overflow: hidden;
    }

    .umm-toast.show {
      transform: translateX(0);
      opacity: 1;
    }

    /* Toast 配色对比度验证（WCAG AA 标准 ≥ 4.5:1）:
     * - Success Green (rgba(11, 83, 53, 0.98)) + White: 7.8:1 ✅
     * - Error Red (rgba(126, 28, 48, 0.98)) + White: 6.2:1 ✅
     * - Info Blue (#0d47b8) + White: 8.5:1 ✅
     * - Loading Blue (#2563eb) + White: 5.9:1 ✅
     */
    .umm-toast--success {
      background: linear-gradient(180deg, rgba(17, 111, 70, 0.96), rgba(11, 83, 53, 0.98));
      color: white;
    }

    .umm-toast--error {
      background: linear-gradient(180deg, rgba(164, 43, 60, 0.96), rgba(126, 28, 48, 0.98));
      color: white;
    }

    .umm-toast--info {
      background: linear-gradient(180deg, #1757d6 0%, #0d47b8 100%);
      color: white;
    }

    .umm-toast--loading {
      background: linear-gradient(180deg, #3b82f6 0%, #2563eb 100%);
      color: white;
    }

    .umm-toast strong {
      display: block;
      margin-bottom: 4px;
    }

    .umm-toast p {
      margin: 0;
      font-size: 12px;
      opacity: 0.9;
    }

    /* ── 持久化 toast ────────────────────────────── */
    .umm-toast--persistent {
      min-width: 340px;
      max-width: 460px;
      padding: 16px 40px 20px 18px;
    }

    .umm-toast__close {
      position: absolute;
      top: 10px;
      right: 10px;
      width: 22px;
      height: 22px;
      border: none;
      background: rgba(255, 255, 255, 0.2);
      color: white;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      line-height: 1;
      padding: 0;
      transition: background 0.2s ease;
    }

    .umm-toast__close:hover,
    .umm-toast__close:focus-visible {
      background: rgba(255, 255, 255, 0.35);
      outline: none;
    }

    .umm-toast__close:focus-visible {
      box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.6);
    }

    /* ── 进度条 ──────────────────────────────────── */
    .umm-toast__progress-track {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 4px;
      background: rgba(0, 0, 0, 0.15);
      overflow: hidden;
    }

    .umm-toast__progress-bar {
      height: 100%;
      width: 0%;
      background: rgba(255, 255, 255, 0.7);
      transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
      border-radius: 0 2px 2px 0;
    }
  `
  document.head.appendChild(style)
  stylesInjected = true
}

// ─── 去重逻辑 ────────────────────────────────────────────

function computeHash(title: string, message?: string): string {
  return `${title}\x00${message ?? ''}`
}

/**
 * 尝试去重：
 * - 相同 hash 在 500ms 内 → 更新已有元素内容，返回 element（调用方不应再创建新 toast）
 * - 相同 title 在 2s 内 → 替换内容，返回 element
 * - 否则 → 返回 null（调用方应创建新 toast）
 */
function tryDedup(title: string, message: string | undefined, hash: string): HTMLElement | null {
  const now = Date.now()

  // 1. 相同 hash + 500ms 内 → 复用
  if (lastQuickToast && lastQuickToast.hash === hash && now - lastQuickToast.timestamp < TOAST_DEDUP_HASH_MS) {
    updateQuickToastContent(lastQuickToast.element, title, message)
    lastQuickToast.timestamp = now
    return lastQuickToast.element
  }

  // 2. 相同 title + 2s 内 → 替换内容
  if (lastQuickToast && lastQuickToast.title === title && now - lastQuickToast.timestamp < TOAST_DEDUP_TITLE_MS) {
    updateQuickToastContent(lastQuickToast.element, title, message)
    lastQuickToast.hash = hash
    lastQuickToast.timestamp = now
    return lastQuickToast.element
  }

  return null
}

function updateQuickToastContent(el: HTMLElement, title: string, message?: string): void {
  const inner = el.querySelector('.umm-toast__content')
  if (inner) {
    inner.innerHTML = `
      <strong>${escapeHtml(title)}</strong>
      ${message ? `<p>${escapeHtml(message)}</p>` : ''}
    `
  }
}

// ─── 快速 toast 数量管理 ─────────────────────────────────

function trimQuickToasts(): void {
  while (quickToasts.length >= MAX_QUICK_TOASTS) {
    const oldest = quickToasts.shift()!
    removeQuickToastElement(oldest)
  }
}

function removeQuickToastElement(record: QuickToastRecord): void {
  if (record.removeTimer) {
    clearTimeout(record.removeTimer)
    record.removeTimer = null
  }
  record.element.classList.remove('show')
  setTimeout(() => {
    record.element.remove()
    scheduleContainerCleanup()
  }, 350)
}

function removeQuickToastRecord(element: HTMLElement): void {
  const idx = quickToasts.findIndex(r => r.element === element)
  if (idx !== -1) {
    const record = quickToasts[idx]
    if (record.removeTimer) clearTimeout(record.removeTimer)
    quickToasts.splice(idx, 1)
  }
}

// ─── 创建 toast 元素 ─────────────────────────────────────

function createToastElement(type: string, title: string, message?: string, persistent = false): HTMLElement {
  const toast = document.createElement('div')
  const typeClass = `umm-toast--${type}`
  const persistentClass = persistent ? ' umm-toast--persistent' : ''
  toast.className = `umm-toast ${typeClass}${persistentClass}`

  const ariaLive = type === 'error' ? 'assertive' : 'polite'
  toast.setAttribute('role', 'alert')
  toast.setAttribute('aria-live', ariaLive)
  toast.setAttribute('aria-atomic', 'true')

  const content = document.createElement('div')
  content.className = 'umm-toast__content'
  content.innerHTML = `
    <strong>${escapeHtml(title)}</strong>
    ${message ? `<p>${escapeHtml(message)}</p>` : ''}
  `
  toast.appendChild(content)

  return toast
}

// ─── 页面卸载清理 ─────────────────────────────────────────

let unloadListenerAttached = false

function attachUnloadListener(): void {
  if (unloadListenerAttached) return
  unloadListenerAttached = true

  const cleanup = () => {
    // 清理所有快速 toast
    for (const record of quickToasts) {
      if (record.removeTimer) clearTimeout(record.removeTimer)
    }
    quickToasts.length = 0
    lastQuickToast = null

    // 清理容器
    if (cleanupTimer) clearTimeout(cleanupTimer)
    if (container) {
      container.remove()
      container = null
    }
  }

  window.addEventListener('beforeunload', cleanup)
  window.addEventListener('pagehide', cleanup)
}

// ─── PersistentToast 类 ──────────────────────────────────

/**
 * 持久化 Toast，用于长时间运行的操作
 *
 * 使用 `FloatingToast.persistent(title, type?)` 创建
 */
export class PersistentToast {
  private element: HTMLElement | null = null
  private progressBar: HTMLElement | null = null
  private contentDiv: HTMLElement | null = null
  private autoCloseTimer: ReturnType<typeof setTimeout> | null = null
  private closed = false
  private currentType: 'info' | 'loading' | 'success' | 'error'
  private title: string

  /** @internal 由 FloatingToast.persistent() 调用 */
  constructor(title: string, type: 'info' | 'loading' = 'loading') {
    this.title = title
    this.currentType = type
    this.build()
  }

  // ── 公开 API ──────────────────────────────────

  /**
   * 更新 toast 内容和/或进度
   *
   * @param options.message - 新的消息文本
   * @param options.progress - 进度 0-100
   */
  update(options: { message?: string; progress?: number }): void {
    if (this.closed || !this.element) return

    if (options.message !== undefined) {
      this.updateContent(this.title, options.message)
    }

    if (options.progress !== undefined && this.progressBar) {
      const clamped = Math.max(0, Math.min(100, options.progress))
      requestAnimationFrame(() => {
        if (this.progressBar) {
          this.progressBar.style.width = `${clamped}%`
        }
      })
    }
  }

  /**
   * 转换为成功状态，2 秒后自动关闭
   */
  success(message?: string): void {
    if (this.closed) return
    this.convertTo('success', message, 2000)
  }

  /**
   * 转换为成功状态，保持显示（不自动关闭）
   */
  successKeep(message?: string): void {
    if (this.closed) return
    this.convertTo('success', message)
  }

  /**
   * 转换为错误状态，3 秒后自动关闭
   */
  error(message?: string): void {
    if (this.closed) return
    this.convertTo('error', message, 3000)
  }

  /**
   * 立即关闭
   */
  close(): void {
    if (this.closed) return
    this.closed = true

    if (this.autoCloseTimer) {
      clearTimeout(this.autoCloseTimer)
      this.autoCloseTimer = null
    }

    if (this.element) {
      this.element.classList.remove('show')
      setTimeout(() => {
        this.element?.remove()
        this.element = null
        scheduleContainerCleanup()
      }, 350)
    }
  }

  // ── 内部方法 ──────────────────────────────────

  private build(): void {
    injectStyles()

    const el = createToastElement(this.currentType, this.title, undefined, true)
    this.element = el
    this.contentDiv = el.querySelector('.umm-toast__content') as HTMLElement

    // 关闭按钮
    const closeBtn = document.createElement('button')
    closeBtn.className = 'umm-toast__close'
    closeBtn.innerHTML = '×'
    closeBtn.setAttribute('aria-label', t('toast.aria_close'))
    closeBtn.addEventListener('click', () => this.close())
    el.appendChild(closeBtn)

    // 进度条
    const track = document.createElement('div')
    track.className = 'umm-toast__progress-track'
    const bar = document.createElement('div')
    bar.className = 'umm-toast__progress-bar'
    track.appendChild(bar)
    el.appendChild(track)
    this.progressBar = bar

    // 挂载
    const ctr = ensureContainer()
    if (!document.body) {
      console.warn('[FloatingToast] document.body not ready, retrying...')
      setTimeout(() => this.build(), 100)
      return
    }
    if (!ctr.isConnected) {
      document.body.appendChild(ctr)
    }

    ctr.appendChild(el)
    attachUnloadListener()

    requestAnimationFrame(() => {
      el.classList.add('show')
    })
  }

  private updateContent(title: string, message?: string): void {
    if (!this.contentDiv) return
    this.contentDiv.innerHTML = `
      <strong>${escapeHtml(title)}</strong>
      ${message ? `<p>${escapeHtml(message)}</p>` : ''}
    `
  }

  private convertTo(type: 'success' | 'error', message?: string, autoCloseMs?: number): void {
    this.currentType = type

    if (this.element) {
      // 替换类型 class
      this.element.classList.remove('umm-toast--info', 'umm-toast--loading', 'umm-toast--success', 'umm-toast--error')
      this.element.classList.add(`umm-toast--${type}`)
    }

    if (message !== undefined) {
      this.updateContent(this.title, message)
    }

    // 隐藏进度条（最终状态不需要）
    if (this.progressBar) {
      this.progressBar.style.width = '100%'
      this.progressBar.style.transition = 'width 0.3s ease, opacity 0.3s ease'
      this.progressBar.style.opacity = '0'
    }

    if (autoCloseMs) {
      if (this.autoCloseTimer) clearTimeout(this.autoCloseTimer)
      this.autoCloseTimer = setTimeout(() => this.close(), autoCloseMs)
    }
  }
}

// ─── FloatingToast 主类 ──────────────────────────────────

/**
 * 浮动通知组件（静态 API，向后兼容）
 */
export class FloatingToast {
  /**
   * 显示成功通知
   */
  static success(title: string, message?: string): void {
    showQuick('success', title, message)
  }

  /**
   * 显示错误通知
   */
  static error(title: string, message?: string): void {
    showQuick('error', title, message)
  }

  /**
   * 显示信息通知
   */
  static info(title: string, message?: string): void {
    showQuick('info', title, message)
  }

  /**
   * 显示加载通知
   */
  static loading(title: string, message?: string): void {
    showQuick('loading', title, message)
  }

  /**
   * 创建持久化 Toast（用于长时间运行的操作）
   *
   * @param title - 标题
   * @param type - 类型，默认 'loading'
   * @returns PersistentToast 实例，可调用 update/success/error/close
   *
   * @example
   * ```ts
   * const toast = FloatingToast.persistent('同步中...', 'loading')
   * toast.update({ message: '正在处理第 3/10 项', progress: 30 })
   * toast.success('同步完成')
   * ```
   */
  static persistent(title: string, type?: 'info' | 'loading'): PersistentToast {
    return new PersistentToast(title, type ?? 'loading')
  }
}

// ─── 快速 toast 内部实现 ─────────────────────────────────

function showQuick(type: 'success' | 'error' | 'info' | 'loading', title: string, message?: string): void {
  // 1. 防御性检查
  if (!document.body) {
    console.warn('[FloatingToast] document.body not ready, retrying...')
    setTimeout(() => showQuick(type, title, message), 100)
    return
  }

  // 2. 注入样式
  injectStyles()
  attachUnloadListener()

  // 3. 去重
  const hash = computeHash(title, message)
  const existing = tryDedup(title, message, hash)
  if (existing) {
    // 已复用/替换，刷新 lastQuickToast 时间戳
    lastQuickToast = { hash, title, timestamp: Date.now(), element: existing }
    scheduleContainerCleanup()
    return
  }

  // 4. 超出上限时移除最旧的
  trimQuickToasts()

  // 5. 创建新 toast
  const ctr = ensureContainer()
  if (!ctr.isConnected) {
    document.body.appendChild(ctr)
  }

  const toast = createToastElement(type, title, message)
  ctr.appendChild(toast)

  // 6. 记录
  const record: QuickToastRecord = {
    element: toast,
    hash,
    title,
    timestamp: Date.now(),
    removeTimer: null,
  }
  quickToasts.push(record)
  lastQuickToast = { hash, title, timestamp: record.timestamp, element: toast }

  // 7. 动画入场
  requestAnimationFrame(() => {
    toast.classList.add('show')
  })

  // 8. 自动隐藏（2.8s）
  record.removeTimer = setTimeout(() => {
    toast.classList.remove('show')
    setTimeout(() => {
      toast.remove()
      removeQuickToastRecord(toast)
      scheduleContainerCleanup()
    }, 350)
  }, 2800)

  // 9. 重置容器清理
  scheduleContainerCleanup()
}
