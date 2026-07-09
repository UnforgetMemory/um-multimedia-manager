/**
 * Douban pages — main entry (document_idle)
 *
 * Thin WXT entrypoint. All logic lives in @/content/douban/main.ts.
 */

import { defineContentScript } from 'wxt/utils/define-content-script'
import { mountDoubanMain } from '@/content/douban/main'

export default defineContentScript({
  matches: ['*://movie.douban.com/*', '*://music.douban.com/*', '*://music.douban.com/subject/*', '*://search.douban.com/movie/subject_search*', '*://search.douban.com/music/subject_search*', '*://www.douban.com/personage/*', '*://www.douban.com/people/*', '*://www.douban.com/doulist/*'],
  runAt: 'document_idle',
  cssInjectionMode: 'manual',

  async main() {
    await mountDoubanMain()
  },
})