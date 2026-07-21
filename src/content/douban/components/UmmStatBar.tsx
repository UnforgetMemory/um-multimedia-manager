import React from 'react'

/**
 * UmmStatBar — shared stat bar component for Douban pages.
 *
 * Renders stat items as a horizontal flex row: each item shows a large value
 * with a small label below. Items with a URL open the link via click handler.
 * Uses var(--umm-*) CSS custom properties for Shadow DOM theme compatibility.
 *
 * @prop items — StatBarItem[] the data to display
 * @prop title — optional group title above the grid
 */

export interface StatBarItem {
  label: string
  value: number | string
  url?: string
  active?: boolean
}

export interface UmmStatBarProps {
  items: StatBarItem[]
  title?: string
}

function formatValue(value: number | string): string {
  return typeof value === 'number' ? value.toLocaleString() : value
}

export function UmmStatBar({ items, title }: UmmStatBarProps): React.ReactElement {
  return (
    <>
      {title && <div className="umm-statbar-title">{title}</div>}
      <div className="umm-statbar-grid">
        {items.map((item) => (
          <div
            key={item.label}
            className={`umm-statbar-item${item.active ? ' umm-statbar-item--active' : ''}${item.url ? ' umm-statbar-item--clickable' : ''}`}
            tabIndex={item.url ? 0 : -1}
            role="button"
            onClick={() => {
              if (item.url) window.open(item.url, '_blank')
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && item.url) window.open(item.url, '_blank')
            }}
          >
            <span className="umm-statbar-val">{formatValue(item.value)}</span>
            <span className="umm-statbar-lbl">{item.label}</span>
          </div>
        ))}
      </div>
    </>
  )
}
