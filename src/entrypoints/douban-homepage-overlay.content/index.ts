/**
 * Douban homepage — early injection (document_start)
 *
 * Creates shadow DOM overlay with loading spinner.
 * Refactored to use shared overlay creation logic.
 */

import { defineContentScript } from 'wxt/utils/define-content-script'
import { createOverlay } from '@/entrypoints/content/shared/overlay'

export default defineContentScript({
  matches: ['https://movie.douban.com/'],
  runAt: 'document_start',

  main() {
    createOverlay({
      overlayId: 'umm-douban-overlay',
      subtitle: '多媒体管理器 · 加载中',
    })
  },
})
