import { defineContentScript } from 'wxt/utils/define-content-script'
import { subscribeTheme } from '@/content/douban/overlay/theme-sync'
import { paintSehuatangBackground } from '@/entrypoints/content/handlers/sehuatang-controls'

/**
 * 色花堂早期入口（document_start）：首帧背景预载 + 主题属性保鲜。
 *
 * 主 content 脚本在 document_idle 才完成 DB 健康检查并挂载 overlay，此前
 * 用户会看到站点原始背景（主题背景晚到 → 跳变闪烁）。本入口在首帧前：
 *   1. 消费共享 subscribeTheme（与 Douban startThemeAttrSync 同一解析
 *      规则，零漂移），立即落 html[data-umm-theme] + 涂刷 html,body 主题
 *      表面背景（色值与 --usl-surface 同源；body 必须覆盖——Discuz 自带
 *      body 背景）；
 *   2. 存储变更/系统配色切换全程保鲜（页面生命周期内）。
 */
export default defineContentScript({
  matches: [
    '*://www.sehuatang.net/forum*',
    '*://www.sehuatang.org/forum*',
    '*://sehuatang.net/forum*',
    '*://sehuatang.org/forum*',
  ],
  runAt: 'document_start',

  main() {
    subscribeTheme((theme) => {
      document.documentElement.setAttribute('data-umm-theme', theme)
      paintSehuatangBackground(document, theme)
    })
  },
})
