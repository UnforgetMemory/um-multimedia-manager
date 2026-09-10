/**
 * 色花堂帖子标题 → AV 番号提取（纯函数）。
 *
 * 日系番号：兼容 FC2 混排前缀（FC2PPV-44580 / FC2-PPV-44580）：旧正则
 * `[a-zA-Z]{2,6}[-\s]?\d{2,5}` 的字母段不能跨越数字，只能截到
 * "PPV-44580"，导致历史已看标记查不到（dimmer 失效）。新形态：
 * 1 个字母开头 + 1–7 个字母/数字/连字符 + 可选连字符/空格 + ≥2 位数字。
 *
 * 美系/欧系厂牌番号（us-av-id）：Studio.YY.MM.DD 点分日期形态
 * （BigTitsRoundAsses.23.06.10 / MommyGotBoobs.21.03.09），厂牌段允许内部
 * 点分段（Blacked.Raw.23.01.15）。**月/日只校验最后两段**
 * （`parts[length-2]` / `parts[length-1]`，各限 01-12 / 01-31）：
 * 末两段越界的串被挡掉（Studio.23.13.01 → null），但末两段恰好合法的
 * 版本串仍会误判（v2.23.06.10 → 末两段 06/10 → 命中），与 x265-10bit
 * 同类，属可接受交换（见 sehuatang-extract.spec 的固化断言）。
 * 提取顺序：日系优先（既有行为），美系兜底；均无 → null（调用方回退 TID）。
 *
 * 输出经 normalizeAvId 归一化（大写 + 空格→连字符），保证与后台保存键
 * 与 batchCheckExists 返回集往返一致（空格形态 "ABC 123" → "ABC-123"）。
 *
 * 已知取舍：分辨率类文本做显式守卫（HD/FHD/UHD/QHD 前缀 + 480/720/1080/
 * 1440/2160/4320 数字组合整体跳过），若标题中全部候选都是分辨率形态则
 * 返回 null（宁可 null 走 TID 兜底，不落垃圾 ID）。
 */

import { normalizeAvId } from '@/features/adult-av/models'
import { extractThreadTidFromUrl } from '@/content/sehuatang/url'

/** TID 键提取的唯一实现在 url.ts（早期入口判型 / 列表行解析 / 帖子页记录
 *  三处共用，避免正则漂移）；此处按既有导出名转出，消费方零改动。 */
export { extractThreadTidFromUrl as extractThreadIdFromUrl } from '@/content/sehuatang/url'

const AVID_REGEX = /[A-Za-z][A-Za-z0-9-]{1,7}[-\s]?\d{2,}/g

/** 美/欧厂牌：字母起始段（可含数字）+ 可含内部点分段 + .YY.MM.DD 收尾。 */
const US_AVID_REGEX = /[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)*\.\d{2}\.\d{2}\.\d{2}/g

/** Resolution-pattern guards: HD/FHD/UHD/QHD prefixes with standard pixel counts. */
const RESOLUTION_LETTERS = /^(HD|FHD|UHD|QHD|SD)$/i
const RESOLUTION_DIGITS = /^(480|720|1080|1440|2160|4320)$/

/** 从标题提取美/欧厂牌番号（Studio.YY.MM.DD，归一化大写）；日期段非法 → 跳过。 */
export function extractUsAvIdFromTitle(title: string): string | null {
  for (const match of title.matchAll(US_AVID_REGEX)) {
    const raw = match[0]
    const parts = raw.split('.')
    const month = parseInt(parts[parts.length - 2]!, 10)
    const day = parseInt(parts[parts.length - 1]!, 10)
    if (month < 1 || month > 12 || day < 1 || day > 31) continue
    return normalizeAvId(raw)
  }
  return null
}

/** 从标题提取番号（大写，空格归一为连字符）；日系优先、美系兜底；全部候选非法 → null。 */
export function extractAvIdFromTitle(title: string): string | null {
  const trimmed = title.trim()
  for (const match of trimmed.matchAll(AVID_REGEX)) {
    const raw = match[0]
    const letters = raw.replace(/[-\s]?\d+$/, '')
    const digits = raw.match(/(\d+)$/)?.[1] ?? ''
    if (RESOLUTION_LETTERS.test(letters) && RESOLUTION_DIGITS.test(digits)) continue
    return normalizeAvId(raw)
  }
  return extractUsAvIdFromTitle(trimmed)
}

/** 帖子行解析结果（parseThreadRow 输出）。 */
export interface SehuatangThread {
  url: string
  title: string
  avId: string | null
  releaseDate: string
  /** 帖子 tid 键（TID-<tid>，thread URL 自带）；URL 无 tid → null。 */
  tid: string | null
  /**
   * 主跟踪键：avId 优先，提取失败时回退 tid（写入/主判定用）。
   * 三表互不冲突——has id → jav_ids/usav_ids；无 id → sehuatang_ids。
   */
  trackId: string | null
}

/**
 * 候选判定键集合（avId + tid，去重大写）——dimmer 兜底链的输入。
 *
 * 已看判定必须同时携带番号键与 TID 键：番号由列表页/帖子页写入两番号表，
 * TID 由帖子页（提取失败时）写入 sehuatang_ids；任一命中即视为已看，
 * 否则「列表页有番号、帖子页无番号」的同一帖子会出现 dimmer 失效。
 */
export interface ThreadTrackSource {
  avId?: string | null
  tid?: string | null
  trackId?: string | null
}

/**
 * 三键并收（`trackId` 已含 `avId ?? tid` 的兜底语义，此处仍逐字段遍历）：
 * 调用方可能只填部分字段（如仅 avId，或仅 tid），逐字段收可在任一子集下
 * 都不丢键；`Set` 去重保证 trackId 与 avId/tid 重叠时不产生重复候选。
 */
export function collectThreadTrackKeys(threads: ThreadTrackSource[]): string[] {
  const keys = new Set<string>()
  for (const thread of threads) {
    for (const key of [thread.avId, thread.tid, thread.trackId]) {
      if (key) keys.add(key.toUpperCase())
    }
  }
  return Array.from(keys)
}

/**
 * 帖子详情页（viewthread）静默记录的键解析（纯函数）：标题可提取番号 →
 * 番号（分类落 jav_ids/usav_ids）；提取失败 → TID（兜底落 sehuatang_ids）。
 * 与列表行 parseThreadRow 同一优先级，保证两处写键一致。
 */
export function resolveThreadWatchKey(title: string, url: string): string | null {
  return extractAvIdFromTitle(title) ?? extractThreadTidFromUrl(url)
}

/** 仅提取到 TID 的跟踪键形态（无番号，avId 提取失败的兜底键）。 */
const TID_ONLY_KEY_RE = /^TID-\d+$/

/**
 * 「点击跳转即 dimmer」的适用判定（纯函数，入参 = 卡片可观测状态）。
 *
 * 适用面（并集）：
 *   ① 仅提取到 TID 的条目 —— 没有番号，走「复制磁力」这条自动落库路径不自然；
 *   ② 详情子请求**已结束**但仍无磁力的条目 —— 没有磁力可复制。
 * 「未结束」的条目刻意排除：此刻还不知道最终有没有磁力，不应提前下判断。
 *
 * 命中者只做**页面状态**变更（加 dimmer），不做数据变更——跳转后的帖子页
 * 由 sehuatang-main.content 的静默记录逻辑落库，此处落库属冗余。
 */
export function shouldDimOnNavigate(state: {
  /** 卡片主跟踪键（= avId ?? tid，对应 data-avid）。 */
  trackId: string | null
  /** 详情子请求是否已结束（data-umm-detail === 'done'）。 */
  detailSettled: boolean
  /** 卡片内是否已产出磁力锚点。 */
  hasMagnet: boolean
}): boolean {
  const { trackId, detailSettled, hasMagnet } = state
  if (!trackId) return false
  if (TID_ONLY_KEY_RE.test(trackId)) return true
  return detailSettled && !hasMagnet
}

/**
 * 帖子行（tbody[id^="normalthread_"]）→ 线程数据；缺标题链接 → null。
 * 行 ID（normalthread_<tid>）是 AJAX 分页去重的唯一键。
 * 标题取 innerText（排除隐藏子节点文本），jsdom 不支持时回退 textContent。
 */
export function parseThreadRow(row: Element): SehuatangThread | null {
  const linkEl = row.querySelector('th a.s.xst') as HTMLAnchorElement | null
  if (!linkEl) return null
  const title = (((linkEl as HTMLElement).innerText || linkEl.textContent) ?? '').trim()
  const avId = extractAvIdFromTitle(title)
  const tid = extractThreadTidFromUrl(linkEl.href)
  return {
    url: linkEl.href,
    title,
    avId,
    releaseDate: (row.querySelector('td.by em span') as HTMLElement | null)?.textContent?.trim() || 'N/A',
    tid,
    trackId: avId ?? tid,
  }
}

/**
 * 从 MutationRecord 收集新帖子行（AJAX 静态地址分页：URL 不变、行追加到
 * 原表格）。addedNodes 可能是 tbody 本身、其容器或 <tr>（经 closest 归属
 * tbody）；processed 集合同步去重（记录 normalthread_<tid> 键），返回本轮新行。
 */
export function collectNewThreadRows(mutations: MutationRecord[], processed: Set<string>): Element[] {
  const rows: Element[] = []
  for (const mutation of mutations) {
    for (const node of Array.from(mutation.addedNodes)) {
      if (node.nodeType !== 1) continue
      const el = node as Element
      if (el.tagName === 'TR') {
        const tb = el.closest('tbody')
        if (tb?.id.startsWith('normalthread_')) rows.push(tb)
        continue
      }
      if (el.tagName === 'TBODY' && el.id.startsWith('normalthread_')) rows.push(el)
      rows.push(...Array.from(el.querySelectorAll('tbody[id^="normalthread_"]')))
    }
  }
  const fresh = rows.filter((row) => row.id && !processed.has(row.id))
  for (const row of fresh) if (row.id) processed.add(row.id)
  return fresh
}

/**
 * 初始进程（首次加载/分页切换）已看分离：hide 启用时不渲染已看线程，
 * 仅返回可见集合与隐藏计数。运行时（点击/复制）的标记走 dimmer 路径，
 * 不经此函数——「初始只隐藏，非初始只 dim」语义的纯逻辑载体。
 *
 * 判定键 = trackId 与 tid 双键命中（任一在已看集即隐藏）：trackId 覆盖
 * 番号表（jav_ids/usav_ids），tid 覆盖 sehuatang_ids 帖子浏览记录兜底。
 */
export function partitionInitialVisible<T extends { trackId: string | null; tid?: string | null }>(
  threads: T[],
  watchedIds: Set<string>,
): { visible: T[]; hiddenCount: number } {
  if (watchedIds.size === 0) return { visible: threads, hiddenCount: 0 }
  // 归一化大写：生产侧 batchCheckExists 返回大写，防御任意调用方输入。
  const upper = new Set(Array.from(watchedIds, (id) => id.toUpperCase()))
  const visible: T[] = []
  let hiddenCount = 0
  for (const thread of threads) {
    const watched = [thread.trackId, thread.tid].some((key) => !!key && upper.has(key.toUpperCase()))
    if (watched) hiddenCount++
    else visible.push(thread)
  }
  return { visible, hiddenCount }
}
