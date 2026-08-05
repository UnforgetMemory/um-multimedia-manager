/**
 * Bangumi 浏览列表页纯提取函数。
 *
 * 无 DOM 访问、无 entrypoints 依赖（仅本地类型），可在 Playwright 单元测试中独立运行。
 * DOM 事实来源：.localref/bangumi/pages/anime_browser.html
 * （<ul id="browserItemList" class="browserFull browser-list"><li id="item_545465" class="item odd clearit">…）。
 *
 * li id="item_{subjectId}" 是列表卡片的主键标识，无需解析 href。
 */

/**
 * 从 <li id="item_{subjectId}"> 的 id 提取 subjectId。
 * 仅 "item_" + 纯数字命中；其余（含空串、大小写不符、非数字后缀）返回 null。
 */
export function extractListItemId(liId: string): string | null {
  const match = liId.match(/^item_(\d+)$/)
  return match ? match[1] : null
}

/**
 * 从 pathname 识别浏览列表类型（路由门控用）。
 * 仅 /(anime|book|music|game)/browser 命中（允许尾斜杠或子路径，兼容分页）；
 * /browser 单独出现（404）、/anime 博客 feed、/subject/{id} 详情页均返回 null。
 */
export function extractBrowserPathType(pathname: string): string | null {
  const match = pathname.match(/^\/(anime|book|music|game)\/browser(?:\/|$)/)
  return match ? match[1] : null
}

/**
 * 从 "{type}::{providerId}" store key 提取 providerId（构建 状态映射 用）。
 * 必须恰好一个 "::" 分隔且 providerId 非空；否则返回 null。
 */
export function extractProviderIdFromKey(key: string): string | null {
  const parts = key.split('::')
  if (parts.length !== 2) return null
  const providerId = parts[1]
  return providerId.length > 0 ? providerId : null
}

/**
 * 将浏览列表页类型映射为 bangumi store key 的类型前缀。
 * 记录键格式为 "{type}::{providerId}"，类型与详情页 identity.type 一致
 * （见 BangumiMediaType / resolveBangumiIdentity）：动画以 'tv' 前缀存储
 * （bgm 无 anime 类型），book/music/game 使用同名前缀。
 * 未知/空类型返回 null（调用方回退全表扫描）。
 * 纯函数：无 DOM、无 imports，可在 Playwright 单元测试中独立运行。
 */
export function bangumiTypePrefix(mediaType: string | null | undefined): string | null {
  switch (mediaType) {
    case 'anime':
      return 'tv'
    case 'book':
      return 'book'
    case 'music':
      return 'music'
    case 'game':
      return 'game'
    default:
      return null
  }
}

/**
 * 计算状态标记规格：status → i18n labelKey + 语义化 data-status 属性值。
 * 0=未看(none) 1=想看(wish) 2=已看(done) 3=在看(doing)；
 * 其余任意值（含 NaN、负数、越界）回退为 none。
 * mediaType 决定状态文案语义（回退同样跟随对应变体）：
 * 'music' → 听：0=未听(none_music) 1=想听(wish_music) 2=已听(done_music) 3=在听(doing_music)；
 * 'book'  → 读：0=未读(none_book) 1=想读(wish_book) 2=已读(done_book) 3=在读(doing_book)；
 * 'game'  → 玩：0=未玩(none_game) 1=想玩(wish_game) 2=已玩(done_game) 3=在玩(doing_game)；
 * 其余 mediaType（anime/undefined/其他）保持基础文案（看）。
 * data-status 语义值不随 mediaType 变化（驱动全局语义色）。
 * 语义值与全局样式系统（src/entrypoints/content/styles/global.ts 的
 * .umm-list-status[data-status=...] 选择器）对齐，暗色主题由 _DARK token 自动适配。
 * 纯函数：无 DOM、无 imports，可在 Playwright 单元测试中独立运行。
 */
export function bangumiListMarkerSpec(
  status: number,
  mediaType?: string,
): { labelKey: string; statusAttr: string } {
  const labelKey = (suffix: string, base: string): string =>
    mediaType === 'music'
      ? `status.${suffix}_music`
      : mediaType === 'book'
        ? `status.${suffix}_book`
        : mediaType === 'game'
          ? `status.${suffix}_game`
          : base
  switch (status) {
    case 1:
      return { labelKey: labelKey('wish', 'status.wish'), statusAttr: 'wish' }
    case 2:
      return { labelKey: labelKey('done', 'status.done'), statusAttr: 'done' }
    case 3:
      return { labelKey: labelKey('doing', 'status.doing'), statusAttr: 'doing' }
    case 0:
    default:
      return { labelKey: labelKey('none', 'status.none'), statusAttr: 'none' }
  }
}

/**
 * 计算评分展示文本（与 Utils.formatRating10 输出完全一致，但零依赖）：
 * 先按 0.5 步进钳制到 [0,10]（Math.round(num * 2) / 2），
 * 整数省略小数位，否则保留 1 位小数；返回时追加 "/10" 后缀（如 "8.5/10"）。
 * rating <= 0 / 非有限值返回 ''（不渲染评分徽章）。
 * 纯函数：无 DOM、无 imports，可在 Playwright 单元测试中独立运行。
 */
export function bangumiListRatingText(rating: number): string {
  const num = Number(rating)
  if (!Number.isFinite(num) || num <= 0) return ''
  const clamped = Math.max(0, Math.min(10, Math.round(num * 2) / 2))
  const normalized = Number(clamped.toFixed(1))
  if (!normalized) return ''
  const text = Number.isInteger(normalized) ? String(normalized) : normalized.toFixed(1)
  return `${text}/10`
}
