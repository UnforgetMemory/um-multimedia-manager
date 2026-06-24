/**
 * NeoDB Push Button Injection & Push Logic
 *
 * Injects push-to-NeoDB buttons on Douban detail pages
 * and handles the actual push via chrome.runtime.sendMessage.
 * Extracted from content.ts for modularity.
 */

import type { StoreRecord } from '@/types'
import { Store } from '@/features/database'
import { Utils } from '@/utils'
import { FloatingToast } from './utils/toast'
import { t } from './i18n'
import { debugLog, infoLog, warnLog, errorLog } from '@/utils/logger'

/** Scan Douban page status — reads interest_sect_level DOM */
function scanDoubanPageStatus(type?: string): { status: string; rating: number } {
  const interestBox = document.getElementById('interest_sect_level')
  if (!interestBox) {
    return { status: 'none', rating: 0 }
  }

  const isMovie = type === 'movie' || type === 'book'
  const watchedText = isMovie ? '我看过' : '我听过'
  const doubanDialog = document.getElementById('dialog')
  const isDialogVisible = doubanDialog && doubanDialog.offsetParent !== null
  if (isDialogVisible) {
    return { status: 'none', rating: 0 }
  }
  const hasFullText = interestBox.innerText.includes(watchedText)
  const hasRemoveForm = !!interestBox.querySelector('form[action="remove"]')
  const hasWatchedText = hasFullText && (hasRemoveForm || !isMovie)

  if (!hasWatchedText) {
    return { status: 'none', rating: 0 }
  }

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

  return {
    status: 'done',
    rating: Utils.clampRating10(stars * 2),
  }
}

function showToast(message: string, type: 'success' | 'error' | 'info' = 'info') {
  if (type === 'success') FloatingToast.success('UMM', message)
  else if (type === 'error') FloatingToast.error('UMM', message)
  else FloatingToast.info('UMM', message)
}

/** Inject NeoDB push buttons into Douban detail page */
export function injectNeoDBPushButtons(
  currentIdentity: any,
  currentRecord: StoreRecord | null,
): void {
  if (!currentIdentity) return

  const pageState = scanDoubanPageStatus(currentIdentity.type)
  if (pageState.status !== 'done') {
    debugLog('Page not marked as done, skip NeoDB buttons')
    const oldButtons = document.getElementById('umm-neodb-push-buttons')
    if (oldButtons) oldButtons.remove()
    return
  }

  const interestSect = document.querySelector('#interest_sect_level')
  if (!interestSect) {
    debugLog('Could not find #interest_sect_level for NeoDB buttons')
    return
  }

  const oldButtons = document.getElementById('umm-neodb-push-buttons')
  if (oldButtons) oldButtons.remove()

  const container = document.createElement('div')
  container.id = 'umm-neodb-push-buttons'
  container.style.cssText = `
    margin-top: 12px;
    margin-bottom: 12px;
    padding: 16px;
    border-radius: 12px;
    background: linear-gradient(135deg, rgba(15, 122, 67, 0.1), rgba(23, 87, 214, 0.1));
    backdrop-filter: blur(10px);
    border: 2px solid rgba(15, 122, 67, 0.3);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.2);
    display: flex;
    gap: 10px;
    justify-content: flex-start;
    align-items: center;
    position: relative;
    overflow: hidden;
  `

  const hasNeoDBLink = !!(currentRecord?.linkedIds?.neodb)

  if (hasNeoDBLink) {
    container.classList.add('umm-neodb-synced')
  }

  const watermark = document.createElement('div')
  watermark.className = 'umm-neodb-watermark'
  watermark.setAttribute('aria-hidden', 'true')
  watermark.textContent = 'NEODB'
  watermark.style.cssText = `
    position: absolute;
    right: 20px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 72px;
    font-weight: 900;
    font-family: "Arial Black", "Helvetica Neue", sans-serif;
    color: ${hasNeoDBLink ? 'rgba(15, 100, 55, 0.35)' : 'rgba(15, 122, 67, 0.12)'};
    letter-spacing: 4px;
    pointer-events: none;
    user-select: none;
    z-index: 0;
    text-transform: uppercase;
    line-height: 1;
    white-space: nowrap;
    text-shadow: rgba(15, 122, 67, 0.06) 2px 2px 0px, rgba(23, 87, 214, 0.04) 4px 4px 0px;
    transition: color 0.3s ease, text-shadow 0.3s ease;
  `

  if (hasNeoDBLink) {
    watermark.style.textShadow = 'rgba(15, 100, 55, 0.2) 2px 2px 0px, rgba(15, 100, 55, 0.15) 4px 4px 0px, rgba(15, 100, 55, 0.1) 6px 6px 0px'
  }

  container.appendChild(watermark)

  const livePageState = scanDoubanPageStatus(currentIdentity.type)
  const currentRating = livePageState.rating || currentRecord?.rating || 0
  const ratingMinus = Utils.clampRating10(currentRating - 1)
  const ratingPlus = Utils.clampRating10(currentRating + 1)

  const pushMinusBtn = document.createElement('button')
  pushMinusBtn.id = 'umm-push-minus'
  pushMinusBtn.className = 'umm-neodb-btn umm-neodb-btn--minus'
  pushMinusBtn.textContent = t('neodb.btn_minus', { rating: ratingMinus })
  pushMinusBtn.title = t('neodb.title_minus')

  const pushPlusBtn = document.createElement('button')
  pushPlusBtn.id = 'umm-push-plus'
  pushPlusBtn.className = 'umm-neodb-btn umm-neodb-btn--plus'
  pushPlusBtn.textContent = t('neodb.btn_plus', { rating: ratingPlus })
  pushPlusBtn.title = t('neodb.title_plus')

  const pushOriginalBtn = document.createElement('button')
  pushOriginalBtn.id = 'umm-push-original'
  pushOriginalBtn.className = 'umm-neodb-btn umm-neodb-btn--original'
  pushOriginalBtn.textContent = t('neodb.btn_original', { rating: currentRating })
  pushOriginalBtn.title = t('neodb.title_original')

  container.appendChild(pushMinusBtn)
  container.appendChild(pushPlusBtn)
  container.appendChild(pushOriginalBtn)

  interestSect.parentNode?.insertBefore(container, interestSect)

  bindNeoDBPushEvents(currentIdentity, currentRecord)

  infoLog('NeoDB push buttons injected')
}

function bindNeoDBPushEvents(currentIdentity: any, currentRecord: StoreRecord | null): void {
  const pushMinusBtn = document.getElementById('umm-push-minus')
  const pushPlusBtn = document.getElementById('umm-push-plus')
  const pushOriginalBtn = document.getElementById('umm-push-original')

  if (pushMinusBtn) {
    pushMinusBtn.addEventListener('click', () => pushToNeoDB(currentIdentity, currentRecord, -1))
  }
  if (pushPlusBtn) {
    pushPlusBtn.addEventListener('click', () => pushToNeoDB(currentIdentity, currentRecord, 1))
  }
  if (pushOriginalBtn) {
    pushOriginalBtn.addEventListener('click', () => pushToNeoDB(currentIdentity, currentRecord, 0))
  }
}

async function pushToNeoDB(
  currentIdentity: any,
  currentRecord: StoreRecord | null,
  ratingAdjust: number
): Promise<void> {
  if (!currentIdentity) {
    showToast(t('neodb.no_identity'), 'error')
    return
  }

  const providerId = currentIdentity.providerId
  if (!providerId) {
    showToast(t('neodb.no_id'), 'error')
    return
  }

  try {
    const settings = await Store.getSettings()
    if (!settings.neodbToken) {
      if (chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({
          type: 'SHOW_TOAST',
          payload: {
            type: 'error',
            title: t('neodb.config_missing_title'),
            message: t('neodb.config_missing')
          }
        }).catch(() => {
          showToast(t('neodb.config_missing'), 'error')
        })
      } else {
        showToast(t('neodb.config_missing'), 'error')
      }
      return
    }

    const livePageState = scanDoubanPageStatus(currentIdentity.type)
    const baseRating = livePageState.rating || currentRecord?.rating || 0
    const adjustedRating = Utils.clampRating10(baseRating + ratingAdjust)

    const neodbData = {
      providerId,
      rating: adjustedRating,
      status: currentRecord?.status ?? 0,
      type: currentIdentity.type,
      provider: currentIdentity.provider,
      comment: currentRecord?.comment ?? '',
    }

    let response: any
    try {
      response = await chrome.runtime.sendMessage({
        type: 'NEODB_PUSH_RATING',
        payload: { record: neodbData },
      })
    } catch (commError) {
      errorLog('Communication with background failed:', commError)
      showToast(t('neodb.comm_retry'), 'error')
      return
    }

    if (!response) {
      showToast(t('neodb.no_response'), 'error')
      return
    }

    if (response.success) {
      showToast(t('neodb.push_success', { rating: adjustedRating }), 'success')

      if (response.catalogUuid && currentIdentity) {
        const neodbFullKey = `${currentIdentity.type}::${response.catalogUuid}`
        const doubanFullKey = `${currentIdentity.type}::${currentIdentity.providerId}`

        const storeName = `${currentIdentity.provider}_records`
        const key = `${currentIdentity.type}::${currentIdentity.providerId}`
        const existing = await Store.dbGet(storeName, key)
        if (existing) {
          existing.linkedIds = existing.linkedIds || {}
          existing.linkedIds.neodb = neodbFullKey
          await Store.dbPut(storeName, key, existing)
          currentRecord = existing
          infoLog('Updated record with NeoDB linked ID:', neodbFullKey)
        }

        const neodbStoreName = 'neodb_records'
        const existingNeoDB = await Store.dbGet(neodbStoreName, neodbFullKey)
        if (existingNeoDB) {
          if (!existingNeoDB.linkedIds?.douban) {
            existingNeoDB.linkedIds = existingNeoDB.linkedIds || {}
            existingNeoDB.linkedIds.douban = doubanFullKey
            await Store.dbPut(neodbStoreName, neodbFullKey, existingNeoDB)
            infoLog('Updated existing NeoDB record linkedIds:', neodbFullKey)
          }
        } else {
          const neodbRecord: StoreRecord = {
            url: `https://neodb.social/${currentIdentity.type === 'music' ? 'album' : currentIdentity.type}/${response.catalogUuid}/`,
            status: 2,
            rating: adjustedRating,
            updatedAt: new Date().toISOString(),
            linkedIds: { douban: doubanFullKey },
          }
          await Store.dbPut(neodbStoreName, neodbFullKey, neodbRecord)
          infoLog('Created NeoDB local record:', neodbFullKey)
        }
      } else {
        warnLog('No catalogUuid in response or no currentIdentity')
      }

      injectNeoDBPushButtons(currentIdentity, currentRecord)
      infoLog('[UMM] NeoDB buttons re-rendered after push success')
    } else {
      showToast(t('neodb.push_failed', { message: response.message || t('neodb.unknown_error') }), 'error')
    }
  } catch (error) {
    errorLog('Push to NeoDB failed:', error)
    showToast(t('neodb.sync_failed'), 'error')
  }
}
