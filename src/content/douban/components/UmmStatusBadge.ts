import { h, type FunctionalComponent } from 'vue'

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

export const UmmStatusBadge: FunctionalComponent<UmmStatusBadgeProps> = (props) => {
  const statusType: StatusType = props.status === 2 ? 'done' : props.status === 3 ? 'doing' : props.status === 1 ? 'wish' : 'none'
  const labels = BADGE_LABELS[props.type ?? 'movie']
  const statusText = statusType === 'done'
    ? (props.rating ? `${labels.done} ${props.rating}` : labels.done)
    : statusType === 'doing' ? labels.doing
    : statusType === 'wish' ? labels.wish : labels.none
  const variant = props.variant ?? 'default'
  const classes = `umm-status umm-status--${variant} umm-status--${statusType}`
  const attrs: Record<string, string> = {
    'data-umm-status-raw': String(props.status),
    'data-umm-type': statusType,
  }
  if (props.rating !== undefined) {
    attrs['data-umm-rating'] = String(props.rating)
  }
  return h('span', { class: classes, ...attrs }, statusText)
}

UmmStatusBadge.props = ['status', 'rating', 'variant', 'type']
