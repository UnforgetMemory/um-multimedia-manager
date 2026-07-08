/**
 * DOM 操作工具函数
 */

import { Utils } from '@/utils'
import { t } from '../i18n'

import { escapeHtml } from '@/utils/escape-html'
export { escapeHtml }

/**
 * 等待元素出现（Promise 版本）
 */
export function waitForElement(selector: string, timeout = 5000): Promise<Element> {
  return new Promise((resolve, reject) => {
    const element = document.querySelector(selector)
    if (element) {
      resolve(element)
      return
    }
    
    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector)
      if (element) {
        observer.disconnect()
        resolve(element)
      }
    })
    
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    })
    
    setTimeout(() => {
      observer.disconnect()
      reject(new Error(`Timeout waiting for ${selector}`))
    }, timeout)
  })
}

/**
 * 创建状态标签
 */
export function createStatusChip(
  type: string,      // movie/tv/music/book
  status: number,    // 0/1/2
  rating: number,
  note: string = ''
): HTMLElement {
  const chip = document.createElement('div')
  chip.className = 'umm-status-chip'
  chip.dataset.status = status === 2 ? 'done' : 'none'
  
  const label = status === 2
    ? (note 
        ? t(type === 'music' ? 'status.done_local_music' : 'status.done_local')
        : t(type === 'music' ? 'status.done_music' : 'status.done'))
    : t(type === 'music' ? 'status.none_music' : 'status.none')
  
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
