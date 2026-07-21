import React from 'react'
import { UmmImage } from './UmmImage'

interface UmmImageWrapperProps {
  src: string
  alt: string
  className?: string
  aspectRatio?: string
  eager?: boolean
  href?: string
}

export const UmmImageWrapper: React.FC<UmmImageWrapperProps> = (props) => {
  return React.createElement(UmmImage, props)
}
