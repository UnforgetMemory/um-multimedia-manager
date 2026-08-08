/**
 * DOM 操作工具函数
 */

import { Utils } from '@/utils'
import { t } from '../i18n'
import { statusLabelKey } from './status-label-key';

import { escapeHtml } from '@/utils/escape-html'
export { escapeHtml }

export interface WaitForElementOptions {
  /** 内容就绪检查：元素已出现但内容未就绪时继续等待 */
  contentCheck?: (el: Element) => boolean
  /** 观察器创建回调（供调用方在清理时 disconnect，避免等待中的观察器泄漏） */
  onObserverCreated?: (observer: MutationObserver) => void
}

/**
 * 等待元素出现（Promise 版本）
 * 唯一权威实现：mukaku / PT dimmer 等模块均从此处导入。
 */
export function waitForElement(
  selector: string,
  timeout = 5000,
  options: WaitForElementOptions = {},
): Promise<Element> {
  return new Promise((resolve, reject) => {
    const match = (): Element | null => {
      const element = document.querySelector(selector)
      if (!element) return null
      if (options.contentCheck && !options.contentCheck(element)) return null
      return element
    }

    const found = match()
    if (found) {
      resolve(found)
      return
    }

    const observer = new MutationObserver(() => {
      const element = match()
      if (element) {
        observer.disconnect()
        resolve(element)
      }
    })

    options.onObserverCreated?.(observer)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    })

    setTimeout(() => {
      observer.disconnect()
      // 超时前一刻才出现 — 仍视为成功，避免误报超时
      const element = match()
      if (element) {
        resolve(element)
        return
      }
      reject(new Error(`Timeout waiting for ${selector}`))
    }, timeout)
  })
}

/**
 * 创建状态标签
 */
export function createStatusChip(
  type: string,      // movie/tv/music/book
  status: number,    // 0=none, 1=wish, 2=done, 3=doing
  rating: number,
  note: string = ''
): HTMLElement {
  const chip = document.createElement('div')
  chip.className = 'umm-status-chip'
  chip.dataset.status = status === 2 ? 'done' : status === 3 ? 'doing' : status === 1 ? 'wish' : 'none'
  
  // 按媒体类型选择状态文案键：music→听（_music）、book→读（_book）、game→玩（_game），其余（movie/tv）→基础键
  // （共享实现见 utils/status-label-key.ts）
  const k = (suffix: string, base: string): string => statusLabelKey(type, suffix, base)

  const label = status === 2
    ? (note 
        ? t(k('done_local', 'status.done_local'))
        : t(k('done', 'status.done')))
    : status === 3
      ? t(k('doing', 'status.doing'))
      : status === 1
        ? t(k('wish', 'status.wish'))
        : t(k('none', 'status.none'))
  
  const ratingText = rating > 0 ? `${Utils.formatRating10(rating)}/10` : ''
  
  // XSS 防护：转义所有用户输入
  const escapedLabel = escapeHtml(label)
  const escapedRatingText = ratingText ? escapeHtml(ratingText) : ''
  // ✅ 修复：当 label 已包含"(本地)"标识时，不再显示 note，避免语义重复
  const shouldShowNote = note && !label.includes('(本地)')
  const escapedNote = shouldShowNote ? escapeHtml(note) : ''
  
  chip.innerHTML = `
    <span class="umm-label">${escapedLabel}</span>
    ${escapedRatingText ? `<span class="umm-rating">${escapedRatingText}</span>` : ''}
    ${escapedNote ? `<span class="umm-note">${escapedNote}</span>` : ''}
  `
  
  // 添加 ARIA 属性
  chip.setAttribute('role', 'status')
  chip.setAttribute('aria-live', 'polite')
  chip.setAttribute('aria-label', `${label}${ratingText ? `, ${ratingText}` : ''}${shouldShowNote && note ? `, ${note}` : ''}`)
  
  return chip
}
