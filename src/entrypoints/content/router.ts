/**
 * Content Script 路由器
 * 功能：根据 URL 动态加载对应的页面处理器
 */

import { UrlResolverBuilder, PT_HOSTS } from '@/libraries/identity';
import type { UrlIdentity } from '@/types';
import { infoLog, errorLog } from '@/libraries/utils/logger';
import { intervalWhenVisible } from '@/libraries/utils/visibility';
import { handleIMDbDetailPage } from './handlers/imdb';
import { handleTMDBHomepage, handleTMDBDetailPage } from './handlers/tmdb';
import { handleNeoDBDetailPage } from './handlers/neodb';
import { handleBangumiDetailPage } from './handlers/bangumi';
import { handleBangumiListPage } from './handlers/bangumi-list';
import { PTDimmer } from './enhancers/pt';
import { handleMukakuDetailPage, handleMukakuListPage, cleanupMukaku } from './handlers/mukaku';
import { extractBangumiSubjectId } from './handlers/bangumi-extract';
import { extractBrowserPathType } from './handlers/bangumi-list-extract';
import { handlePTDetailPage } from './handlers/pt-detail';
import { handleJavDBPage } from './handlers/javdb';
import type { GlobalStyleBlock } from './styles/global';

// PTDimmer singleton — reused across SPA navigations to avoid leaking observers
let ptdimmerInstance: PTDimmer | null = null;

/**
 * Teardown handle a route handler may return. The router calls it before the
 * next dispatch runs, so observers/timers never outlive the route that created them.
 */
export type RouteDisposer = () => void;

/**
 * 路由规则接口
 */
interface RouteRule {
  match: (url: string) => boolean;
  handler: (identity: UrlIdentity | null) => Promise<RouteDisposer | void> | RouteDisposer | void;
  /**
   * 该路由实际消费的 injectGlobalStyles 块子集（X5 按需注入）。
   * - undefined（缺省）→ 全量注入，行为与历史完全一致。
   * - []                → 零消费，跳过注入。
   * 必须与 handler 注入 UI 的类名/var(--umm-*) 使用面逐一核对后方可声明。
   */
  styleBlocks?: readonly GlobalStyleBlock[];
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
        await handleMukakuDetailPage();
      } else {
        // 列表页
        await handleMukakuListPage();
      }
      // 注册清理函数，防止内存泄漏
      window.addEventListener('beforeunload', cleanupMukaku, { once: true });
    },
  },

  // IMDb detail page
  {
    match: (url) => url.includes('www.imdb.com/title/tt'),
    handler: async (identity) => {
      if (!identity) return;
      // A lingering state observer keeps rescanning the previous title
      // after SPA navigation away, so it tears down with this route.
      return await handleIMDbDetailPage(identity);
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
      if (identity) return await handleNeoDBDetailPage(identity);
    },
  },

  // Bangumi subject detail page — media type inferred from infobox DOM (resolveIdentity)
  {
    match: (url) =>
      /bgm\.tv|bangumi\.tv|chii\.in/.test(url) &&
      extractBangumiSubjectId(new URL(url).pathname) !== null,
    handler: async (identity) => {
      if (identity) return await handleBangumiDetailPage(identity);
    },
  },

  // Bangumi browse/list pages — status markers on subject cards (no overlap with /subject/)
  {
    match: (url) =>
      /bgm\.tv|bangumi\.tv|chii\.in/.test(url) &&
      extractBrowserPathType(new URL(url).pathname) !== null,
    handler: async () => {
      await handleBangumiListPage();
    },
  },

  // PT site detail page (extract and cache platform ID)
  {
    match: (url) =>
      (url.includes('m-team.cc/detail') && !url.includes('/browse')) ||
      (PT_HOSTS.some((h) => url.includes(h)) && url.includes('details.php')),
    handler: async () => {
      await handlePTDetailPage(location.href);
    },
  },

  // PT site dimmer
  {
    match: (url) =>
      (url.includes('m-team.cc') && (url.includes('/browse') || url.includes('#/browse'))) ||
      PT_HOSTS.some((h) => url.includes(`${h}/torrents.php`) || url.includes(`${h}/videos.php`)) ||
      url.includes('pterclub.net/officialgroup.php'),
    // PT 淡化仅消费 .umm-dimmed + 焦点环/滚动条微调（自带 CSS 无 --umm-* 裸依赖），
    // 徽章/按钮/面板等块在本路由零引用 → 最小子集（theme-vars 由 API 自动前置）。
    styleBlocks: ['dimmer', 'focus-visible', 'scrollbar'],
    handler: async () => {
      const instance = ptdimmerInstance ?? new PTDimmer();
      ptdimmerInstance = instance;
      instance.cleanup();
      await instance.runFor(location.href);
      // cleanup() is idempotent — a same-route re-dispatch already cleaned inside runFor.
      return () => {
        instance.cleanup();
        if (ptdimmerInstance === instance) ptdimmerInstance = null;
      };
    },
  },

  // TMDB homepage — card badge scan
  {
    match: (url) => {
      try {
        const u = new URL(url);
        return u.hostname.endsWith('themoviedb.org') && (u.pathname === '/' || u.pathname === '');
      } catch {
        return false;
      }
    },
    handler: async () => {
      return await handleTMDBHomepage();
    },
  },

  // TMDB detail page (movie/tv)
  {
    match: (url) => url.includes('themoviedb.org/movie/') || url.includes('themoviedb.org/tv/'),
    handler: async (identity) => {
      if (identity) return await handleTMDBDetailPage(identity);
    },
  },

  // JavDB watched dimming
  {
    match: (url) => url.includes('javdb.com'),
    // javdb 的淡化样式全部自带（handlers/javdb.ts 内联 #umm-javdb-styles，
    // 零 --umm-* var 依赖、零 ALL_STYLES 类名消费）→ 全局面板零消费。
    styleBlocks: [],
    handler: async () => {
      return await handleJavDBPage();
    },
  },
];

/**
 * 查找匹配的路由
 */
function findMatchingRoute(url: string): RouteRule | null {
  for (const route of ROUTES) {
    if (route.match(url)) {
      return route;
    }
  }
  return null;
}

/**
 * 检查 URL 是否匹配任何路由（用于懒加载判断）
 */
export function hasMatchingRoute(url: string): boolean {
  return findMatchingRoute(url) !== null;
}

/**
 * 查询某 URL 对应路由的 injectGlobalStyles 按需子集（X5 包体波）。
 * 返回 undefined = 该路由未声明子集（或无匹配路由）→ 调用方保持全量注入。
 */
export function getGlobalStyleBlocksForUrl(url: string): readonly GlobalStyleBlock[] | undefined {
  return findMatchingRoute(url)?.styleBlocks;
}

/**
 * Route lifetime state.
 *
 * `activeDisposer` is the teardown of the route currently live. `dispatchSeq`
 * guards overlapping dispatches: SPA URLs change faster than awaited handlers
 * settle, so a disposer that arrives after a newer dispatch began is released
 * immediately instead of being registered as the live one.
 */
let activeDisposer: RouteDisposer | null = null;
let dispatchSeq = 0;

function runDisposer(disposer: RouteDisposer | void | null): void {
  if (typeof disposer !== 'function') return;
  try {
    disposer();
  } catch (error: unknown) {
    errorLog('Router: Route disposer failed:', error);
  }
}

function disposeActiveRoute(): void {
  const disposer = activeDisposer;
  activeDisposer = null;
  runDisposer(disposer);
}

/**
 * 执行路由分发
 */
export async function dispatchRoute(url: string): Promise<void> {
  const route = findMatchingRoute(url);
  // Teardown runs before the next handler starts, so a handler never has to
  // reason about resources its predecessor left behind.
  disposeActiveRoute();
  const seq = ++dispatchSeq;

  if (!route) {
    infoLog(`Router: No matching route for: ${url}`);
    return;
  }

  infoLog(`Router: Matched route for: ${url}`);

  try {
    // 解析身份标识
    const identity = UrlResolverBuilder.fromUrl(url);

    // 执行处理器（可返回本路由的 teardown）
    const disposer = await route.handler(identity);

    if (seq !== dispatchSeq) {
      // A newer dispatch owns the page now — this one's resources are stale.
      runDisposer(disposer);
      return;
    }
    activeDisposer = typeof disposer === 'function' ? disposer : null;

    infoLog('Router: Route handler executed successfully');
  } catch (error: unknown) {
    errorLog('Router: Route handler failed:', error);
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
  let lastUrl = location.href;

  const checkUrl = () => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      callback(lastUrl);
    }
  };

  window.addEventListener('popstate', checkUrl);
  window.addEventListener('hashchange', checkUrl);

  const origPushState = history.pushState;
  const origReplaceState = history.replaceState;
  history.pushState = function (...args: Parameters<typeof origPushState>) {
    origPushState.apply(this, args);
    checkUrl();
  };
  history.replaceState = function (...args: Parameters<typeof origReplaceState>) {
    origReplaceState.apply(this, args);
    checkUrl();
  };

  // Fallback: interval poll for SPA edge cases (hash changes, direct location.href assignments)
  // Pauses automatically when the tab is hidden (Page Visibility API)
  const pollInterval = intervalWhenVisible(checkUrl, 1000);

  return () => {
    window.removeEventListener('popstate', checkUrl);
    window.removeEventListener('hashchange', checkUrl);
    history.pushState = origPushState;
    history.replaceState = origReplaceState;
    pollInterval.destroy();
  };
}

/**
 * 初始化路由器
 */
export function initRouter(): void {
  infoLog('Router: Initializing router...');

  try {
    // 立即执行一次路由分发
    dispatchRoute(location.href).catch((error) => {
      errorLog('Router: Initial route failed:', error);
    });

    // 监听 URL 变化
    const cleanup = watchUrlChanges((newUrl) => {
      infoLog(`Router: URL changed to: ${newUrl}`);
      dispatchRoute(newUrl).catch((error) => {
        errorLog('Router: Route change failed:', error);
      });
    });

    window.addEventListener('beforeunload', cleanup, { once: true });
    infoLog('Router: Router initialized successfully');
  } catch (error: unknown) {
    errorLog('Router: Router initialization failed:', error);
  }
}
