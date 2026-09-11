/**
 * 色花堂 URL 判型（纯函数，零内部依赖——document_start 早期入口与
 * document_idle 主入口共用）。
 *
 * 列表页（forumdisplay）形态：
 *   - forum-{fid}-{page}.html      （伪静态）
 *   - forum.php?mod=forumdisplay   （动态）
 * 帖子详情页（viewthread）形态：
 *   - thread-{tid}-{page}-{extra}.html （伪静态）
 *   - forum.php?mod=viewthread&tid={tid} （动态）
 * 首页（pg_index）：站点根或 forum.php 无 mod（mb=empty）
 * 搜索页（pg_search）：search.php?mod=forum&...（mod=forum 即仅论坛帖搜索）
 *
 * 判型职责划分（与 ADR-024 / ADR-025 决策一致）：
 *   - isForumDisplayUrl → 早期入口决定是否建 overlay 壳（首帧覆盖）；
 *   - isThreadUrl       → 主入口静默记录已看（不建 overlay、不注入 UI）；
 *   - isIndexUrl        → 首页 overlay 编排入口（分区网格）；
 *   - isSearchUrl       → 搜索页 overlay 编排入口（结果列表）；
 *   - classifyPage      → 统一分流（按优先级：viewthread > forumdisplay >
 *                          search > index；推荐用此函数拿一致决策）。
 */

/** 伪静态帖子路径：/thread-<tid>(-...)*.html */
const THREAD_PATH_RE = /^\/thread-(\d+)/

/** 伪静态论坛分区路径：/forum-{fid}(-{page}).html */
const FORUM_PATH_RE = /^\/forum-(\d+)(?:-(\d+))?\.html/

/**
 * 从 URL 提取帖子 tid 跟踪键（`TID-<数字>`）；非帖子页 → null。
 *
 * 该函数是 TID 键的唯一提取源：列表行解析（parseThreadRow 的 tid 字段）
 * 与帖子页静默记录（resolveThreadWatchKey 兜底）经它复用，避免两处正则漂移。
 */
export function extractThreadTidFromUrl(url: string): string | null {
  try {
    const u = new URL(url)
    const pathMatch = THREAD_PATH_RE.exec(u.pathname)
    if (pathMatch) return `TID-${pathMatch[1]}`
    if (u.pathname === '/forum.php' && u.searchParams.get('mod') === 'viewthread') {
      const tid = u.searchParams.get('tid')
      if (tid && /^\d+$/.test(tid)) return `TID-${tid}`
    }
    return null
  } catch {
    return null
  }
}

/** 帖子详情页判型（静默记录已看，不建 overlay）。 */
export function isThreadUrl(url: string): boolean {
  return extractThreadTidFromUrl(url) !== null
}

/**
 * 列表页判型（早期入口建壳依据）。
 * 动态态仅 `forumdisplay` 命中；`viewthread` / 论坛首页 / 分区页均排除。
 */
export function isForumDisplayUrl(url: string): boolean {
  try {
    const u = new URL(url)
    if (FORUM_PATH_RE.test(u.pathname)) return true
    if (u.pathname === '/forum.php') return u.searchParams.get('mod') === 'forumdisplay'
    return false
  } catch {
    return false
  }
}

/**
 * 首页判型（站点根 / index.php / forum.php 无 mod）。
 * 仅根路径、`index.php` 或 `forum.php`（mb 缺省视为首页）。portal.php /
 * home.php 一律排除——项目不覆盖这两类「瀑布流/动态」页。
 * `forum.php?gid=N`（分类聚合页）排除：该页无 category_ 容器，判 index 会
 * 建壳后立刻 dismiss（首帧覆盖闪烁）。
 */
export function isIndexUrl(url: string): boolean {
  try {
    const u = new URL(url)
    if (u.pathname === '/' || u.pathname === '/index.php') return true
    if (u.pathname === '/forum.php') {
      if (u.searchParams.has('gid')) return false
      const mod = u.searchParams.get('mod')
      return mod === null || mod === ''
    }
    return false
  } catch {
    return false
  }
}

/**
 * 搜索页判型（仅论坛帖搜索；mod=user 排除）。
 * 路径：search.php；mod=forum；任意 orderby/页码/关键词。
 */
export function isSearchUrl(url: string): boolean {
  try {
    const u = new URL(url)
    if (u.pathname !== '/search.php') return false
    return u.searchParams.get('mod') === 'forum'
  } catch {
    return false
  }
}

/**
 * 页面类型（统一分流枚举）。优先级：viewthread > forumdisplay > search > index。
 * 单一函数实现确保早期入口与主入口决策完全一致。
 */
export type SehuatangPageKind = 'thread' | 'forumdisplay' | 'search' | 'index' | 'other'

export function classifyPage(url: string): SehuatangPageKind {
  if (isThreadUrl(url)) return 'thread'
  if (isForumDisplayUrl(url)) return 'forumdisplay'
  if (isSearchUrl(url)) return 'search'
  if (isIndexUrl(url)) return 'index'
  return 'other'
}

/**
 * 是否需要 overlay（早期入口建壳 + 主入口接管）。
 * thread/other 排除：thread 走静默记录，other 走非托管。
 */
export function isOverlayPage(kind: SehuatangPageKind): boolean {
  return kind === 'forumdisplay' || kind === 'search' || kind === 'index'
}

/**
 * 从搜索页 URL 提取关键词（搜索组件回填用）。
 *
 * 站点实态（.localref 搜索夹具 `saved from url` 头核实）：**结果页 URL 用
 * `kw`**（`search.php?mod=forum&…&searchsubmit=yes&kw=自行打包`）；而站点搜索
 * 表单/高级筛选链接与本扩展 buildSearchUrl 生成的是 `srchtxt`。两者都真实
 * 存在 → **kw 优先、srchtxt 兜底**（URLSearchParams 自动解码百分号编码；
 * 空值 `kw=` 视为缺省，同样回退 srchtxt——`||` 而非 `??`）。
 * 解析失败 / 两者皆无 / 仅空白 → ''（调用方可再退化到页面「结果:」h2 关键词）。
 */
export function extractSearchKeyword(url: string): string {
  try {
    const u = new URL(url)
    const kw = u.searchParams.get('kw')?.trim() ?? ''
    const srchtxt = u.searchParams.get('srchtxt')?.trim() ?? ''
    return kw || srchtxt
  } catch {
    return ''
  }
}

/**
 * 相对 URL → 绝对化后再过 http(s) 协议白名单（自 app-home 内联工具收编，
 * 首页子版块链接/图标与风控页进入按钮兜底导航共用）。
 * 夹具/站点里的链接多为相对 URL（forum-2-1.html）——只做 `^https?://` 一刀切
 * 会把有效链接全打回 ''（卡片静默失效）；先解析再白名单两全。解析失败或
 * 非 http(s) 协议（javascript: 等）→ ''。
 * 注：基址取 location.href，浏览器侧专用（node 单测环境无 location）。
 */
export function toSafeAbsoluteUrl(raw: string | null): string {
  if (!raw) return ''
  try {
    const u = new URL(raw, location.href)
    return /^https?:$/.test(u.protocol) ? u.href : ''
  } catch {
    return ''
  }
}
