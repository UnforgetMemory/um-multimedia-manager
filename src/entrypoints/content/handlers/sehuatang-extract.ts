/**
 * 色花堂帖子标题 → AV 番号提取（纯函数）。
 *
 * 兼容 FC2 混排前缀（FC2PPV-44580 / FC2-PPV-44580）：旧正则
 * `[a-zA-Z]{2,6}[-\s]?\d{2,5}` 的字母段不能跨越数字，只能截到
 * "PPV-44580"，导致历史已看标记查不到（dimmer 失效）。新形态：
 * 1 个字母开头 + 1–7 个字母/数字/连字符 + 可选连字符/空格 + ≥2 位数字。
 *
 * 输出经 normalizeAvId 归一化（大写 + 空格→连字符），保证与后台保存键
 * 与 batchCheckExists 返回集往返一致（空格形态 "ABC 123" → "ABC-123"）。
 *
 * 已知取舍：分辨率类文本做显式守卫（HD/FHD/UHD/QHD 前缀 + 480/720/1080/
 * 1440/2160/4320 数字组合整体跳过），若标题中全部候选都是分辨率形态则
 * 返回 null（宁可 null 走 TID 兜底，不落垃圾 ID）；中段允许数字是为兼容
 * FC2 混排前缀（x265-10bit 类误报为已知剩余面，属可接受交换）。
 */

import { normalizeAvId } from '@/features/adult-av/models'

const AVID_REGEX = /[A-Za-z][A-Za-z0-9-]{1,7}[-\s]?\d{2,}/g

/** Resolution-pattern guards: HD/FHD/UHD/QHD prefixes with standard pixel counts. */
const RESOLUTION_LETTERS = /^(HD|FHD|UHD|QHD|SD)$/i
const RESOLUTION_DIGITS = /^(480|720|1080|1440|2160|4320)$/

/** 从标题提取番号（大写，空格归一为连字符）；全部候选为分辨率形态 → null。 */
export function extractAvIdFromTitle(title: string): string | null {
  for (const match of title.trim().matchAll(AVID_REGEX)) {
    const raw = match[0]
    const letters = raw.replace(/[-\s]?\d+$/, '')
    const digits = raw.match(/(\d+)$/)?.[1] ?? ''
    if (RESOLUTION_LETTERS.test(letters) && RESOLUTION_DIGITS.test(digits)) continue
    return normalizeAvId(raw)
  }
  return null
}

/** 帖子行解析结果（parseThreadRow 输出）。 */
export interface SehuatangThread {
  url: string
  title: string
  avId: string | null
  releaseDate: string
  /** 跟踪键：avId 缺失时回退 TID-<tid>（thread URL 自带）——已看/隐藏全量覆盖。 */
  trackId: string | null
}

/** 从帖子 URL 提取 tid（/thread-(\d+) 形态）；无 → null。 */
export function extractThreadIdFromUrl(url: string): string | null {
  const match = /\/thread-(\d+)/.exec(url)
  return match ? `TID-${match[1]}` : null
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
  return {
    url: linkEl.href,
    title,
    avId,
    releaseDate: (row.querySelector('td.by em span') as HTMLElement | null)?.textContent?.trim() || 'N/A',
    trackId: avId ?? extractThreadIdFromUrl(linkEl.href),
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
 * 判定键 = trackId（avId 缺失时回退 TID-<tid>），全量覆盖。
 */
export function partitionInitialVisible<T extends { trackId: string | null }>(
  threads: T[],
  watchedIds: Set<string>,
): { visible: T[]; hiddenCount: number } {
  if (watchedIds.size === 0) return { visible: threads, hiddenCount: 0 }
  // 归一化大写：生产侧 batchCheckExists 返回大写，防御任意调用方输入。
  const upper = new Set(Array.from(watchedIds, (id) => id.toUpperCase()))
  const visible: T[] = []
  let hiddenCount = 0
  for (const thread of threads) {
    if (thread.trackId && upper.has(thread.trackId.toUpperCase())) hiddenCount++
    else visible.push(thread)
  }
  return { visible, hiddenCount }
}
