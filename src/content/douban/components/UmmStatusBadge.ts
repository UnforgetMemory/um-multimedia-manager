import { h, type FunctionalComponent } from 'vue'

type StatusType = 'done' | 'none' | 'wish'
type UmmBadgeType = 'movie' | 'music'

interface UmmStatusBadgeProps {
  status: number
  rating?: number
  variant?: 'default' | 'small' | 'inline'
  type?: UmmBadgeType
}

const BADGE_LABELS: Record<UmmBadgeType, { done: string; wish: string; none: string }> = {
  movie: { done: '已看', wish: '想看', none: '未看' },
  music: { done: '已听', wish: '想听', none: '未听' },
}

export const UmmStatusBadge: FunctionalComponent<UmmStatusBadgeProps> = (props) => {
  const statusType: StatusType = props.status === 2 ? 'done' : props.status === 1 ? 'wish' : 'none'
  const labels = BADGE_LABELS[props.type ?? 'movie']
  const statusText = statusType === 'done'
    ? (props.rating ? `${labels.done} ${props.rating}` : labels.done)
    : statusType === 'wish' ? labels.wish : labels.none
  const variant = props.variant ?? 'default'
  const classes = `umm-status umm-status--${variant} umm-status--${statusType}`
  return h('span', { class: classes }, statusText)
}

UmmStatusBadge.props = ['status', 'rating', 'variant', 'type']
