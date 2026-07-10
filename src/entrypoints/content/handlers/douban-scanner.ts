/**
 * 豆瓣页面状态扫描函数
 * 功能：扫描页面状态、提取评论、提取跨平台链接
 */

import { Utils } from '@/utils'
import type { UrlIdentity } from '@/types'

/**
 * 扫描豆瓣页面状态
 */
export function scanDoubanPageStatus(identity: UrlIdentity): { status: string; rating: number } {
  const isGame = identity.type === 'game'

  if (isGame) {
    // Game page uses .collection-section instead of #interest_sect_level
    const collectionSection = document.querySelector('.collection-section')
    if (!collectionSection) {
      console.log('[UMM Douban] .collection-section not found for game')
      return { status: 'none', rating: 0 }
    }
    const resultEl = collectionSection.querySelector('.collection-result')
    const text = resultEl?.textContent?.trim() || ''

    // Extract rating from #n_rating (hidden input inside this section or elsewhere)
    let stars = 0
    const nRatingInput = document.getElementById('n_rating') as HTMLInputElement | null
    if (nRatingInput && nRatingInput.value) {
      stars = Number.parseInt(nRatingInput.value, 10) || 0
    }

    const finalRating = Utils.clampRating10(stars * 2)

    if (text.includes('玩过')) return { status: 'done', rating: finalRating }
    if (text.includes('想玩')) return { status: 'wish', rating: 0 }
    if (text.includes('在玩')) return { status: 'doing', rating: 0 }
    return { status: 'none', rating: 0 }
  }

  const interestBox = document.getElementById('interest_sect_level')
  if (!interestBox) {
    console.log('[UMM Douban] #interest_sect_level not found')
    return { status: 'none', rating: 0 }
  }
  
  // 检测是否包含"我看过"或"我听过"
  // ✅ 修复：弹窗可见时跳过 + 精确匹配已看状态信号
  const isMusic = identity.type === 'music'
  const isBook = identity.type === 'book'
  const watchedText = isBook ? '我读过' : isMusic ? '我听过' : '我看过'
  // 如果豆瓣弹窗(#dialog)可见，直接返回 none，避免弹窗内容干扰
  const doubanDialog = document.getElementById('dialog')
  const isDialogVisible = doubanDialog && doubanDialog.offsetParent !== null
  if (isDialogVisible) {
    console.log('[UMM Douban] Douban dialog is visible, skip detection')
    return { status: 'none', rating: 0 }
  }
  // 已看状态判定：
  // 1. #interest_sect_level 全文包含"我看过"/"我听过"
  // 2. 且存在删除表单（form[action="remove"]）—— 仅已看状态才有
  // 注意：不要求 #n_rating 有值，因为用户可能已看但未评分
  const hasFullText = interestBox.innerText.includes(watchedText)
  const hasRemoveForm = !!interestBox.querySelector('form[action="remove"]')
  const hasWatchedText = hasFullText && (hasRemoveForm || isMusic)
  console.log('[UMM Douban] Looking for text:', watchedText, '| Found:', hasWatchedText, '| FullText:', hasFullText, '| RemoveForm:', hasRemoveForm, '| Dialog:', isDialogVisible)

  if (hasWatchedText) {
    // 已看 → 提取评分
    let stars = 0
    const nRatingInput = document.getElementById('n_rating') as HTMLInputElement | null
    if (nRatingInput && nRatingInput.value) {
      stars = Number.parseInt(nRatingInput.value, 10) || 0
    }
    if (!stars) {
      const ratingElement = interestBox.querySelector('[class*="rating"]')
      if (ratingElement) {
        const className = Array.from(ratingElement.classList).find(cls => /^rating\d/.test(cls))
        if (className) {
          stars = Number.parseInt(className.replace(/[^\d]/g, ''), 10) || 0
        }
      }
    }
    const finalRating = Utils.clampRating10(stars * 2)
    return { status: 'done', rating: finalRating }
  }

  // Already-marked status uses "我" prefix: "我想看"/"我在看"/"我看过"
  // Unmarked page shows bare text inside <a> buttons — must distinguish with "我"
  const markedWishText = isBook ? '我想读' : isMusic ? '我想听' : '我想看'
  if (interestBox.innerText.includes(markedWishText)) {
    return { status: 'wish', rating: 0 }
  }

  const markedDoingText = isBook ? '我在读' : isMusic ? '我在听' : '我在看'
  if (interestBox.innerText.includes(markedDoingText)) {
    return { status: 'doing', rating: 0 }
  }

  return { status: 'none', rating: 0 }
}

/**
 * 从豆瓣页面提取用户的短评文字
 * 在评分/状态区域查找用户填写的短评
 */
export function extractCommentFromPage(identity?: UrlIdentity): string {
  // Game page uses .collection-comment
  if (identity?.type === 'game') {
    const commentEl = document.querySelector('.collection-comment')
    if (commentEl?.textContent?.trim()) return commentEl.textContent.trim()
  }

  const selectors = [
    '#interest_sect_level .user_comment',
    '#interest_sect_level .rating_text',
    '#interest_sect_level .comment-item .comment',
    '.user_comment_wrapper .user_comment',
    /**
     * 用户自己的短评：位于 #interest_sect_level 内部最后的 <span>
     * 结构: #interest_sect_level > div.j.a_stars > span:last-child
     * 示例: <span>都怪我~都怪我~<span class="pl"></span></span>
     */
    '#interest_sect_level div.j.a_stars > span:last-child',
    // 仅当找不到自己的短评时才尝试其他用户的（兜底）
    '#comments .comment-item:first-child .comment',
  ]
  for (const sel of selectors) {
    const el = document.querySelector(sel) as HTMLElement | null
    if (el?.textContent?.trim()) {
      return el.textContent.trim()
    }
  }
  return ''
}

/**
 * 从豆瓣页面提取跨平台关联 ID（IMDB、TMDB 等）
 * 存储格式：full key（如 "movie::tt23810070"），确保反查时能正确解析类型
 */
export function extractCrossPlatformLinks(
  identity: UrlIdentity,
  existingLinkedIds: Record<string, string> = {}
): Record<string, string> {
  const links = { ...existingLinkedIds }

  // 提取 IMDB ID（从 #info 区域）
  const infoEl = document.querySelector('#info')
  if (infoEl) {
    const infoText = infoEl.innerHTML

    // IMDB: 格式为 "tt" + 数字
    const imdbMatch = infoText.match(/IMDb:<\/span>\s*(tt\d+)/i)
    if (imdbMatch) {
      // 存储 full key 格式：type::providerId
      links.imdb = `${identity.type}::${imdbMatch[1]}`
    }

    // TMDB
    const tmdbMatch = infoText.match(/themoviedb\.org\/(?:movie|tv)\/(\d+)/)
    if (tmdbMatch) {
      links.tmdb = `${identity.type}::${tmdbMatch[1]}`
    }
  }

  console.log('[UMM Douban] Extracted cross-platform links:', links)
  return links
}
