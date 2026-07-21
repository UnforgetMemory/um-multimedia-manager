import React from 'react'

interface UmmScrollRowProps {
  title: string
  mode?: 'scroll' | 'grid'
  children?: React.ReactNode
}

/**
 * UmmScrollRow — horizontal scrollable container for card rows.
 * In 'grid' mode, renders a grid track instead of a scrollable row.
 * Ported from the Vue UmmScrollRow component.
 */
export const UmmScrollRow: React.FC<UmmScrollRowProps> = ({
  title,
  mode = 'scroll',
  children,
}) => {
  if (!children) return null

  return (
    <section className="umm-section">
      {title ? <h2 className="umm-section-hd">{title}</h2> : null}
      {mode === 'scroll' ? (
        <div className="umm-scroll-wrap">
          <div className="umm-scroll-track">
            {children}
          </div>
          <div className="umm-mask umm-mask--left" />
          <div className="umm-mask umm-mask--right" />
        </div>
      ) : (
        <div className="umm-grid-wrap">
          <div className="umm-grid-track">
            {children}
          </div>
        </div>
      )}
    </section>
  )
}
