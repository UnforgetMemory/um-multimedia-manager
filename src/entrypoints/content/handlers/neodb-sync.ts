/**
 * NeoDB 跨平台同步的纯决策逻辑（无 DOM / chrome / IndexedDB 依赖）。
 *
 * 从 neodb.ts onSave 内联逻辑抽取（audit §2.3, T12 2026-08-03）：
 *  - 构建器（buildNeoDBLinkedIds / buildNeoDBSyncTargets / buildNeoDBSyncRecord /
 *    shouldSaveNeoDBPrimary / platformLabel）现被 neodb.ts onSave 直接使用，
 *    作为委托 RecordService 前的输入构建器。
 *  - 旧内联目标决策（decideNeoDBTargetSync / mergeTargetLinkedIds）已删除：
 *    被 RecordService.syncRecord（经 DB_SYNC_PAGE_RECORD 消息）取代后即为死代码
 *    （2026-08-07 C1 清理），其行为规则现由 tests/unit/record-service-sync.spec.ts
 *    直接锁定（create-if-missing / update-if-not-watched / skip-if-watched）。
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

/** Platform display name for toast messages (douban → 豆瓣, imdb → IMDb, tmdb → TMDB). */
export function platformLabel(platform: string): string {
  return platform === 'imdb' ? 'IMDb' : platform === 'tmdb' ? 'TMDB' : '豆瓣'
}
