/**
 * DOM 操作工具函数
 */

import { Utils } from '../../shared/utils'

/**
 * HTML 转义函数 - 防止 XSS 攻击
 */
export function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

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
    ? (type === 'music' ? '✅ 已听' : '✅ 已看')
    : (type === 'music' ? '⏳ 未听' : '⏳ 未看')
  
  const ratingText = rating > 0 ? `${Utils.formatRating10(rating)}/10` : ''
  
  // XSS 防护：转义所有用户输入
  const escapedLabel = escapeHtml(label)
  const escapedRatingText = ratingText ? escapeHtml(ratingText) : ''
  const escapedNote = note ? escapeHtml(note) : ''
  
  chip.innerHTML = `
    <span class="umm-label">${escapedLabel}</span>
    ${escapedRatingText ? `<span class="umm-rating">${escapedRatingText}</span>` : ''}
    ${escapedNote ? `<span class="umm-note">${escapedNote}</span>` : ''}
  `
  
  // 添加 ARIA 属性
  chip.setAttribute('role', 'status')
  chip.setAttribute('aria-live', 'polite')
  chip.setAttribute('aria-label', `${label}${ratingText ? `, 评分${ratingText}` : ''}${note ? `, ${note}` : ''}`)
  
  return chip
}
