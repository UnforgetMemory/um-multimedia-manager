/**
 * Centralized status → label mappings for Douban overlay UI.
 *
 * Two semantically distinct families (per ADR-009):
 * 1. interestBarLabels — interest-marking buttons (wish/do/collect/mark)
 * 2. statusBadgeLabels — status display badges (done/wish/none/doing)
 *
 * Decision-1: game done text is '玩过' (not '已玩') across both families.
 */

export type MediaType = 'movie' | 'music' | 'book' | 'game'

/** Interest bar button labels (wish/do/collect/mark) */
export type InterestBarKey = 'wish' | 'do' | 'collect' | 'mark'
export type InterestBarLabels = Record<InterestBarKey, string>

/** Status badge display labels (done/wish/none/doing) */
export type StatusBadgeKey = 'done' | 'wish' | 'none' | 'doing'
export type StatusBadgeLabels = Record<StatusBadgeKey, string>

/** Interest bar labels per media type. Used in UmmInterestBar. */
export const interestBarLabels: Record<MediaType, InterestBarLabels> = {
  movie: { wish: '想看', do: '在看', collect: '已看', mark: '标记' },
  music: { wish: '想听', do: '在听', collect: '已听', mark: '标记' },
  book: { wish: '想读', do: '在读', collect: '已读', mark: '标记' },
  game: { wish: '想玩', do: '在玩', collect: '玩过', mark: '标记' },
}

/** Status badge labels per media type. Used in UmmStatusBadge and collect page titles. */
export const statusBadgeLabels: Record<MediaType, StatusBadgeLabels> = {
  movie: { done: '已看', wish: '想看', none: '未看', doing: '在看' },
  music: { done: '已听', wish: '想听', none: '未听', doing: '在听' },
  book: { done: '已读', wish: '想读', none: '未读', doing: '在读' },
  game: { done: '玩过', wish: '想玩', none: '未玩', doing: '在玩' },
}
