/**
 * Content Script 路由器
 * 功能：根据 URL 动态加载对应的页面处理器
 */

import { Identity } from '@/features/identity'
import type { UrlIdentity } from '@/types'
import { handleIMDbDetailPage } from './handlers/imdb'
import { handleNeoDBDetailPage } from './handlers/neodb'
import { handleDoubanDetailPage } from './handlers/douban'
import { startSearchEnhancer } from './enhancers/douban-search'
import { PTDimmer } from './enhancers/pt-dimmer'
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
  // Mukaku 视频平台（优先匹配）
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

  // 豆瓣详情页（电影/音乐）
  {
    match: (url) =>
      url.includes('movie.douban.com/subject/') ||
      url.includes('music.douban.com/subject/'),
    handler: async (identity) => {
      if (identity) {
        await handleDoubanDetailPage(identity)
      }
    },
  },

  // IMDb 详情页
  {
    match: (url) => url.includes('www.imdb.com/title/tt'),
    handler: async (identity) => {
      if (identity) {
        await handleIMDbDetailPage(identity)
      }
    },
  },

  // NeoDB 详情页（电影/剧集/专辑）
  {
    match: (url) =>
      url.includes('neodb.social/movie/') ||
      url.includes('neodb.social/tv/') ||
      url.includes('neodb.social/album/'),
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

  // PT 站点详情页（提取并缓存平台 ID）
  {
    match: (url) =>
      (url.includes('m-team.cc/detail') && !url.includes('/browse')) ||
      (['audiences.me', 'hdhome.org', 'hdarea.club', 'ourbits.club', 'pterclub.net', 'pthome.net', 'haidan.cc'].some(
        (host) => url.includes(host),
      ) && url.includes('details.php')),
    handler: async () => {
      await handlePTDetailPage(location.href)
    },
  },

  // PT 站点 Dimmer
  {
    match: (url) =>
      url.includes('m-team.cc/browse') ||
      url.includes('audiences.me/torrents.php') ||
      url.includes('hdhome.org/torrents.php') ||
      url.includes('hdarea.club/torrents.php') ||
      url.includes('ourbits.club/torrents.php') ||
      url.includes('pterclub.net/torrents.php') ||
      url.includes('pterclub.net/officialgroup.php') ||
      url.includes('pthome.net/torrents.php') ||
      url.includes('haidan.cc/torrents.php') ||
      url.includes('haidan.cc/videos.php'),
    handler: async () => {
      if (!ptdimmerInstance) ptdimmerInstance = new PTDimmer()
      ptdimmerInstance.cleanup()
      await ptdimmerInstance.runFor(location.href)
    },
  },

  // JavDB 已阅淡化
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
    console.log('[UMM Router] No matching route for:', url)
    // Clean up PTDimmer if it was running (e.g. user navigated away from a PT site)
    // Use both module-level variable AND static reference for bulletproof cleanup
    const dimmer = ptdimmerInstance || PTDimmer.currentInstance
    if (dimmer) {
      console.log('[UMM Router] Cleaning up PTDimmer on route unmatch')
      dimmer.cleanup()
    }
    return
  }
  
  console.log('[UMM Router] Matched route for:', url)
  
  try {
    // 解析身份标识
    const identity = Identity.fromUrl(url)
    
    // 执行处理器
    await route.handler(identity)
    
    console.log('[UMM Router] Route handler executed successfully')
  } catch (error) {
    console.error('[UMM Router] Route handler failed:', error)
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

  return () => {
    window.removeEventListener('popstate', checkUrl)
    history.pushState = origPushState
    history.replaceState = origReplaceState
  }
}

/**
 * 初始化路由器
 */
export function initRouter(): void {
  console.log('[UMM Router] Initializing router...')
  
  try {
    // 立即执行一次路由分发
    dispatchRoute(location.href).catch(error => {
      console.error('[UMM Router] Initial route failed:', error)
    })
    
    // 监听 URL 变化
    const cleanup = watchUrlChanges((newUrl) => {
      console.log('[UMM Router] URL changed to:', newUrl)
      dispatchRoute(newUrl).catch(error => {
        console.error('[UMM Router] Route change failed:', error)
      })
    })
    
    window.addEventListener('beforeunload', cleanup, { once: true })
    console.log('[UMM Router] Router initialized successfully')
  } catch (error) {
    console.error('[UMM Router] Router initialization failed:', error)
  }
}
