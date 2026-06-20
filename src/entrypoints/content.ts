import { defineContentScript } from 'wxt/utils/define-content-script'
import { Identity } from '@/features/identity'
import { Store } from '@/features/database'
import { Utils } from '@/utils'
import type { StoreRecord } from '@/types'
import { initRouter, hasMatchingRoute } from './content/router'
import { initI18n, startLocaleSync, t } from './content/i18n'
import { injectGlobalStyles } from './content/styles/global'
import { FloatingToast } from './content/utils/toast'
import { startRatingObserver, cleanupRatingObserver, setNeoDBInjector } from './content/observers/rating'
import { debugLog, infoLog, warnLog, errorLog, configureLogging } from '@/utils/logger'
import type { LogLevel } from '@/types'
import { STORAGE_KEYS } from '@/config'
import { initEventBus } from '@/utils/event-bus'


let currentIdentity: ReturnType<typeof Identity.fromUrl> = null
let currentRecord: StoreRecord | null = null
let statusChipElement: HTMLElement | null = null
let urlObserver: MutationObserver | null = null
let themeChangeListener: ((e: MediaQueryListEvent) => void) | null = null

export default defineContentScript({
  matches: [
    '*://movie.douban.com/*',
    '*://movie.douban.com/subject/*',
    '*://movie.douban.com/chart*',
    '*://movie.douban.com/typerank*',
    '*://music.douban.com/subject/*',
    '*://music.douban.com/top250*',
    '*://search.douban.com/movie/subject_search*',
    '*://search.douban.com/music/subject_search*',
    '*://www.imdb.com/title/tt*',
    '*://neodb.social/movie/*',
    '*://neodb.social/tv/*',
    '*://neodb.social/album/*',
    '*://audiences.me/torrents.php*',
    '*://*.audiences.me/torrents.php*',
    '*://kp.m-team.cc/*',
    '*://next.m-team.cc/*',
    '*://www.m-team.cc/*',
    '*://ourbits.club/torrents.php*',
    '*://*.ourbits.club/torrents.php*',
    '*://ourbits.club/details.php*',
    '*://*.ourbits.club/details.php*',
    '*://hdhome.org/torrents.php*',
    '*://*.hdhome.org/torrents.php*',
    '*://hdhome.org/details.php*',
    '*://*.hdhome.org/details.php*',
    '*://hdarea.club/torrents.php*',
    '*://*.hdarea.club/torrents.php*',
    '*://hdarea.club/details.php*',
    '*://*.hdarea.club/details.php*',
    '*://pterclub.net/torrents.php*',
    '*://*.pterclub.net/torrents.php*',
    '*://pterclub.net/details.php*',
    '*://*.pterclub.net/details.php*',
    '*://pterclub.net/officialgroup.php*',
    '*://*.pterclub.net/officialgroup.php*',
    '*://audiences.me/details.php*',
    '*://*.audiences.me/details.php*',
    '*://www.pthome.net/torrents.php*',
    '*://www.pthome.net/details.php*',
    '*://www.haidan.cc/torrents.php*',
    '*://www.haidan.cc/videos.php*',
    '*://www.haidan.cc/details.php*',
    '*://web5.mukaku.com/*',
    '*://www.sehuatang.net/forum*',
    '*://www.sehuatang.org/forum*',
    '*://sehuatang.net/forum*',
    '*://sehuatang.org/forum*',
    '*://ptsbao.club/torrents.php*',
    '*://*.ptsbao.club/torrents.php*',
      '*://ptsbao.club/details.php*',
      '*://*.ptsbao.club/details.php*',
      '*://pt.btschool.club/torrents.php*',
      '*://*.pt.btschool.club/torrents.php*',
      '*://pt.btschool.club/details.php*',
      '*://*.pt.btschool.club/details.php*',
      '*://discfan.net/torrents.php*',
      '*://*.discfan.net/torrents.php*',
      '*://discfan.net/details.php*',
      '*://*.discfan.net/details.php*',
      '*://hhanclub.net/torrents.php*',
      '*://*.hhanclub.net/torrents.php*',
      '*://hhanclub.net/details.php*',
      '*://*.hhanclub.net/details.php*',
      '*://hddolby.com/torrents.php*',
      '*://*.hddolby.com/torrents.php*',
      '*://hddolby.com/details.php*',
      '*://*.hddolby.com/details.php*',
      '*://hdfans.org/torrents.php*',
      '*://*.hdfans.org/torrents.php*',
      '*://hdfans.org/details.php*',
      '*://*.hdfans.org/details.php*',
      '*://pt.soulvoice.club/torrents.php*',
      '*://*.pt.soulvoice.club/torrents.php*',
      '*://pt.soulvoice.club/details.php*',
      '*://*.pt.soulvoice.club/details.php*',
      '*://hdtime.org/torrents.php*',
      '*://*.hdtime.org/torrents.php*',
      '*://hdtime.org/details.php*',
      '*://*.hdtime.org/details.php*',
      '*://piggo.me/torrents.php*',
      '*://*.piggo.me/torrents.php*',
      '*://piggo.me/details.php*',
      '*://*.piggo.me/details.php*',
    '*://javdb.com/*'
  ],
  runAt: 'document_idle',

  async main() {
    initEventBus()

    try {
      const result = await chrome.storage.local.get([STORAGE_KEYS.DEBUG_ENABLED, STORAGE_KEYS.LOG_LEVEL])
      configureLogging({
        enabled: (result[STORAGE_KEYS.DEBUG_ENABLED] as boolean) ?? false,
        level: (result[STORAGE_KEYS.LOG_LEVEL] as LogLevel) ?? 'info',
      })
    } catch {
      // Silent fallback — keep defaults
    }

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return
      const enabledChange = changes[STORAGE_KEYS.DEBUG_ENABLED]
      const levelChange = changes[STORAGE_KEYS.LOG_LEVEL]
      if (enabledChange || levelChange) {
        configureLogging({
          enabled: enabledChange?.newValue as boolean | undefined,
          level: levelChange?.newValue as LogLevel | undefined,
        })
      }
    })

    currentIdentity = Identity.fromUrl(window.location.href)
    
    infoLog('Script loaded on:', window.location.href)
    infoLog('Chrome runtime available:', !!chrome?.runtime?.id)
    infoLog('Initializing...')
    
    if (!chrome?.runtime?.id) {
      errorLog('Chrome runtime not available!')
      return
    }

    const isMTeamSite = location.href.includes('m-team.cc')

    if (!hasMatchingRoute(location.href) && !isMTeamSite) {
      infoLog('No matching route — starting lightweight URL watcher')
      let initialized = false

      const tryInit = async () => {
        if (initialized || !hasMatchingRoute(location.href)) return
        initialized = true
        window.removeEventListener('popstate', tryInit)
        if (originalPushState) history.pushState = originalPushState
        if (originalReplaceState) history.replaceState = originalReplaceState
        infoLog('Route detected — running full initialization')
        await fullInit()
      }

      window.addEventListener('popstate', tryInit)

      const originalPushState = history.pushState
      const originalReplaceState = history.replaceState
      history.pushState = function (...args: [any, string, string?]) {
        originalPushState.apply(this, args)
        tryInit()
      }
      history.replaceState = function (...args: [any, string, string?]) {
        originalReplaceState.apply(this, args)
        tryInit()
      }

      return
    }

    await fullInit()

    async function fullInit() {
      try {
        await initI18n()
        startLocaleSync()

        infoLog('Waiting for background DB to be ready...')
        let attempts = 0
        const MAX_ATTEMPTS = 8
        while (attempts < MAX_ATTEMPTS) {
          const ok = await Store.healthCheck()
          if (ok) break
          attempts++
          await new Promise(r => setTimeout(r, Math.min(500 * Math.pow(2, attempts), 8000)))
        }
        infoLog('Background DB ready')

        injectGlobalStyles()
        infoLog('Global styles injected')

        currentIdentity = Identity.fromUrl(window.location.href)
        if (!currentIdentity) {
          infoLog('Not a media detail page')
        } else {
          infoLog('Detected identity:', currentIdentity)
          await loadCurrentRecord()
          infoLog('Current record loaded')
        }

        initRouter()
        infoLog('Router initialized')

        observeThemeChanges()
        infoLog('Theme observer started')

        setNeoDBInjector(injectNeoDBPushButtons)
        startRatingObserver()
        infoLog('Rating observer started')

        setupContextInvalidationListener()

        window.addEventListener('beforeunload', () => {
          if (urlObserver) { urlObserver.disconnect(); urlObserver = null }
          if (themeChangeListener) {
            const mq = window.matchMedia('(prefers-color-scheme: dark)')
            if (mq.removeEventListener) mq.removeEventListener('change', themeChangeListener)
            else if (mq.removeListener) mq.removeListener(themeChangeListener)
          }
          cleanupRatingObserver()
          debugLog('Page cleanup completed')
        })

        infoLog('✅ Initialization complete')
      } catch (error) {
        errorLog('❌ Initialization failed:', error)
      }
    }
  },
})


async function loadCurrentRecord() {
  if (!currentIdentity) return
  
  try {
    const key = `${currentIdentity!.type}::${currentIdentity!.providerId}`
    const storeName = `${currentIdentity!.provider}_records`
    const loadPromise = Store.dbGet(storeName, key)
    
    const timeoutPromise = new Promise<null>((_, reject) => 
      setTimeout(() => reject(new Error('loadCurrentRecord timeout after 8s')), 8000)
    )
    
    currentRecord = await Promise.race([loadPromise, timeoutPromise])
    
    infoLog('Current record:', currentRecord)
  } catch (error) {
    warnLog('[Content] loadCurrentRecord failed:', error)
    currentRecord = null
  }
}


function isDoubanDetailPage(): boolean {
  return (
    currentIdentity?.provider === 'douban' &&
    (window.location.hostname === 'movie.douban.com' || window.location.hostname === 'music.douban.com') &&
    window.location.pathname.includes('/subject/')
  )
}

void _detectPageTheme
function _detectPageTheme(): 'light' | 'dark' {
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark'
  }
  
  const body = document.body
  const html = document.documentElement
  
  const bodyBg = getComputedStyle(body).backgroundColor
  const htmlBg = getComputedStyle(html).backgroundColor
  
  const parseColor = (color: string): { r: number; g: number; b: number } | null => {
    const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
    if (match) {
      return {
        r: parseInt(match[1]),
        g: parseInt(match[2]),
        b: parseInt(match[3]),
      }
    }
    return null
  }
  
  const calculateLuminance = (r: number, g: number, b: number): number => {
    // sRGB to linear
    const toLinear = (c: number) => {
      c = c / 255
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
    }
    
    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
  }
  
  const bgColor = bodyBg !== 'rgba(0, 0, 0, 0)' ? bodyBg : htmlBg
  const parsed = parseColor(bgColor)
  
  if (parsed) {
    const luminance = calculateLuminance(parsed.r, parsed.g, parsed.b)
    return luminance < 0.5 ? 'dark' : 'light'
  }
  
  return 'light'
}



function scanDoubanPageStatus(): { status: string; rating: number } {
  const interestBox = document.getElementById('interest_sect_level')
  if (!interestBox) {
    return { status: 'none', rating: 0 }
  }
  
  const isMovie = currentIdentity?.type === 'movie' || currentIdentity?.type === 'book'
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
    rating: Utils.clampRating10(stars * 2),   }
}

function injectNeoDBPushButtons() {
  if (!currentIdentity) return

  const pageState = scanDoubanPageStatus()
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
  if (oldButtons) {
    oldButtons.remove()
  }
  
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
  
  const livePageState = scanDoubanPageStatus()
  const currentRating = livePageState.rating || currentRecord?.rating || 0
  const ratingMinus = Utils.clampRating10(currentRating - 1)
  const ratingPlus = Utils.clampRating10(currentRating + 1)
  
  // Use createElement to avoid XSS
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
  
  bindNeoDBPushEvents()
  
  infoLog('NeoDB push buttons injected')
}

function bindNeoDBPushEvents() {
  const pushMinusBtn = document.getElementById('umm-push-minus')
  const pushPlusBtn = document.getElementById('umm-push-plus')
  const pushOriginalBtn = document.getElementById('umm-push-original')
  
  if (pushMinusBtn) {
    pushMinusBtn.addEventListener('click', async () => {
      await pushToNeoDB(-1)
    })
  }
  
  if (pushPlusBtn) {
    pushPlusBtn.addEventListener('click', async () => {
      await pushToNeoDB(1)
    })
  }
  
  if (pushOriginalBtn) {
    pushOriginalBtn.addEventListener('click', async () => {
      await pushToNeoDB(0)
    })
  }
}

async function pushToNeoDB(ratingAdjust: number) {
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
        }).catch(err => {
          errorLog('Failed to send toast message:', err)
          showToast(t('neodb.config_missing'), 'error')
        })
      } else {
        showToast(t('neodb.config_missing'), 'error')
      }
      return
    }
    
    const livePageState = scanDoubanPageStatus()
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
        payload: {
          record: neodbData,
          // Token fetched by Background from storage, not passed here
        },
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

      injectNeoDBPushButtons()
      infoLog('[UMM] NeoDB buttons re-rendered after push success')
    } else {
      showToast(t('neodb.push_failed', { message: response.message || t('neodb.unknown_error') }), 'error')
    }
  } catch (error) {
    errorLog('Push to NeoDB failed:', error)
    showToast(t('neodb.sync_failed'), 'error')
  }
}

function showToast(message: string, type: 'success' | 'error' | 'info' = 'info') {
  if (type === 'success') {
    FloatingToast.success('UMM', message)
  } else if (type === 'error') {
    FloatingToast.error('UMM', message)
  } else {
    FloatingToast.info('UMM', message)
  }
}

void observeUrlChanges
function observeUrlChanges() {
  if (urlObserver) {
    urlObserver.disconnect()
  }
  
  let lastUrl = window.location.href
  
  urlObserver = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href
      infoLog('URL changed:', lastUrl)
      
      urlObserver?.disconnect()
      
      currentIdentity = Identity.fromUrl(lastUrl)
      
      if (currentIdentity) {
        if (statusChipElement) {
          statusChipElement.remove()
          statusChipElement = null
        }
        
        loadCurrentRecord().then(() => {
          observeUrlChanges()
          injectNeoDBPushButtons()
          startRatingObserver()
        })
      }
    }
  })
  
  urlObserver.observe(document.body, { childList: true, subtree: true })
}

function observeThemeChanges() {
  if (!isDoubanDetailPage()) return
  
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  
  themeChangeListener = (e: MediaQueryListEvent) => {
    infoLog('Theme changed:', e.matches ? 'dark' : 'light')
    
    if (statusChipElement && currentIdentity) {
      statusChipElement.remove()
      injectNeoDBPushButtons()
    }
  }
  
  if (mediaQuery.addEventListener) {
    mediaQuery.addEventListener('change', themeChangeListener)
  } else if (mediaQuery.addListener) {
    // Fallback for older browsers
    mediaQuery.addListener(themeChangeListener)
  }
}


function setupContextInvalidationListener() {
  // No-op: context invalidation handled by safeSendMessage retry logic
}


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false
  if (message.type === 'SHOW_TOAST') {
    const { type, title, message: msg } = message.payload
    
    if (type === 'success') {
      FloatingToast.success(title, msg)
    } else if (type === 'error') {
      FloatingToast.error(title, msg)
    } else if (type === 'loading') {
      FloatingToast.loading(title, msg)
    } else {
      FloatingToast.info(title, msg)
    }
    
    sendResponse({ success: true })
    return true  // Keep message channel open for async response
  }
})
