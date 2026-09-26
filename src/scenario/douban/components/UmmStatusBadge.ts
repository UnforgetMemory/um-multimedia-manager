import { h, type FunctionalComponent } from 'vue'
import type { MediaType } from '../shared/status-labels'
import { statusBadgeLabels } from '../shared/status-labels'

type StatusType = 'done' | 'none' | 'wish' | 'doing'

interface UmmStatusBadgeProps {
  status: number
  rating?: number
  variant?: 'default' | 'small' | 'inline'
  type?: MediaType
}

export const UmmStatusBadge: FunctionalComponent<UmmStatusBadgeProps> = (props) => {
  const statusType: StatusType = props.status === 2 ? 'done' : props.status === 3 ? 'doing' : props.status === 1 ? 'wish' : 'none'
  const labels = statusBadgeLabels[props.type ?? 'movie']
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
