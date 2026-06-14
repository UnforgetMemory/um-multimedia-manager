/**
 * 豆瓣评分变化监听器
 * 监听 #n_rating 变化，自动更新 NeoDB 推送按钮的评分
 */

import { debugLog } from '@/utils/logger'

let ratingObserver: MutationObserver | null = null
let lastKnownRating = 0
let ratingInputCleanup: (() => void) | null = null
let neoDBInjector: (() => void) | null = null

export function setNeoDBInjector(fn: () => void) {
  neoDBInjector = fn
}

export function startRatingObserver() {
  if (!isDoubanDetailPage()) return

  const interestSect = document.getElementById('interest_sect_level')
  if (!interestSect) {
    setTimeout(startRatingObserver, 1000)
    return
  }

  const nRatingInput = document.getElementById('n_rating') as HTMLInputElement | null
  if (nRatingInput) {
    lastKnownRating = Number.parseInt(nRatingInput.value, 10) || 0
  }

  if (ratingObserver) {
    ratingObserver.disconnect()
  }

  if (ratingInputCleanup) {
    ratingInputCleanup()
    ratingInputCleanup = null
  }

  ratingObserver = new MutationObserver((() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        const input = document.getElementById('n_rating') as HTMLInputElement | null
        if (!input) return
        const newRating = Number.parseInt(input.value, 10) || 0
        if (newRating !== lastKnownRating) {
          lastKnownRating = newRating
          debugLog(`Rating changed from ${lastKnownRating} -> ${newRating}, re-rendering NeoDB buttons`)
          neoDBInjector?.()
        }
      }, 200)
    }
  })())

  ratingObserver.observe(interestSect, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'value'],
  })

  if (nRatingInput) {
    const handleRatingInput = () => {
      const newRating = Number.parseInt(nRatingInput.value, 10) || 0
      if (newRating !== lastKnownRating) {
        lastKnownRating = newRating
        debugLog(`Rating input event: ${newRating}, re-rendering NeoDB buttons`)
        neoDBInjector?.()
      }
    }
    nRatingInput.addEventListener('input', handleRatingInput)
    nRatingInput.addEventListener('change', handleRatingInput)
    ratingInputCleanup = () => {
      nRatingInput.removeEventListener('input', handleRatingInput)
      nRatingInput.removeEventListener('change', handleRatingInput)
    }
  }
}

export function cleanupRatingObserver() {
  if (ratingObserver) {
    ratingObserver.disconnect()
    ratingObserver = null
  }
  if (ratingInputCleanup) {
    ratingInputCleanup()
    ratingInputCleanup = null
  }
}

function isDoubanDetailPage(): boolean {
  const host = window.location.hostname
  const path = window.location.pathname
  return (
    (host === 'movie.douban.com' || host === 'music.douban.com') &&
    path.includes('/subject/')
  )
}
