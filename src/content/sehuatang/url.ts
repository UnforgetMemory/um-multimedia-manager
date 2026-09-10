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
 * 其余（论坛首页 / 分区页 / 搜索页）不建 overlay，也不记录。
 *
 * 判型职责划分：
 *   - isForumDisplayUrl → 早期入口决定是否建 overlay 壳（首帧覆盖）；
 *   - isThreadUrl       → 主入口静默记录已看（不建 overlay、不注入 UI）。
 */

/** 伪静态帖子路径：/thread-<tid>(-...)*.html */
const THREAD_PATH_RE = /^\/thread-(\d+)/

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
    if (/^\/forum-\d+-\d+\.html/.test(u.pathname)) return true
    if (u.pathname === '/forum.php') return u.searchParams.get('mod') === 'forumdisplay'
    return false
  } catch {
    return false
  }
}
