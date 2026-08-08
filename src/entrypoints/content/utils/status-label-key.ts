/**
 * 状态文案键选择（legacy 内容脚本共享纯函数）。
 *
 * 按媒体类型选择状态 i18n 键的后缀变体：music→听（_music）、book→读（_book）、
 * game→玩（_game），其余（movie/tv/anime/undefined）→ 基础键。
 *
 * 抽取自 utils/dom.ts createStatusChip 的 k() 与 bangumi-list-extract.ts
 * bangumiListMarkerSpec 的 labelKey()（两份同构闭包）——单一权威实现。
 * 纯函数：无 DOM、无 imports 依赖，可在 Playwright 单元测试中独立运行。
 */
export function statusLabelKey(mediaType: string, suffix: string, base: string): string {
  return mediaType === 'music'
    ? `status.${suffix}_music`
    : mediaType === 'book'
      ? `status.${suffix}_book`
      : mediaType === 'game'
        ? `status.${suffix}_game`
        : base
}
