/**
 * Douban search — early injection (document_start)
 *
 * Creates shadow DOM overlay with loading spinner.
 * Refactored to use shared overlay creation logic.
 */

import { defineContentScript } from 'wxt/utils/define-content-script'
import { createOverlay } from '@/entrypoints/content/shared/overlay'

export default defineContentScript({
  matches: ['*://search.douban.com/movie/subject_search*', '*://search.douban.com/music/subject_search*'],
  runAt: 'document_start',

  main() {
    createOverlay({
      overlayId: 'umm-search-overlay',
      subtitle: '加载搜索结果...',
    })
  },
})
