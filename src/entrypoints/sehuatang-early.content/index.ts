import { defineContentScript } from 'wxt/utils/define-content-script'
import { subscribeTheme } from '@/content/douban/overlay/theme-sync'
import { createOverlay } from '@/content/douban/overlay/create-overlay'
import { paintSehuatangBackground } from '@/entrypoints/content/handlers/sehuatang-controls'
import { isForumDisplayUrl } from '@/content/sehuatang/url'
import { SEHUATANG_OVERLAY_ID, SEHUATANG_OVERLAY_Z_INDEX } from '@/content/sehuatang/constants'

/**
 * 色花堂早期入口（document_start）：首帧背景预载 + 主题属性保鲜 +
 * 列表页 Shadow DOM overlay 首帧覆盖（ADR-024 D1）。
 *
 * 主 content 脚本在 document_idle 才挂载 overlay 内容，此前用户会看到站点
 * 原始页面（主题背景晚到 → 跳变闪烁；Discuz 页头/广告完整渲染）。本入口在
 * 首帧前：
 *   1. 消费共享 subscribeTheme（与 Douban startThemeAttrSync 同一解析
 *      规则，零漂移），立即落 html[data-umm-theme] + 涂刷 html,body 主题
 *      表面背景（body 必须覆盖——Discuz 自带 body 背景）；
 *   2. URL 判型命中 forumdisplay 列表页 → createOverlay 建 fixed 全屏
 *      shadow host + loading 骨架，首帧即覆盖原页面（零 FOUC）；
 *      主入口（sehuatang-main.content）在 document_idle 接管该 host。
 *   3. 存储变更/系统配色切换全程保鲜（页面生命周期内）。
 */
/** 早期入口识别的 4 个受支持 locale（与 i18n/locales.ts 的 Locale 联合一致）。 */
type EarlyLocale = 'en-US' | 'zh-CN' | 'zh-HK' | 'zh-TW'

/**
 * 首帧 loading 副标题：**本文件唯一的有意文案重复**。
 *
 * document_start 阶段不加载 i18n 运行时——引入完整 locale 表会让这个
 * ~8 kB 的 early bundle 膨胀数倍。故只内联这一条文案的 4 语言副本
 * （content/i18n/locales.ts 的对应键为 'Loading...' 系列文案，非独立键；
 * 本项目其它 loading 文案走 shared/locales 的 common.loading）。
 */
const LOADING_SUBTITLE: Record<EarlyLocale, string> = {
  'en-US': 'Loading...',
  'zh-CN': '加载中...',
  'zh-HK': '載入中...',
  'zh-TW': '載入中...',
}

/**
 * 同步 locale 解析：只用同步可得的来源（localStorage → navigator.language）。
 * 与 content/i18n 的 detectLocale 优先级顺序一致，但**缺 chrome.storage 分支**
 * ——那是异步 API，document_start 不等它，故本入口仅在用户经 localStorage
 * 设过 locale 时才会命中第一分支。
 */
function resolveEarlyLocale(): EarlyLocale {
  try {
    const stored = localStorage.getItem('umm:locale') as EarlyLocale | null
    if (stored && stored in LOADING_SUBTITLE) return stored
  } catch {
    // localStorage 不可用（罕见）→ 继续用浏览器语言
  }
  const lang = navigator.language || ''
  if (lang.startsWith('zh')) {
    if (lang.includes('TW')) return 'zh-TW'
    if (lang.includes('HK')) return 'zh-HK'
    // 无地区后缀 / 仅 Hant 标记的传统中文（macOS・iOS 常见 zh-Hant）
    if (lang.includes('Hant')) return 'zh-TW'
    return 'zh-CN'
  }
  return 'en-US'
}

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
    // URL 判型先行（DOM 未就绪无法读表格）；forum.php?mod=viewthread 等
    // 非列表页不建覆盖层。主入口另有 #threadlisttableid DOM 守卫兜底。
    if (isForumDisplayUrl(location.href)) {
      createOverlay({
        overlayId: SEHUATANG_OVERLAY_ID,
        subtitle: LOADING_SUBTITLE[resolveEarlyLocale()],
        zIndex: SEHUATANG_OVERLAY_Z_INDEX,
      })
    }
  },
})
