/**
 * 色花堂风控页（年龄门）检测与提取（纯函数，Document → 数据）。
 *
 * 为什么是 DOM 检测而不是 URL 判型：风控页可由**任意路径**返回（站点根 /
 * 分区 / 帖子 / 搜索 / portal 均可能命中），URL 完全不可预判——classifyPage
 * 的 URL 体系对它失效。判定依据 = 风控页特有 DOM 双标记（与正常 Discuz
 * 页面零交集，双 AND 严防误判）：
 *   1. `div.domain`——站点域名大字标题（站点 JS 会覆写为 document.domain
 *      大写形态）；正常 Discuz 页无此类；
 *   2. `a.enter-btn[href]`——进入按钮 ≥1；站点 JS 把它的 click 绑定为
 *      「写 safeid cookie + 重载当前页」，是通过风控的唯一途径。
 *
 * 功能保全红线：重建 UI 的进入按钮必须**委托点击原 DOM 按钮**（处理器绑在
 * 原元素上，克隆/自建都拿不到 cookie 写入逻辑）——提取层因此按文档序返回
 * 按钮（index），供编排层按序委托。
 */

export interface SehuatangRiskEnter {
  /** 按钮文案（站点原文，空白归一化；中英各一）。 */
  label: string
  /** href 原始值（相对/绝对均可；兜底导航前由编排层绝对化+白名单）。 */
  href: string
}

/** 风控页内容（全部透传站点原文，零改写）。 */
export interface SehuatangRiskGate {
  /** 域名大字标题（如 SEHUATANG.NET）。 */
  domain: string
  /** 进入按钮（文档序）。 */
  enters: SehuatangRiskEnter[]
  /** 警告块标题（如「警告 / WARNING」），无 → null。 */
  warningTitle: string | null
  /** 警告段文本（按 DOM 序；中文警告在前，英文在后）。 */
  warnings: string[]
}

/** 空白归一化（风控页源码含大量缩进换行）。 */
function normalizeText(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim()
}

/**
 * 风控页判定（廉价守卫，主入口在 classifyPage 之前调用）。
 * 双标记 AND：div.domain（非空文本）+ a.enter-btn[href]（≥1）。
 */
export function isRiskGateDocument(doc: Document): boolean {
  const domain = doc.querySelector('div.domain')
  if (!domain || !normalizeText(domain.textContent)) return false
  return doc.querySelectorAll('a.enter-btn[href]').length > 0
}

/**
 * 提取风控页内容。判定失败（非风控页）→ null，由编排层 dismiss 兜底。
 * 提取在站点脚本执行完毕后进行（document_idle）——div.domain 的文本已是
 * 站点 JS 覆写后的最终值，透传即可。
 */
export function extractRiskGate(doc: Document): SehuatangRiskGate | null {
  if (!isRiskGateDocument(doc)) return null

  const domain = normalizeText(doc.querySelector('div.domain')?.textContent)
  const enters: SehuatangRiskEnter[] = Array.from(
    doc.querySelectorAll<HTMLAnchorElement>('a.enter-btn'),
  ).map((a) => ({
    label: normalizeText(a.textContent),
    href: a.getAttribute('href') ?? '',
  }))

  const downContent = doc.querySelector('.down-content')
  const warningTitle = normalizeText(downContent?.querySelector('h3')?.textContent) || null
  const warnings = Array.from(downContent?.querySelectorAll('p') ?? [])
    .map((p) => normalizeText(p.textContent))
    .filter((text) => text.length > 0)

  return { domain, enters, warningTitle, warnings }
}
