/**
 * Bangumi 详情页纯提取函数。
 *
 * 无 DOM 访问、无 entrypoints 依赖（仅本地类型），可在 Playwright 单元测试中独立运行。
 * DOM 事实来源：.localref/bangumi/ 离线快照 + bgm.tv 页面结构。
 *
 * - INTEREST_TYPE：内联脚本变量，1=想看 2=看过 3=在看 4=搁置 5=抛弃
 * - infobox：<ul id="infobox"><li><span class="tip">话数: </span>26</li>...
 * - 用户评分：form[name="rate-now"] 内 name="rate" 的 checked radio（0-10）
 */

/** 单个 infobox 行的纯数据形态（对应 li > span.tip + 剩余文本）。 */
export interface BangumiInfoboxRow {
  label: string
  value: string
}

/** Bangumi 可从 DOM 推断的媒体类型。 */
export type BangumiMediaType = 'tv' | 'book' | 'music' | 'game' | 'movie'

/**
 * 从 pathname（或完整 URL）提取 subject id。
 * 仅 /subject/{数字} 命中；其余路径（含 /subject/abc）返回 null。
 */
export function extractBangumiSubjectId(pathname: string): string | null {
  const match = pathname.match(/\/subject\/(\d+)/)
  return match ? match[1] : null
}

/** 归一化 infobox 标签：去掉尾部全/半角冒号与空白（DOM textContent 通常为 "话数: "）。 */
function normalizeBangumiLabel(label: string): string {
  return label.replace(/[:：]\s*$/, '').trim()
}

/**
 * 依据 infobox 行推断媒体类型。判定词对齐 bgm.tv 真实页面标签
 * （见 .localref/bangumi/pages/ 离线快照）：
 * - 书籍：ISBN / 册数 / 出版社 / 连载杂志（漫画、轻小说无 ISBN 册数也命中；如 type_subject_599997）
 * - 音乐：碟片数量 / 碟片数（「碟片」子串覆盖两种写法；如 music_subject_309686/444838/16885）
 * - 游戏：游戏平台 / 开发 / 发行（如 game_subject_484230 无游戏平台也能命中）
 * - 影视：话数 / 放送开始（动漫与三次元剧集）
 * - 其余情况（含空）→ tv（默认回退；三次元电影无判别行时同样落此）
 *
 * 优先级 book → music → game → tv：书籍信号先行（出版社可与其它标签共存），
 * 碟片对音乐是决定性信号，发行/开发在书籍之后判定（书籍带发行时出版社先命中）。
 */
export function inferBangumiMediaType(rows: BangumiInfoboxRow[]): BangumiMediaType {
  const labels = rows.map((row) => normalizeBangumiLabel(row.label))
  const has = (keyword: string) => labels.some((label) => label.includes(keyword))

  // 书籍：ISBN / 册数 / 出版社 / 连载杂志（漫画/轻小说无 ISBN 也命中）
  if (has('ISBN') || has('册数') || has('出版社') || has('连载杂志')) return 'book'
  // 音乐：碟片数量 / 碟片数（「碟片」子串覆盖两种写法）
  if (has('碟片')) return 'music'
  // 游戏：游戏平台 / 开发 / 发行
  if (has('游戏平台') || has('开发') || has('发行')) return 'game'
  // 影视：动画与三次元剧集
  if (has('话数') || has('放送开始')) return 'tv'
  return 'tv'
}

/** Bangumi 页面可判断的收藏状态（INTEREST_TYPE → UMM 状态语义）。 */
export type BangumiPageStatus = 'done' | 'none' | 'wish' | 'doing'

/**
 * INTEREST_TYPE → 页面状态。
 * 1=想看→wish、2=看过→done、3=在看→doing；4=搁置/5=抛弃/未登录(null)→none。
 * 4/5 映射 none 而非直接清除：本地 wish/doing 记录不应被页面搁置/抛弃覆盖。
 */
export function extractBangumiStatus(interestType: number | null): BangumiPageStatus {
  switch (interestType) {
    case 1:
      return 'wish'
    case 2:
      return 'done'
    case 3:
      return 'doing'
    default:
      return 'none'
  }
}

/**
 * 解析用户评分（0-10）。radio value 或站点评分为字符串；
 * 非法/越界/null → 0。
 */
export function extractBangumiRating(raw: string | null): number {
  if (raw === null) return 0
  const value = Number.parseInt(raw, 10)
  if (Number.isNaN(value) || value < 0 || value > 10) return 0
  return value
}

/**
 * 从 .interest_now 文本推断 INTEREST_TYPE（window.INTEREST_TYPE 缺失时的兜底）。
 * 无关键词/空文本 → null。
 */
export function inferBangumiInterestFromText(text: string): number | null {
  if (!text) return null
  if (text.includes('想看')) return 1
  if (text.includes('看过')) return 2
  if (text.includes('在看')) return 3
  if (text.includes('搁置')) return 4
  if (text.includes('抛弃')) return 5
  return null
}
