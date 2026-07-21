import React, { useState } from 'react'

interface UmmImageProps {
  src: string
  alt: string
  className?: string
  aspectRatio?: string
  eager?: boolean
  href?: string
}

export const UmmImage: React.FC<UmmImageProps> = ({ src, alt, className = 'umm-image-img', aspectRatio, eager = false, href }) => {
  const [loaded, setLoaded] = useState(false)

  const img = React.createElement('img', {
    src,
    alt,
    className,
    loading: eager ? 'eager' : 'lazy',
    style: {
      width: '100%',
      height: '100%',
      objectFit: 'cover' as const,
      display: 'block',
    },
    onLoad: () => setLoaded(true),
    onError: () => setLoaded(true),
  })

  const shimmer = !loaded
    ? React.createElement('div', {
        className: 'umm-img-shimmer',
        style: {
          position: 'absolute',
          inset: '0',
          zIndex: 1,
        },
      })
    : null

  const containerStyle: React.CSSProperties = {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 'inherit',
    width: '100%',
  }
  if (aspectRatio) {
    containerStyle.aspectRatio = aspectRatio
  }

  const content = [img, shimmer].filter(Boolean)

  if (href) {
    return React.createElement('a', {
      href,
      target: '_blank',
      rel: 'noopener noreferrer',
      className: 'umm-image-container',
      style: containerStyle,
    }, ...content)
  }

  return React.createElement('div', {
    className: 'umm-image-container',
    style: containerStyle,
  }, ...content)
}
