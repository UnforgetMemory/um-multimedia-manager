/**
 * Content Script 路由器
 * 功能：根据 URL 动态加载对应的页面处理器
 */

import { Identity, PT_HOSTS } from '@/shared/identity'
import type { UrlIdentity } from '@/types'
import { infoLog, errorLog } from '@/utils/logger'
import { intervalWhenVisible } from '@/utils/visibility'
import { handleIMDbDetailPage } from './handlers/imdb'
import { handleTMDBHomepage, handleTMDBDetailPage } from './handlers/tmdb'
import { handleNeoDBDetailPage } from './handlers/neodb'
import { handleDoubanDetailPage } from './handlers/douban'
import { startSearchEnhancer } from './enhancers/douban-search'
import { PTDimmer } from './enhancers/pt'
import { handleMukakuDetailPage, handleMukakuListPage, cleanupMukaku } from './handlers/mukaku'
import { handlePTDetailPage } from './handlers/pt-detail'
import { handleSehuatangListPage } from './handlers/sehuatang'
import { handleJavDBPage } from './handlers/javdb'

// PTDimmer singleton — reused across SPA navigations to avoid leaking observers
let ptdimmerInstance: PTDimmer | null = null

/**
 * 路由规则接口
 */
interface RouteRule {
  match: (url: string) => boolean
  handler: (identity: UrlIdentity | null) => Promise<void> | void
}

/**
 * 路由表配置
 */
const ROUTES: RouteRule[] = [
  // Mukaku video platform (match first)
  {
    match: (url) => url.includes('web5.mukaku.com'),
    handler: async () => {
      if (location.href.includes('/mv/')) {
        // 详情页
        await handleMukakuDetailPage()
      } else {
        // 列表页
        await handleMukakuListPage()
      }
      // 注册清理函数，防止内存泄漏
      window.addEventListener('beforeunload', cleanupMukaku, { once: true })
    },
  },

  // 豆瓣详情页（电影/音乐/图书/游戏）
  {
    match: (url) =>
      url.includes('movie.douban.com/subject/') ||
      url.includes('music.douban.com/subject/') ||
      url.includes('book.douban.com/subject/') ||
      (url.includes('www.douban.com') && /\/game\/\d+\/?(\?.*)?$/.test(url)),
    handler: async (identity) => {
      if (identity) {
        await handleDoubanDetailPage(identity)
      }
    },
  },

  // IMDb detail page
  {
    match: (url) => url.includes('www.imdb.com/title/tt'),
    handler: async (identity) => {
      if (identity) {
        await handleIMDbDetailPage(identity)
      }
    },
  },

  // NeoDB detail page (movie/tv/album)
  {
    match: (url) =>
      url.includes('neodb.social/movie/') ||
      url.includes('neodb.social/tv/') ||
      url.includes('neodb.social/album/') ||
    url.includes('neodb.social/book/'),
    handler: async (identity) => {
      if (identity) {
        await handleNeoDBDetailPage(identity)
      }
    },
  },

  // 豆瓣搜索页增强器
  {
    match: (url) =>
      url.includes('search.douban.com/movie/subject_search') ||
      url.includes('search.douban.com/music/subject_search') ||
      url.includes('search.douban.com/book/subject_search') ||
      url.includes('movie.douban.com/chart') ||
      url.includes('movie.douban.com/typerank') ||
      url.includes('music.douban.com/top250'),
    handler: async () => {
      const cleanup = await startSearchEnhancer()
      // 保存清理函数，用于页面卸载时调用
      if (cleanup) {
        window.addEventListener('beforeunload', cleanup, { once: true })
      }
    },
  },

  // PT site detail page (extract and cache platform ID)
  {
    match: (url) =>
      (url.includes('m-team.cc/detail') && !url.includes('/browse')) ||
      (PT_HOSTS.some(h => url.includes(h)) && url.includes('details.php')),
    handler: async () => {
      await handlePTDetailPage(location.href)
    },
  },

  // PT site dimmer
  {
    match: (url) =>
      (url.includes('m-team.cc') &&
        (url.includes('/browse') || url.includes('#/browse'))) ||
      PT_HOSTS.some(h => url.includes(`${h}/torrents.php`) || url.includes(`${h}/videos.php`)) ||
      url.includes('pterclub.net/officialgroup.php'),
    handler: async () => {
      if (!ptdimmerInstance) ptdimmerInstance = new PTDimmer()
      ptdimmerInstance.cleanup()
      await ptdimmerInstance.runFor(location.href)
    },
  },

  // TMDB homepage — card badge scan
  {
    match: (url) => {
      try {
        const u = new URL(url)
        return u.hostname.endsWith('themoviedb.org') && (u.pathname === '/' || u.pathname === '')
      } catch { return false }
    },
    handler: async () => {
      await handleTMDBHomepage()
    },
  },

  // TMDB detail page (movie/tv)
  {
    match: (url) =>
      url.includes('themoviedb.org/movie/') || url.includes('themoviedb.org/tv/'),
    handler: async (identity) => {
      if (identity) {
        await handleTMDBDetailPage(identity)
      }
    },
  },

  // JavDB watched dimming
  {
    match: (url) => url.includes('javdb.com'),
    handler: async () => {
      await handleJavDBPage()
    },
  },

  // 色花堂论坛列表页
  {
    match: (url) =>
      (url.includes('sehuatang.net/forum') || url.includes('sehuatang.org/forum')),
    handler: async () => {
      await handleSehuatangListPage()
    },
  },
]

/**
 * 查找匹配的路由
 */
function findMatchingRoute(url: string): RouteRule | null {
  for (const route of ROUTES) {
    if (route.match(url)) {
      return route
    }
  }
  return null
}

/**
 * 检查 URL 是否匹配任何路由（用于懒加载判断）
 */
export function hasMatchingRoute(url: string): boolean {
  return findMatchingRoute(url) !== null
}

/**
 * 执行路由分发
 */
export async function dispatchRoute(url: string): Promise<void> {
  const route = findMatchingRoute(url)
  
  if (!route) {
    infoLog(`Router: No matching route for: ${url}`)
    // Clean up PTDimmer if it was running (e.g. user navigated away from a PT site)
    // Use both module-level variable AND static reference for bulletproof cleanup
    const dimmer = ptdimmerInstance || PTDimmer.currentInstance
    if (dimmer) {
      infoLog('Router: Cleaning up PTDimmer on route unmatch')
      dimmer.cleanup()
    }
    return
  }
  
  infoLog(`Router: Matched route for: ${url}`)
  
  try {
    // 解析身份标识
    const identity = Identity.fromUrl(url)
    
    // 执行处理器
    await route.handler(identity)
    
    infoLog('Router: Route handler executed successfully')
  } catch (error) {
    errorLog('Router: Route handler failed:', error)
  }
}

/**
 * 监听 URL 变化（适用于 SPA 应用）
 *
 * 覆盖两种 URL 变化方式:
 * 1. popstate — 浏览器前进/后退
 * 2. history.pushState / replaceState — SPA 客户端路由
 */
export function watchUrlChanges(callback: (url: string) => void): () => void {
  let lastUrl = location.href

  const checkUrl = () => {
    if (location.href !== lastUrl) {
      lastUrl = location.href
      callback(lastUrl)
    }
  }

  window.addEventListener('popstate', checkUrl)
  window.addEventListener('hashchange', checkUrl)

  const origPushState = history.pushState
  const origReplaceState = history.replaceState
  history.pushState = function (...args: Parameters<typeof origPushState>) {
    origPushState.apply(this, args)
    checkUrl()
  }
  history.replaceState = function (...args: Parameters<typeof origReplaceState>) {
    origReplaceState.apply(this, args)
    checkUrl()
  }

  // Fallback: interval poll for SPA edge cases (hash changes, direct location.href assignments)
  // Pauses automatically when the tab is hidden (Page Visibility API)
  const pollInterval = intervalWhenVisible(checkUrl, 1000)

  return () => {
    window.removeEventListener('popstate', checkUrl)
    window.removeEventListener('hashchange', checkUrl)
    history.pushState = origPushState
    history.replaceState = origReplaceState
    pollInterval.destroy()
  }
}

/**
 * 初始化路由器
 */
export function initRouter(): void {
  infoLog('Router: Initializing router...')
  
  try {
    // 立即执行一次路由分发
    dispatchRoute(location.href).catch(error => {
      errorLog('Router: Initial route failed:', error)
    })
    
    // 监听 URL 变化
    const cleanup = watchUrlChanges((newUrl) => {
      infoLog(`Router: URL changed to: ${newUrl}`)
      dispatchRoute(newUrl).catch(error => {
        errorLog('Router: Route change failed:', error)
      })
    })
    
    window.addEventListener('beforeunload', cleanup, { once: true })
    infoLog('Router: Router initialized successfully')
  } catch (error) {
    errorLog('Router: Router initialization failed:', error)
  }
}
