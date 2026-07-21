import React from 'react'
import { UmmStatusBadgeWrapper } from '@/content/douban/components/UmmStatusBadgeWrapper'

interface UmmBillboardCardProps {
  order: string
  title: string
  href: string
  badgeStatus: number
  badgeRating: number
  type?: 'movie' | 'music' | 'book' | 'game'
}

/**
 * UmmBillboardCard — ranking card for the weekly billboard section.
 * Shows rank number (with gold/silver/bronze styling for top 3),
 * title, and status badge.
 * Ported from the Vue UmmBillboardCard component.
 */
export const UmmBillboardCard: React.FC<UmmBillboardCardProps> = ({
  order,
  title,
  href,
  badgeStatus,
  badgeRating,
  type = 'movie',
}) => {
  const orderNum = parseInt(order, 10)
  const rankClass =
    orderNum === 1 ? 'umm-billboard-order--gold'
    : orderNum === 2 ? 'umm-billboard-order--silver'
    : orderNum === 3 ? 'umm-billboard-order--bronze'
    : ''

  const cardClass =
    orderNum === 1 ? 'umm-billboard-card--gold'
    : orderNum === 2 ? 'umm-billboard-card--silver'
    : orderNum === 3 ? 'umm-billboard-card--bronze'
    : ''

  return React.createElement(
    'a',
    {
      href,
      target: '_blank',
      rel: 'noopener noreferrer',
      className: `umm-billboard-card${cardClass ? ` ${cardClass}` : ''}`,
    },
    React.createElement('span', { className: `umm-billboard-order${rankClass ? ` ${rankClass}` : ''}` }, order),
    React.createElement('span', { className: 'umm-billboard-title' }, title),
    React.createElement(UmmStatusBadgeWrapper, {
      status: badgeStatus,
      rating: badgeRating,
      variant: 'small',
      type,
    }),
  )
}
