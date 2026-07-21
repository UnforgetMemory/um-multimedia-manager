import React, { useMemo } from 'react'

/**
 * UmmPaginator — shared pagination component for Douban pages.
 *
 * Renders prev/next buttons + page numbers with ellipsis for large page counts.
 * Uses var(--umm-*) CSS custom properties for Shadow DOM theme compatibility.
 * Disables prev/next at boundaries; auto-hides when totalPages <= 1.
 *
 * @prop currentPage — 1-based current page number
 * @prop totalPages  — total number of pages
 * @prop onPageChange — callback when a page is selected
 */

export interface UmmPaginatorProps {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
}

/**
 * Generates the visible page window with ellipsis.
 *
 * Strategy: show first, last, currentPage ± 2, and '...' for large gaps.
 * - tp <= 7: show all pages
 * - tp > 7: 1 ... window ... last
 */
function getVisiblePages(currentPage: number, totalPages: number): (number | string)[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }
  const pages: (number | string)[] = [1]
  if (currentPage > 4) pages.push('...')
  const start = Math.max(2, currentPage - 2)
  const end = Math.min(totalPages - 1, currentPage + 2)
  for (let i = start; i <= end; i++) pages.push(i)
  if (currentPage < totalPages - 3) pages.push('...')
  if (totalPages > 1) pages.push(totalPages)
  return pages
}

export function UmmPaginator({
  currentPage,
  totalPages,
  onPageChange,
}: UmmPaginatorProps): React.ReactElement | null {
  const visiblePages = useMemo(
    () => getVisiblePages(currentPage, totalPages),
    [currentPage, totalPages],
  )

  if (totalPages <= 1) return null

  return (
    <div className="umm-paginator">
      <button
        className="umm-paginator-btn"
        disabled={currentPage <= 1}
        onClick={() => onPageChange(currentPage - 1)}
        aria-label="上一页"
      >
        ‹
      </button>
      {visiblePages.map((page) =>
        page === '...' ? (
          <span key={`ellipsis-${Math.random()}`} className="umm-paginator-ellipsis">
            …
          </span>
        ) : (
          <button
            key={page}
            className={`umm-paginator-btn${page === currentPage ? ' umm-paginator-btn--active' : ''}`}
            onClick={() => onPageChange(page as number)}
          >
            {page}
          </button>
        ),
      )}
      <button
        className="umm-paginator-btn"
        disabled={currentPage >= totalPages}
        onClick={() => onPageChange(currentPage + 1)}
        aria-label="下一页"
      >
        ›
      </button>
    </div>
  )
}
