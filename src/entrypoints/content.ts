/**
 * Content Script Entry — UMM 多媒体管理器
 *
 * Responsibilities:
 * - Lazy-load initialization (skip non-matching pages)
 * - DB health check with retry
 * - Global style injection
 * - Router dispatch
 * - Theme/rating observers
 * - NeoDB push button injection (via content/neodb-push.ts)
 */

import { defineContentScript } from 'wxt/utils/define-content-script'
import { Identity } from '@/features/identity'
import { Store } from '@/features/database'
import { initRouter, hasMatchingRoute } from './content/router'
import { initI18n, startLocaleSync } from './content/i18n'
import { injectGlobalStyles } from './content/styles/global'
import { FloatingToast } from './content/utils/toast'
import { startRatingObserver, cleanupRatingObserver, setNeoDBInjector } from './content/observers/rating'
import { infoLog, errorLog, configureLogging } from '@/utils/logger'
import type { LogLevel, StoreRecord } from '@/types'
import { STORAGE_KEYS } from '@/config'
import { initEventBus } from '@/utils/event-bus'
import { injectNeoDBPushButtons } from './content/neodb-push'

let currentIdentity: ReturnType<typeof Identity.fromUrl> = null
let currentRecord: StoreRecord | null = null
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

    // Configure logging from storage
    try {
      const result = await chrome.storage.local.get([STORAGE_KEYS.DEBUG_ENABLED, STORAGE_KEYS.LOG_LEVEL])
      configureLogging({
        enabled: (result[STORAGE_KEYS.DEBUG_ENABLED] as boolean) ?? false,
        level: (result[STORAGE_KEYS.LOG_LEVEL] as LogLevel) ?? 'info',
      })
    } catch { /* keep defaults */ }

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

    if (!chrome?.runtime?.id) {
      errorLog('Chrome runtime not available!')
      return
    }

    const isMTeamSite = location.href.includes('m-team.cc')

    if (!hasMatchingRoute(location.href) && !isMTeamSite) {
      // Lightweight URL watcher for non-matching pages
      let initialized = false
      const tryInit = async () => {
        if (initialized || !hasMatchingRoute(location.href)) return
        initialized = true
        window.removeEventListener('popstate', tryInit)
        if (origPushState) history.pushState = origPushState
        if (origReplaceState) history.replaceState = origReplaceState
        infoLog('Route detected — running full initialization')
        await fullInit()
      }

      window.addEventListener('popstate', tryInit)
      const origPushState = history.pushState
      const origReplaceState = history.replaceState
      history.pushState = function (...args: [any, string, string?]) {
        origPushState.apply(this, args)
        tryInit()
      }
      history.replaceState = function (...args: [any, string, string?]) {
        origReplaceState.apply(this, args)
        tryInit()
      }
      return
    }

    await fullInit()

    async function fullInit() {
      try {
        await initI18n()
        startLocaleSync()

        // Wait for background DB
        let attempts = 0
        while (attempts < 8) {
          const ok = await Store.healthCheck()
          if (ok) break
          attempts++
          await new Promise(r => setTimeout(r, Math.min(500 * Math.pow(2, attempts), 8000)))
        }

        injectGlobalStyles()

        currentIdentity = Identity.fromUrl(window.location.href)
        if (currentIdentity) {
          await loadCurrentRecord()
        }

        initRouter()
        observeThemeChanges()

        // NeoDB push buttons (Douban detail pages)
        setNeoDBInjector(() => injectNeoDBPushButtons(currentIdentity, currentRecord))
        startRatingObserver()

        window.addEventListener('beforeunload', () => {
          if (themeChangeListener) {
            const mq = window.matchMedia('(prefers-color-scheme: dark)')
            if (mq.removeEventListener) mq.removeEventListener('change', themeChangeListener)
            else if (mq.removeListener) mq.removeListener(themeChangeListener)
          }
          cleanupRatingObserver()
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
    const key = `${currentIdentity.type}::${currentIdentity.providerId}`
    const storeName = `${currentIdentity.provider}_records`
    currentRecord = await Promise.race([
      Store.dbGet(storeName, key),
      new Promise<null>((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
    ])
  } catch {
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

function observeThemeChanges() {
  if (!isDoubanDetailPage()) return
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  themeChangeListener = () => {
    if (currentIdentity) injectNeoDBPushButtons(currentIdentity, currentRecord)
  }
  if (mq.addEventListener) mq.addEventListener('change', themeChangeListener)
  else if (mq.addListener) mq.addListener(themeChangeListener)
}

// Handle SHOW_TOAST messages from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false
  if (message.type === 'SHOW_TOAST') {
    const { type, title, message: msg } = message.payload
    if (type === 'success') FloatingToast.success(title, msg)
    else if (type === 'error') FloatingToast.error(title, msg)
    else if (type === 'loading') FloatingToast.loading(title, msg)
    else FloatingToast.info(title, msg)
    sendResponse({ success: true })
    return true
  }
})
