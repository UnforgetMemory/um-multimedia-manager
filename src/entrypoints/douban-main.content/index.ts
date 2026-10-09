/**
 * Douban pages — main entry (document_idle)
 *
 * Thin WXT entrypoint. All logic lives in @/scenario/douban/main.ts.
 */

import { defineContentScript } from 'wxt/utils/define-content-script';
import { bootstrapLogging } from '@/entrypoints/content/bootstrap/logging';
import { mountDoubanMain } from '@/scenario/douban/main';

export default defineContentScript({
  matches: [
    '*://movie.douban.com/*',
    '*://music.douban.com/*',
    '*://music.douban.com/subject/*',
    '*://book.douban.com/*',
    '*://search.douban.com/movie/subject_search*',
    '*://search.douban.com/music/subject_search*',
    '*://search.douban.com/book/subject_search*',
    '*://www.douban.com/personage/*',
    '*://www.douban.com/people/*',
    '*://www.douban.com/doulist/*',
    '*://www.douban.com/game/*',
  ],
  excludeMatches: ['*://*.douban.com/settings/*'],
  runAt: 'document_idle',
  cssInjectionMode: 'manual',

  async main() {
    // Options 页的「调试日志」与「日志级别」只写进 chrome.storage：本上下文不把
    // 它们读回 configureLogging()，就等于生产恒静音（logger 默认跟随 DEV）——开关
    // 看着接了却什么也不出，豆瓣页也收不到诊断。先于挂载，首帧日志同样按级别过滤。
    await bootstrapLogging();
    await mountDoubanMain();
  },
});
