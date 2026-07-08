/**
 * NeoDB Push Button Injection & Push Logic
 *
 * Injects push-to-NeoDB buttons on Douban detail pages
 * and handles the actual push via safeSendMessage.
 * Extracted from content.ts for modularity.
 */

import type { StoreRecord } from '@/types'
import { Store } from '@/features/database'
import { Utils } from '@/utils'
import { safeSendMessage } from '@/utils/context'
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

  // Use record data if available (works in overlay Shadow DOM, doesn't rely on native DOM)
  const pageState = currentRecord?.status === 2
    ? { status: 'done', rating: currentRecord.rating || 0 }
    : scanDoubanPageStatus(currentIdentity.type)
  if (pageState.status !== 'done') {
    debugLog('Page not marked as done, skip NeoDB buttons')
    const oldButtons = document.getElementById('umm-neodb-push-buttons')
    if (oldButtons) oldButtons.remove()
    return
  }

  const interestSect = document.querySelector('#interest_sect_level')

  const ov = document.getElementById('umm-detail-mask') ?? document.getElementById('umm-douban-overlay')
  const oldFromShadow = ov?.shadowRoot?.getElementById('umm-neodb-push-buttons')
  const oldFromPage = document.getElementById('umm-neodb-push-buttons')
  oldFromShadow?.remove()
  oldFromPage?.remove()

  const container = document.createElement('div')
  container.id = 'umm-neodb-push-buttons'
  container.className = 'umm-neodb-push-buttons'

  const hasNeoDBLink = !!(currentRecord?.linkedIds?.neodb)

  if (hasNeoDBLink) {
    container.classList.add('umm-neodb-synced')
  }

  const watermark = document.createElement('div')
  watermark.className = 'umm-neodb-watermark'
  watermark.setAttribute('aria-hidden', 'true')
  watermark.textContent = 'NEODB'
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

  // Prefer overlay's #umm-neodb-actions (Shadow DOM), fall back to native DOM
  const overlay = document.getElementById('umm-detail-mask') ?? document.getElementById('umm-douban-overlay')
  const neodbActions = overlay?.shadowRoot?.querySelector('#umm-neodb-actions')
  if (neodbActions) {
    neodbActions.appendChild(container)
  } else if (interestSect?.parentNode) {
    interestSect.parentNode.insertBefore(container, interestSect)
  } else {
    return
  }

  bindNeoDBPushEvents(currentIdentity, currentRecord, container)

  infoLog('NeoDB push buttons injected')
}

function bindNeoDBPushEvents(currentIdentity: any, currentRecord: StoreRecord | null, container: HTMLElement): void {
  container.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement
    if (!target.matches('#umm-push-minus, #umm-push-plus, #umm-push-original')) return
    if (target.id === 'umm-push-minus') await pushToNeoDB(currentIdentity, currentRecord, -1)
    else if (target.id === 'umm-push-plus') await pushToNeoDB(currentIdentity, currentRecord, 1)
    else if (target.id === 'umm-push-original') await pushToNeoDB(currentIdentity, currentRecord, 0)
  })
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

  // Disable buttons to show loading state
  const ov = document.getElementById('umm-detail-mask') ?? document.getElementById('umm-douban-overlay')
  const pushBtns = ov?.shadowRoot?.querySelectorAll('#umm-push-minus, #umm-push-plus, #umm-push-original')
    ?? document.querySelectorAll('#umm-push-minus, #umm-push-plus, #umm-push-original')
  const restore: Array<{ el: HTMLElement; d: boolean; op: string; pe: string }> = []
  pushBtns.forEach(el => {
    const btn = el as HTMLElement
    restore.push({ el: btn, d: btn.hasAttribute('disabled'), op: btn.style.opacity, pe: btn.style.pointerEvents })
    btn.setAttribute('disabled', 'true')
    btn.style.opacity = '0.5'
    btn.style.pointerEvents = 'none'
  })
  const restoreBtns = () => restore.forEach(r => {
    if (!r.d) r.el.removeAttribute('disabled')
    r.el.style.opacity = r.op
    r.el.style.pointerEvents = r.pe
  })

  try {
    const settings = await Store.getSettings()
    if (!settings.neodbToken) {
      const toastSent = await safeSendMessage({
        type: 'SHOW_TOAST',
        payload: {
          type: 'error',
          title: t('neodb.config_missing_title'),
          message: t('neodb.config_missing')
        }
      }, { timeout: 5000, retries: 0 })
      if (!toastSent) {
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

    const response = await safeSendMessage({
      type: 'NEODB_PUSH_RATING',
      payload: { record: neodbData },
    }, { timeout: 15000, retries: 2 })

    if (!response) {
      errorLog('Communication with background failed after retries')
      showToast(t('neodb.comm_retry'), 'error')
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
    restoreBtns()
  } catch (error) {
    errorLog('Push to NeoDB failed:', error)
    showToast(t('neodb.sync_failed'), 'error')
    restoreBtns()
  }
}
