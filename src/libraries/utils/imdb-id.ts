/**
 * IMDb tt-id 识别（纯函数，libraries 层）。
 *
 * 从任意文本中提取 tt-xxx 形式的 IMDb id。支持三种形态：
 * - 完整链接： https://www.imdb.com/title/tt0111161/
 * - 标签形态： IMDb: tt0111161 / IMDb：tt0111161（半角/全角冒号）
 * - 裸 id：    tt0111161
 *
 * 归属说明：本模块刻意置于 `src/utils/`（libraries）而非豆瓣站点目录——
 * 搜索查询归一化器（search-normalizer）同样需要该能力，若留在
 * `content/douban/` 会让 libraries 反向依赖站点编排层（架构守卫规则 C）。
 * 豆瓣特有的「从搜索结果条目对象提取」逻辑（extractImdbIdFromItem）
 * 仍留在 `content/douban/shared/imdb-extract.ts`，它单向依赖本模块。
 */

/** 完整 imdb.com 链接或 tt-id 文本 */
const IMDB_LINK_RE = /imdb\.com\/title\/(tt\d+)/i;
/** "IMDb: ttxxx" / "IMDb：ttxxx" 标签形态（半角/全角冒号） */
const IMDB_LABEL_RE = /(?:IMDb|imdb)\s*[:：]?\s*(tt\d{5,})/i;
/** 裸 tt-id（5+ 位数字，避免 tt123 之类误报） */
const BARE_TT_RE = /\b(tt\d{5,})\b/i;

/** Extract a tt-xxx IMDb id from arbitrary text; null when absent. */
export function extractImdbIdFromText(text: string): string | null {
  if (!text) return null;
  const link = text.match(IMDB_LINK_RE)?.[1];
  if (link) return link.toLowerCase();
  const label = text.match(IMDB_LABEL_RE)?.[1];
  if (label) return label.toLowerCase();
  const bare = text.match(BARE_TT_RE)?.[1];
  if (bare) return bare.toLowerCase();
  return null;
}
