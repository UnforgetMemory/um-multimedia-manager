import React from 'react'
import { UmmImageWrapper } from './UmmImageWrapper'
import { UmmStatusBadgeWrapper } from './UmmStatusBadgeWrapper'
import { UmmRating } from './UmmRating'
import { ASPECT_RATIO } from '@/content/douban/shared/constants'

interface UmmMediaCardProps {
  mode: 'grid' | 'scroll'
  posterUrl: string
  title: string
  href?: string
  author?: string
  badgeStatus?: number
  badgeRating?: number
  rating?: string
  episodes?: string
  intro?: string
  type?: 'movie' | 'music' | 'book' | 'game'
}

export const UmmMediaCard: React.FC<UmmMediaCardProps> = ({
  mode,
  posterUrl,
  title,
  href = '',
  author = '',
  badgeStatus = 0,
  badgeRating = 0,
  rating = '',
  episodes = '',
  intro = '',
  type = 'movie',
}) => {
  const handleClick = () => {
    if (mode === 'grid' && href) {
      window.open(href, '_blank')
    }
  }

  const badgeVariant = mode === 'grid' ? 'small' : 'inline'
  const cardAspect = type === 'music' ? ASPECT_RATIO.SQUARE : ASPECT_RATIO.POSTER

  if (mode === 'grid') {
    return React.createElement(
      'div',
      {
        className: 'umm-rec-item',
        onClick: handleClick,
        style: { cursor: 'pointer' },
      },
      React.createElement(UmmStatusBadgeWrapper, {
        status: badgeStatus,
        rating: badgeRating,
        variant: badgeVariant,
        type,
      }),
      React.createElement('div', { className: 'umm-rec-cover' },
        React.createElement(UmmImageWrapper, {
          src: posterUrl,
          alt: title,
          aspectRatio: cardAspect,
        }),
      ),
      React.createElement('span', { className: 'umm-rec-title' }, title),
      author ? React.createElement('span', { className: 'umm-rec-author' }, author) : null,
      React.createElement(UmmRating, { score: rating || undefined }),
    )
  }

  return React.createElement(
    'a',
    {
      href,
      className: 'umm-card',
      target: '_blank',
      rel: 'noopener noreferrer',
      title: intro || undefined,
    },
    React.createElement(UmmStatusBadgeWrapper, {
      status: badgeStatus,
      rating: badgeRating,
      variant: badgeVariant,
      type,
    }),
    React.createElement('div', { className: 'umm-card-cover' },
      React.createElement(UmmImageWrapper, {
        src: posterUrl,
        alt: title,
        eager: true,
        aspectRatio: cardAspect,
      }),
      episodes ? React.createElement('div', { className: 'umm-episodes' }, episodes) : null,
    ),
    React.createElement('div', { className: 'umm-card-title' }, title),
    React.createElement(UmmRating, { score: rating || undefined }),
  )
}
