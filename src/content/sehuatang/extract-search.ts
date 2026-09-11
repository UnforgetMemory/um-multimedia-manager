/**
 * 色花堂搜索页（search.php?mod=forum）结果提取（纯函数，Element → 数据）。
 *
 * 搜索结果形态：每个结果是 `<li class="pbw" id="<tid>">`，
 * 内部结构（p 顺序经 .localref 夹具核实）：
 *   - h3.xs3 > a（标题链接，href = `forum.php?mod=viewthread&tid=...`）
 *   - p.xg1（"1 个回复 - 507 次查看"）
 *   - p（站点摘要位：多数条目为「内容隐藏需要…」提示，老帖为内容预览）
 *   - p（时间 - 作者链接 - 版块链接：`<a class="xi1">求片问答悬赏区</a>`）
 *
 * 与列表页（forumdisplay）的差异：
 *   - 列表页帖子行 = `<tbody id="normalthread_<tid>">`，URL 是 `thread-<tid>.html`；
 *   - 搜索页条目 = `<li id="<tid>">`，URL 是 `forum.php?mod=viewthread&tid=<tid>`。
 *   - 列表页有磁力提取/详情懒加载；搜索页是导航层，**不抓磁力、不渲染
 *     详情**，仅 dimmer（用 avId + tid 双键）。
 *
 * 「版块链接」（`forum-X-1.html`）是用户已识别的**无用分区噪音**——如「求片
 * 问答悬赏区」「资源出售区」等与本工具管理记录无直接关系，不提取也不渲染。
 *
 * 字段语义与列表页 SehuatangThread 对齐（tid = `TID-<tid>` 跟踪键），
 * collectThreadTrackKeys 可直接消费，无需调用侧字段映射。
 *
 * DOM 守卫：必须存在至少一个 li.pbw[id] 且其中必须包含 h3 > a；否则返回 []。
 */

import { extractAvIdFromTitle } from '@/entrypoints/content/handlers/sehuatang-extract'
import { extractThreadTidFromUrl } from './url'

export interface SehuatangSearchResult {
  /** TID 跟踪键（`TID-<tid>`，与列表页 SehuatangThread.tid 同形态）；URL 缺 tid → null。 */
  tid: string | null
  /** 标题（含可能的番号）。trim 后的纯文本。 */
  title: string
  /** 从标题提取的 avId（大写归一）；无 → null。 */
  avId: string | null
  /** 主跟踪键（avId 优先，提取失败时回退 tid 键）。 */
  trackId: string | null
  /** 帖子 URL（取自 anchor.href 属性，浏览器自动绝对化）。 */
  url: string
  /** "1 个回复 - 507 次查看" 解析后（支持「N万」计数），失败 → null。 */
  replies: number | null
  views: number | null
  /** 作者用户名（页面上的展示名），无 → null。 */
  author: string | null
  /** 发布时间原始文本（如 "2026-08-02 00:28"），无 → null。 */
  postedAt: string | null
  /** 站点摘要位原文（多数条目 = 「内容隐藏需要…」提示，老帖 = 内容预览），无 → null。 */
  preview: string | null
  /**
   * 所在分区 id（解析自「版块链接」`forum-<id>-<page>.html`），无 → null。
   * **仅作无关分区噪音过滤依据（isSearchNoiseForum），不渲染**——「版块链接」
   * 本身是用户已识别的无用分区噪音。
   */
  forumId: number | null
}

/**
 * 无关分区噪音清单（搜索结果过滤用）。
 *
 * 事实源：.localref 搜索夹具逐条核实——forum-143 =「求片问答悬赏区」（用户
 * 裁决：与记录管理无关的无意义内容）；同夹具中 forum-95 =「综合讨论区」为
 * 正常分区，**不在此列**。扩展点：后续再识别出无关分区 → 在此追加 id。
 */
export const SEARCH_NOISE_FORUM_IDS: ReadonlySet<number> = new Set([143])

/** 噪音分区判定（纯函数，JSDOM 可测）：null 恒为正常（无分区信息不过滤）。 */
export function isSearchNoiseForum(forumId: number | null): boolean {
  return forumId !== null && SEARCH_NOISE_FORUM_IDS.has(forumId)
}

/** 计数解析：「507」/「1.2万」→ 数值（万 → ×10000 取整）；非数字 → null。 */
function parseCnCount(raw: string): number | null {
  const m = /^([\d.]+)\s*(万?)$/.exec(raw.trim())
  if (!m) return null
  const n = Number.parseFloat(m[1]!)
  if (!Number.isFinite(n)) return null
  return m[2] === '万' ? Math.round(n * 10000) : Math.round(n)
}

const REPLIES_VIEWS_RE = /([\d.]+\s*万?)\s*个回复[^\d.]+([\d.]+\s*万?)\s*次查看/

/**
 * 解析单条 li.pbw[id] → 搜索结果。
 * 缺主标题链接 → null（非法行）。
 */
export function parseSearchResultRow(li: Element): SehuatangSearchResult | null {
  const tidNum = li.id
  if (!tidNum || !/^\d+$/.test(tidNum)) return null

  const titleLink = li.querySelector('h3 a') as HTMLAnchorElement | null
  if (!titleLink) return null
  // anchor.href 属性（非 getAttribute）：浏览器自动绝对化——在线页面的
  // href 是相对 URL（forum.php?mod=viewthread&tid=...），getAttribute 原样
  // 返回会让 extractThreadTidFromUrl 的 new URL 抛错、TID 键断链。
  const url = titleLink.href
  const title = (titleLink.textContent ?? '').trim()
  if (!title) return null

  const avId = extractAvIdFromTitle(title)
  const tid = extractThreadTidFromUrl(url)

  // 回复/查看
  const metaLine = (li.querySelector('p.xg1')?.textContent ?? '').trim()
  let replies: number | null = null
  let views: number | null = null
  const rm = REPLIES_VIEWS_RE.exec(metaLine)
  if (rm) {
    replies = parseCnCount(rm[1]!)
    views = parseCnCount(rm[2]!)
  }

  // 时间 / 作者：找含 `<a href="space-uid-*">` 的 p 节点（p 顺序无关，最稳）。
  const ps = Array.from(li.querySelectorAll('p'))
  let postedAt: string | null = null
  let author: string | null = null
  for (const p of ps) {
    if (p.querySelector('a[href*="space-uid"]')) {
      // 取第一个 span 文本为发布时间
      const firstSpan = p.querySelector('span')
      postedAt = (firstSpan?.textContent ?? '').trim() || null
      const authorLink = p.querySelector('a[href*="space-uid"]')
      author = (authorLink?.textContent ?? '').trim() || null
      break
    }
  }

  // 站点摘要位：第一个既非 xg1 也无 space-uid 的非空 p——多数条目是
  // 「内容隐藏需要，请点击进去查看」提示，老帖是内容预览；原样透传，
  // 不做语义加工（站点显示什么就显示什么）。
  let preview: string | null = null
  for (const p of ps) {
    if (p.classList.contains('xg1')) continue
    if (p.querySelector('a[href*="space-uid"]')) continue
    const text = (p.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (text) {
      preview = text
      break
    }
  }

  // 所在分区 id：夹具核实「版块链接」与时间/作者同段（`forum-<id>-<page>.html`）。
  // 取 li 内首个命中即可（结果条目只有一个分区归属）。
  let forumId: number | null = null
  const forumLink = li.querySelector('a[href*="forum-"]')
  if (forumLink) {
    const fm = /forum-(\d+)-\d+\.html/i.exec(forumLink.getAttribute('href') ?? '')
    if (fm) forumId = Number.parseInt(fm[1]!, 10)
  }

  return {
    tid,
    title,
    avId,
    trackId: avId ?? tid,
    url,
    replies,
    views,
    author,
    postedAt,
    preview,
    forumId,
  }
}

/**
 * 提取搜索结果列表（ul#threadlist > li.pbw[id]）。
 * DOM 守卫：必须找到 #threadlist 且至少一个 li.pbw → 否则返回 []。
 */
export function extractSearchResults(): SehuatangSearchResult[] {
  const ul = document.getElementById('threadlist')
  if (!ul) return []
  const items = Array.from(ul.querySelectorAll('li.pbw[id]'))
  const out: SehuatangSearchResult[] = []
  for (const li of items) {
    const row = parseSearchResultRow(li)
    if (row) out.push(row)
  }
  return out
}

/**
 * 提取结果计数 + 关键词（#ct 内的 h2 节点——夹具核实「结果:」h2 在 #ct 内、
 * #threadlist 之外；收紧容器避免全文档 h2 的误报面）。
 * 形态：`<h2>结果: <em>找到 "<span>自行打包</span>" 相关内容 77 个</em> </h2>`
 * 失败 → null（编排层据此降级显示「搜索结果」）。
 */
export interface SehuatangSearchMeta {
  keyword: string
  count: number
}

export function extractSearchMeta(): SehuatangSearchMeta | null {
  // 找包含「结果:」的 h2
  const headings = Array.from(document.querySelectorAll('#ct h2'))
  for (const h2 of headings) {
    const text = (h2.textContent ?? '').trim()
    if (!/结果[:：]/.test(text)) continue
    const span = h2.querySelector('span')
    const emText = (h2.querySelector('em')?.textContent ?? '').trim()
    const countMatch = /(\d+)\s*个/.exec(emText)
    if (!countMatch) continue
    return {
      keyword: (span?.textContent ?? '').trim() || '',
      count: parseInt(countMatch[1]!, 10),
    }
  }
  return null
}
