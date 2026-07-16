/**
 * 豆瓣通知 Toast 工具函数
 * 功能：显示页面级和浮动通知
 */

import { FloatingToast } from '../utils/toast'

/**
 * ✅ 显示页面内 Toast 通知（右下角）
 */
export function showPageToast(
  message: string,
  type: 'loading' | 'success' | 'error' = 'loading',
  duration: number = 0 // 0 表示不自动消失
): HTMLElement {
  // 移除旧的 Toast
  const oldToast = document.getElementById('umm-page-toast')
  if (oldToast) {
    oldToast.remove()
  }
  
  // 创建 Toast 容器
  const toast = document.createElement('div')
  toast.id = 'umm-page-toast'
  
  // ✅ 优化颜色系统：添加彩色阴影
  const colors = {
    loading: { 
      bg: '#3b82f6',      // blue-500
      border: '#2563eb',  // blue-600
      icon: '⏳',
      shadow: 'rgba(59, 130, 246, 0.3)'
    },
    success: { 
      bg: '#10b981',      // emerald-500
      border: '#059669',  // emerald-600
      icon: '✅',
      shadow: 'rgba(16, 185, 129, 0.3)'
    },
    error: { 
      bg: '#ef4444',      // red-500
      border: '#dc2626',  // red-600
      icon: '❌',
      shadow: 'rgba(239, 68, 68, 0.3)'
    }
  }
  
  const color = colors[type]
  
  // ✅ 修改位置到右下角，优化样式
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: ${color.bg};
    color: white;
    padding: 16px 24px;
    border-radius: 12px;
    box-shadow: 0 8px 24px ${color.shadow}, 0 4px 8px rgba(0, 0, 0, 0.1);
    z-index: 500;
    font-size: 14px;
    font-weight: 500;
    letter-spacing: 0.01em;
    line-height: 1.5;
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 300px;
    max-width: 400px;
    justify-content: flex-start;
    border: 2px solid ${color.border};
    animation: slideInRight 0.3s ease-out;
    cursor: default;
  `
  
  // ✅ 更新动画样式：右侧滑入 + 淡出下移
  if (!document.getElementById('umm-toast-animation')) {
    const style = document.createElement('style')
    style.id = 'umm-toast-animation'
    style.textContent = `
      @keyframes slideInRight {
        from {
          opacity: 0;
          transform: translateX(100%);
        }
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }
      
      @keyframes fadeOutDown {
        from {
          opacity: 1;
          transform: translateY(0);
        }
        to {
          opacity: 0;
          transform: translateY(10px);
        }
      }
    `
    document.head.appendChild(style)
  }
  
  // ✅ 修复：使用 textContent 防止 XSS
  const iconSpan = document.createElement('span')
  iconSpan.style.fontSize = '20px'
  iconSpan.textContent = color.icon
  
  const messageSpan = document.createElement('span')
  messageSpan.textContent = message  // ✅ 自动转义，防止 XSS
  
  toast.innerHTML = ''  // 清空
  toast.appendChild(iconSpan)
  toast.appendChild(messageSpan)
  
  document.body.appendChild(toast)
  
  // ✅ 如果设置了持续时间，自动消失（带悬停交互）
  if (duration > 0) {
    let autoHideTimer: number | null = window.setTimeout(() => {
      // ✅ 使用 CSS 动画而非简单的 opacity 过渡
      toast.style.animation = 'fadeOutDown 0.3s ease-out forwards'
      setTimeout(() => toast.remove(), 300)
      autoHideTimer = null
    }, duration)
    
    // ✅ 悬停时取消自动消失
    toast.addEventListener('mouseenter', () => {
      if (autoHideTimer) {
        clearTimeout(autoHideTimer)
        autoHideTimer = null
      }
    })
    
    // ✅ 离开后重新计时（缩短一半时间）
    toast.addEventListener('mouseleave', () => {
      if (!autoHideTimer && duration > 0) {
        autoHideTimer = window.setTimeout(() => {
          toast.style.animation = 'fadeOutDown 0.3s ease-out forwards'
          setTimeout(() => toast.remove(), 300)
        }, duration / 2)
      }
    })
  }
  
  return toast
}

/**
 * ✅ 显示通知（统一使用 FloatingToast）
 */
export function showNotification(message: string) {
  if (message.startsWith('✅')) {
    FloatingToast.success('UMM', message)
  } else if (message.startsWith('❌')) {
    FloatingToast.error('UMM', message)
  } else {
    FloatingToast.info('UMM', message)
  }
}
