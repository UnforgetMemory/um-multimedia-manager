import React from 'react'
import { UmmStatusBadge } from './UmmStatusBadge'

interface UmmStatusBadgeWrapperProps {
  status: number
  rating?: number
  variant?: 'default' | 'small' | 'inline'
  type?: 'movie' | 'music' | 'book' | 'game'
}

export const UmmStatusBadgeWrapper: React.FC<UmmStatusBadgeWrapperProps> = (props) => {
  return React.createElement(UmmStatusBadge, props)
}
