/**
 * NeoDB page handler.
 * Scans page status/rating and injects status chips and sync buttons.
 */

import type { UrlIdentity } from '@/types'
import { Store } from '@/features/database'
import { Utils } from '@/utils'
import { createStatusChip } from '../utils/dom'
import { FloatingToast } from '../utils/toast'
import { t } from '../i18n'
import { createDetailPageHandler } from './create-detail-handler'
import {
  buildNeoDBLinkedIds,
  buildNeoDBSyncRecord,
  buildNeoDBSyncTargets,
  platformLabel,
  shouldSaveNeoDBPrimary,
} from './neodb-sync'

/**
 * 扫描 NeoDB 页面状态
 */
export async function scanNeoDBPageStatus(type: string): Promise<{ status: string; rating: number }> {
  const action = document.querySelector('#item-primary-mark .item-action button, #item-primary-mark .item-action a') as HTMLElement | null
  const text = action?.innerText?.trim() || ''
  const strong = action?.querySelector('strong')?.textContent?.trim() || ''
  
  // 根据类型确定"已看/已听"的文本
  const doneWord = type === 'music' ? t('neodb.listened_text') : type === 'book' ? t('neodb.read_text') : t('neodb.watched_text')
  const done =
    strong === doneWord ||
    text.startsWith(doneWord) ||
    !!(document.querySelector('#mark-history #log-list') as HTMLElement)?.innerText?.includes(doneWord)
  
  // 提取评分
  const rating = Utils.clampRating10(
    Number(action?.querySelector('.rating-star[data-rating]')?.getAttribute('data-rating')) || 0
  )
  
  return {
    status: done ? 'done' : 'none',
    rating,
  }
}

/**
 * 获取 NeoDB 页面标题锚点元素
 */
export function getNeoDBAnchorElement(): Element | null {
  return (
    document.querySelector('#item-title h1') ||
    document.querySelector('.item-title h1')
  )
}

/**
 * 获取关联的其他平台 ID（豆瓣/IMDb/TMDB）
 */
export async function getLinkedIdentities(): Promise<Array<{ provider: string; url: string }>> {
  const siteList = document.querySelector('.site-list')
  if (!siteList) {
    return []
  }
  
  const result: Array<{ provider: string; url: string }> = []
  
  const pushIf = (url: string, provider: string) => {
    if (url) {
      result.push({ provider, url })
    }
  }
  
  // 提取豆瓣链接
  const doubanLink = siteList.querySelector('.douban')?.getAttribute('href') || ''
  pushIf(doubanLink, 'douban')
  
  // 提取 IMDb 链接
  const imdbLink = siteList.querySelector('.imdb')?.getAttribute('href') || ''
  pushIf(imdbLink, 'imdb')
  
  // 提取 TMDB 链接
  const tmdbLink = siteList.querySelector('.tmdb')?.getAttribute('href') || ''
  pushIf(tmdbLink, 'tmdb')
  
  return result
}

/**
 * 渲染 NeoDB 状态标签
 */
export async function renderNeoDBStatusChip(
  identity: UrlIdentity,
  status: number,  // 0/1/2
  rating: number,
  note: string = ''
): Promise<void> {
  const anchor = getNeoDBAnchorElement()
  if (!anchor) {
    console.warn('[UMM] Could not find NeoDB anchor element for status chip')
    return
  }
  
  // 检查是否已存在状态标签
  const existingChip = anchor.parentElement?.querySelector('.umm-status-chip[data-umm-owner]')
  
  // 创建新标签
  const chip = createStatusChip(identity.type, status, rating, note)
  chip.dataset.ummOwner = `neodb-${identity.type}`
  
  if (existingChip) {
    // 替换现有标签
    existingChip.replaceWith(chip)
  } else {
    // 插入到锚点元素之后
    anchor.insertAdjacentElement('afterend', chip)
  }
}

/**
 * 从 NeoDB 页面元数据中提取 IMDb 链接（site-list 中可能没有）
 */
function extractMetadataIMDb(): string {
  const metaSection = document.querySelector('#item-metadata')
  if (!metaSection) return ''
  const imdbAnchor = metaSection.querySelector('a[href*="imdb.com/title/tt"]')
  return imdbAnchor?.getAttribute('href') || ''
}

/**
 * 处理 NeoDB 详情页
 * 功能：
 * 1. 注入状态标签
 * 2. 提取跨平台关联数据（豆瓣/IMDb/TMDB）并写入 linkedIds
 * 3. 跨平台同步委托 RecordService（经 DB_SYNC_PAGE_RECORD 消息），
 *    规则见 src/domain/record/RecordService.ts syncRecord（fork 决策 (b)）。
 */
export const handleNeoDBDetailPage = createDetailPageHandler({
  platform: 'neodb',
  titleSelector: '#item-title h1, .item-title h1',
  scanFn: (identity) => scanNeoDBPageStatus(identity.type),
  renderFn: renderNeoDBStatusChip,
  // No savedMessageKey — neodb handles all saves in onSave (linkedIds, cross-platform sync)
  onSave: async ({ identity, pageState, localRecord, storeName, key, isPageDone }) => {
    // ===== 提取跨平台关联数据 =====

    // 从 site-list 提取链接（豆瓣/TMDB，可能也有 IMDb）
    const linkedIdentities = await getLinkedIdentities()

    // 补充：从元数据区提取 IMDb（site-list 中可能没有）
    const metaImdbUrl = extractMetadataIMDb()
    if (metaImdbUrl && !linkedIdentities.some(l => l.provider === 'imdb')) {
      linkedIdentities.push({ provider: 'imdb', url: metaImdbUrl })
    }

    // 解析每个链接为 linkedIds + 构建主记录（含 comment/状态）
    const linkedIds = buildNeoDBLinkedIds(linkedIdentities)
    const record = buildNeoDBSyncRecord({ identity, pageState, localRecord, isPageDone, linkedIds })

    // ===== 保存 NeoDB 本地记录（含 linkedIds + comment，R6 门控） =====

    if (shouldSaveNeoDBPrimary({ isPageDone, localRecord, pageState, linkedIds })) {
      await Store.dbPut(storeName, key, record)
      FloatingToast.success('UMM', isPageDone ? t('neodb.saved_state') : t('neodb.updated_link'))
      console.log('[UMM] ✅ Saved NeoDB record with linkedIds:', linkedIds)
    } else {
      console.log('[UMM] ⏭️ NeoDB record unchanged, skipping save')
    }

    // ===== 跨平台同步（委托 RecordService，经 DB_SYNC_PAGE_RECORD 消息） =====
    // RecordService.syncRecord 规则：create-if-missing / update-if-not-watched /
    // skip-if-watched。fork 决策 (b)：已完成的关联目标不再做 links-only 刷新。
    // 门控（T12 修复）：record.status > 0 → 全量同步（规则 2–4 生效）；
    // record.status === 0 → 仅恢复 create-stub 分支 —— 目标不存在时创建
    // status-0 记录 + 回链（旧内联逻辑始终执行，见 decideNeoDBTargetSync R2）。
    // 已存在的目标一律跳过：RecordService 规则 3 会用 record.status 覆盖目标
    // 平台既有状态（旧内联逻辑显式保留目标 status），状态为 0 时跳过以避免
    // 破坏目标平台数据。
    const targets = buildNeoDBSyncTargets(linkedIdentities)
    if (targets.length > 0) {
      let syncTargets = targets
      if (record.status === 0) {
        // create-stub：仅同步尚不存在的目标（status-0 目标 + 回链）
        syncTargets = []
        for (const target of targets) {
          const existing = await Store.dbGet(`${target.platform}_records`, target.key)
          if (!existing) syncTargets.push(target)
        }
      }
      if (syncTargets.length > 0) {
        const syncResult = await Store.dbSyncPageRecord(identity.platform, key, record, syncTargets)
        const syncedPlatforms = syncResult.syncedPlatforms.filter(p => p !== 'neodb')
        if (syncResult.changed && syncedPlatforms.length > 0) {
          FloatingToast.success('UMM', t('neodb.synced_targets', { platforms: syncedPlatforms.map(platformLabel).join(' / ') }))
          console.log('[UMM] ✅ Cross-platform sync via RecordService:', syncedPlatforms)
        } else {
          console.log('[UMM] ⏭️ Cross-platform sync: nothing to update')
        }
      }
    }
  },
})
