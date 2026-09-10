/**
 * 色花堂 overlay 共享常量（零依赖模块——早期入口与主入口都要引用，
 * 独立成文件避免早期入口为取一个 ID 而拖入整张样式表）。
 */

/** Shadow host 元素 ID（早期入口创建，主入口接管）。 */
export const SEHUATANG_OVERLAY_ID = 'umm-sht-overlay'

/**
 * overlay host 的页面级 z-index：高于 Discuz 自有固定元素（对话框/回顶部
 * 等 z 1000+ 量级），低于全局 light-DOM 弹层 .umm-overlay（2147483001，
 * 菜单/手动添加/查询面板仍浮现于 overlay 之上）。
 */
export const SEHUATANG_OVERLAY_Z_INDEX = 2147483000

/** 早期入口识别的 4 个受支持 locale（与 i18n/locales.ts 的 Locale 联合一致）。 */
export type EarlyLocale = 'en-US' | 'zh-CN' | 'zh-HK' | 'zh-TW'

/**
 * 首帧 loading 副标题（早期入口 document_start 与风控自建壳共用——单一事实源）。
 *
 * document_start 阶段不加载 i18n 运行时——引入完整 locale 表会让 ~8 kB 的
 * early bundle 膨胀数倍，故只内联这一条文案的 4 语言副本；风控页自建壳
 * （app-risk 的 createDetachedOverlay）在 i18n 初始化前同样需要它，复用
 * 同一份避免文案漂移。
 */
export const LOADING_SUBTITLE: Record<EarlyLocale, string> = {
  'en-US': 'Loading...',
  'zh-CN': '加载中...',
  'zh-HK': '載入中...',
  'zh-TW': '載入中...',
}

/**
 * 同步 locale 解析：只用同步可得的来源（localStorage → navigator.language）。
 * 与 content/i18n 的 detectLocale 优先级顺序一致，但**缺 chrome.storage 分支**
 * ——那是异步 API，document_start 不等它，故仅在用户经 localStorage 设过
 * locale 时才会命中第一分支。
 */
export function resolveEarlyLocale(): EarlyLocale {
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
