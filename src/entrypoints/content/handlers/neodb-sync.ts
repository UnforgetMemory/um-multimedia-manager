/**
 * NeoDB 跨平台同步的纯决策逻辑（无 DOM / chrome / IndexedDB 依赖）。
 *
 * 从 neodb.ts onSave 内联逻辑抽取（audit §2.3, T12 2026-08-03）：
 *  - 构建器（buildNeoDBLinkedIds / buildNeoDBSyncTargets / buildNeoDBSyncRecord /
 *    shouldSaveNeoDBPrimary / platformLabel）现被 neodb.ts onSave 直接使用，
 *    作为委托 RecordService 前的输入构建器。
 *  - 旧内联目标决策（decideNeoDBTargetSync / mergeTargetLinkedIds）编码的是
 *    **旧内联规则**（create-if-missing / update-if-not-watched /
 *    link-only-if-watched / never-overwrite-linked-rating），已被
 *    RecordService.syncRecord（经 DB_SYNC_PAGE_RECORD 消息）取代；
 *    保留导出仅为特征测试锁定 + 双实现漂移的对照文档（fork 决策 (b)，见任务报告）。
 */

import { UrlResolverBuilder } from '@/shared/identity'
import type { Provider } from '@/config'
import type { UrlIdentity, StoreRecord } from '@/types'
import type { PageScanResult } from './create-detail-handler'

/**
 * 从页面提取的跨平台链接（provider + url）归一化为 linkedIds 映射。
 * 逐字对应旧内联逻辑 neodb.ts onSave 中的 reduce。
 */
export function buildNeoDBLinkedIds(
  linkedIdentities: Array<{ provider: string; url: string }>,
): Record<string, string> {
  return linkedIdentities.reduce((acc, linked) => {
    const targetId = UrlResolverBuilder.fromUrl(linked.url)
    if (targetId) {
      acc[targetId.platform] = `${targetId.type}::${targetId.providerId}`
    }
    return acc
  }, {} as Record<string, string>)
}

/**
 * 将跨平台链接解析为 RecordService 的 SyncTarget 列表（{platform, key, url}）。
 * 无法解析的 URL 被跳过（对应旧内联逻辑的 continue 分支）。
 */
export function buildNeoDBSyncTargets(
  linkedIdentities: Array<{ provider: string; url: string }>,
): Array<{ platform: Provider; key: string; url: string }> {
  const targets: Array<{ platform: Provider; key: string; url: string }> = []
  for (const linked of linkedIdentities) {
    const targetId = UrlResolverBuilder.fromUrl(linked.url)
    if (!targetId) continue
    targets.push({
      platform: targetId.platform,
      key: `${targetId.type}::${targetId.providerId}`,
      url: UrlResolverBuilder.buildUrl(targetId.type, targetId.platform, targetId.providerId),
    })
  }
  return targets
}

/**
 * 构建传给 syncRecord 的 NeoDB 主记录。
 * 合并旧内联逻辑的两个分支：
 *  - 页面已完成 → status 2 + pageState.rating
 *  - 页面未完成 → 保留 localRecord 的 status/rating（缺省 0）
 */
export function buildNeoDBSyncRecord(params: {
  identity: UrlIdentity
  pageState: PageScanResult
  localRecord: StoreRecord | null
  isPageDone: boolean
  linkedIds: Record<string, string>
  now?: string
}): StoreRecord {
  const { identity, pageState, localRecord, isPageDone, linkedIds } = params
  const now = params.now ?? new Date().toISOString()
  return {
    url: identity.url,
    status: isPageDone ? 2 : (localRecord?.status ?? 0),
    rating: isPageDone ? pageState.rating : (localRecord?.rating ?? 0),
    comment: localRecord?.comment ?? '',
    updatedAt: now,
    linkedIds,
  }
}

/**
 * 旧内联规则：主记录是否值得保存。
 *  - 页面已完成：status / rating / linkedIds 任一变化或记录不存在
 *  - 页面未完成：记录不存在或 linkedIds 变化（确保关联不丢失）
 */
export function shouldSaveNeoDBPrimary(params: {
  isPageDone: boolean
  localRecord: StoreRecord | null
  pageState: PageScanResult
  linkedIds: Record<string, string>
}): boolean {
  const { isPageDone, localRecord, pageState, linkedIds } = params

  if (isPageDone) {
    const statusChanged = localRecord?.status !== 2
    const ratingChanged = localRecord?.rating !== pageState.rating
    const linkedChanged = JSON.stringify(localRecord?.linkedIds || {}) !== JSON.stringify(linkedIds)
    return statusChanged || ratingChanged || linkedChanged || !localRecord
  }

  return !localRecord || JSON.stringify(localRecord.linkedIds || {}) !== JSON.stringify(linkedIds)
}

/**
 * 旧内联规则：目标记录的 linkedIds = 保留已有 + 确保回到 NeoDB。
 */
export function mergeTargetLinkedIds(
  existingLinkedIds: Readonly<Record<string, string>> | undefined,
  neodbKey: string,
): Record<string, string> {
  return { ...(existingLinkedIds || {}), neodb: neodbKey }
}

/** 旧内联规则中目标平台的展示名（toast 用）。 */
export function platformLabel(platform: string): string {
  return platform === 'imdb' ? 'IMDb' : platform === 'tmdb' ? 'TMDB' : '豆瓣'
}

/** decideNeoDBTargetSync 中 'update' 动作要写回目标记录的字段。 */
export interface NeoDBTargetUpdate {
  status: number
  rating: number
  comment: string
  updatedAt: string
  linkedIds: Record<string, string>
}

/**
 * 旧内联规则对单个关联目标的决策结果。
 *  - create：目标不存在 → 用 NeoDB 状态/评分创建
 *  - update：目标存在且未完成 → 同步状态/评分（空评分才填充），保留其他
 *  - links-only：目标存在且已完成 → 仅更新 linkedIds（不覆盖状态/评分）
 *  - skip：无变化
 */
export type NeoDBTargetSyncDecision =
  | { action: 'create'; record: StoreRecord }
  | { action: 'update'; updates: NeoDBTargetUpdate }
  | { action: 'links-only'; linkedIds: Record<string, string> }
  | { action: 'skip' }

export interface NeoDBTargetSyncParams {
  isPageDone: boolean
  /** 目标平台的既有记录；null 表示目标不存在。 */
  existing: Pick<StoreRecord, 'status' | 'rating' | 'comment' | 'linkedIds'> | null
  pageRating: number
  comment: string | undefined
  targetUrl: string
  neodbKey: string
  now: string
}

/**
 * 旧内联规则：对单个关联目标决定 create / update / links-only / skip。
 * 逐字对应 neodb.ts onSave 中的目标循环决策（create-if-missing /
 * update-if-not-watched / link-only-if-watched / never-overwrite-linked-rating）。
 */
export function decideNeoDBTargetSync(params: NeoDBTargetSyncParams): NeoDBTargetSyncDecision {
  const { isPageDone, existing, pageRating, comment, targetUrl, neodbKey, now } = params
  const targetLinkedIds = mergeTargetLinkedIds(existing?.linkedIds, neodbKey)

  if (!existing) {
    // 目标不存在 → 创建新记录（使用 NeoDB 的状态/评分）
    return {
      action: 'create',
      record: {
        url: targetUrl,
        status: isPageDone ? 2 : 0,
        rating: pageRating,
        comment: comment ?? '',
        updatedAt: now,
        linkedIds: targetLinkedIds,
      },
    }
  }

  if (existing.status !== 2) {
    // 存在但未完成 → 检测变化后再更新
    const statusChanged = isPageDone && existing.status !== 2
    const ratingChanged = Boolean(pageRating) && existing.rating !== pageRating
    const linkedChanged = JSON.stringify(existing.linkedIds || {}) !== JSON.stringify(targetLinkedIds)

    if (statusChanged || ratingChanged || linkedChanged) {
      return {
        action: 'update',
        updates: {
          status: isPageDone ? 2 : existing.status,
          rating: existing.rating || pageRating,
          comment: comment ?? existing.comment ?? '',
          updatedAt: now,
          linkedIds: targetLinkedIds,
        },
      }
    }
    return { action: 'skip' }
  }

  // 存在且已完成 → 仅更新 linkedIds（低优先级，不覆盖状态/评分）
  const needsLinkUpdate = JSON.stringify(existing.linkedIds || {}) !== JSON.stringify(targetLinkedIds)
  return needsLinkUpdate ? { action: 'links-only', linkedIds: targetLinkedIds } : { action: 'skip' }
}
