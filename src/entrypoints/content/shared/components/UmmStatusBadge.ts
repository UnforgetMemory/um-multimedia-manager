import { h, type FunctionalComponent } from 'vue'

/** Maps Douban badgeStatus (2=done, 1=wish, else=none) to visual state type. */
type StatusType = 'done' | 'none' | 'wish'

interface UmmStatusBadgeProps {
  /** 2=done (watched), 1=wish (want-to-watch), else=none */
  status: number
  /** Optional rating to display beside "watched" label (e.g. "已看 7.4") */
  rating?: number
  /** Visual variant: default | small | inline */
  variant?: 'default' | 'small' | 'inline'
}

/**
 * UmmStatusBadge — inline status chip reading Douban badge status values.
 * Renders a <span> with CSS-driven gradient/box-shadow styling.
 * Pure render function — no internal state, no computed overhead.
 */
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
