import React from 'react'

interface UmmRatingProps {
  score?: string
  count?: number
}

function getTier(scoreStr: string | undefined): string | null {
  if (scoreStr === undefined) return null
  const n = parseFloat(scoreStr)
  if (isNaN(n) || n === 0) return null
  if (n >= 8) return 'umm-rating--gold-high'
  if (n >= 7) return 'umm-rating--gold-mid'
  if (n >= 5) return 'umm-rating--gold-low'
  return null
}

export const UmmRating: React.FC<UmmRatingProps> = ({ score, count }) => {
  const children: React.ReactNode[] = []

  if (score !== undefined) {
    const tier = getTier(score)
    children.push(
      React.createElement('span', {
        key: 'score',
        className: tier ? `umm-rating-score ${tier}` : 'umm-rating-score',
      }, score),
    )
  }

  if (count !== undefined && count > 0) {
    children.push(
      React.createElement('span', { key: 'count', className: 'umm-rating-count' }, `(${count})`),
    )
  }

  if (score === undefined) {
    children.push(
      React.createElement('span', { key: 'na', className: 'umm-rating-na' }, '暂无评分'),
    )
  }

  return React.createElement('span', { className: 'umm-rating' }, ...children)
}
