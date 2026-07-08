/**
 * Douban pages — early injection (document_start)
 *
 * Thin WXT entrypoint. All logic lives in @/content/douban/early.ts.
 */

import './overlay.css'
import { defineContentScript } from 'wxt/utils/define-content-script'
import { createDoubanEarlyOverlay } from '@/content/douban/early'

export default defineContentScript({
  matches: ['*://movie.douban.com/*', '*://music.douban.com/*', '*://music.douban.com/subject/*', '*://search.douban.com/movie/subject_search*', '*://search.douban.com/music/subject_search*', '*://www.douban.com/personage/*'],
  runAt: 'document_start',

  main() {
    createDoubanEarlyOverlay()
  },
})
