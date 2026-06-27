import { h, type FunctionalComponent } from 'vue'

type StatusType = 'done' | 'none' | 'wish'

interface UmmStatusBadgeProps {
  status: number
  rating?: number
  variant?: 'default' | 'small' | 'inline'
}

export const UmmStatusBadge: FunctionalComponent<UmmStatusBadgeProps> = (props) => {
  const statusType: StatusType = props.status === 2 ? 'done' : props.status === 1 ? 'wish' : 'none'
  const statusText = statusType === 'done'
    ? (props.rating ? `已看 ${props.rating}` : '已看')
    : statusType === 'wish' ? '想看' : '未看'
  const variant = props.variant ?? 'default'
  const classes = `umm-status umm-status--${variant} umm-status--${statusType}`
  return h('span', { class: classes }, statusText)
}

UmmStatusBadge.props = ['status', 'rating', 'variant']
