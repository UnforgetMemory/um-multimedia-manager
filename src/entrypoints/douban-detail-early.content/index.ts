/**
 * Douban detail page — early injection (document_start)
 *
 * Creates shadow DOM overlay with loading spinner.
 * Refactored to use shared overlay creation logic.
 */

import { defineContentScript } from 'wxt/utils/define-content-script'
import { createOverlay } from '@/entrypoints/content/shared/overlay'

export default defineContentScript({
  matches: [
    '*://movie.douban.com/subject/*',
    '*://music.douban.com/subject/*',
  ],
  runAt: 'document_start',

  main() {
    createOverlay({
      overlayId: 'umm-detail-mask',
      subtitle: '加载中...',
      exposeDismiss: true,
    })
  },
})
