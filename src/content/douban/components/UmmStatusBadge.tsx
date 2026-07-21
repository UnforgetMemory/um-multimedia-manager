import React from 'react'

type StatusType = 'done' | 'none' | 'wish' | 'doing'
type UmmBadgeType = 'movie' | 'music' | 'book' | 'game'

interface UmmStatusBadgeProps {
  status: number
  rating?: number
  variant?: 'default' | 'small' | 'inline'
  type?: UmmBadgeType
}

const BADGE_LABELS: Record<UmmBadgeType, { done: string; wish: string; none: string; doing: string }> = {
  movie: { done: '已看', wish: '想看', none: '未看', doing: '在看' },
  music: { done: '已听', wish: '想听', none: '未听', doing: '在听' },
  book: { done: '已读', wish: '想读', none: '未读', doing: '在读' },
  game: { done: '已玩', wish: '想玩', none: '未玩', doing: '在玩' },
}

export const UmmStatusBadge: React.FC<UmmStatusBadgeProps> = ({ status, rating, variant = 'default', type = 'movie' }) => {
  const statusType: StatusType = status === 2 ? 'done' : status === 3 ? 'doing' : status === 1 ? 'wish' : 'none'
  const labels = BADGE_LABELS[type]
  const statusText = statusType === 'done'
    ? (rating ? `${labels.done} ${rating}` : labels.done)
    : statusType === 'doing' ? labels.doing
    : statusType === 'wish' ? labels.wish : labels.none

  const attrs: Record<string, string | undefined> = {
    className: `umm-status umm-status--${variant} umm-status--${statusType}`,
    'data-umm-status-raw': String(status),
    'data-umm-type': statusType,
    'data-umm-rating': rating !== undefined ? String(rating) : undefined,
  }

  return React.createElement('span', attrs, statusText)
}
