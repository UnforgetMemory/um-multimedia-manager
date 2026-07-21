import React from 'react'

/**
 * UmmUserBar — shared user bar component for Douban user pages.
 *
 * Renders avatar + display name + navigation links row.
 * Uses var(--umm-*) CSS custom properties for Shadow DOM theme compatibility.
 * Appears when displayName is truthy.
 *
 * @prop avatarUrl   — optional avatar URL (rendered as background-image on a circle)
 * @prop displayName — user's display name (linked to /people/{userId}/)
 * @prop userId      — used for the display name link href
 * @prop navLinks    — array of { label, url }
 */

export interface NavLink {
  label: string
  url: string
}

export interface UmmUserBarProps {
  avatarUrl?: string
  displayName: string
  userId: string
  navLinks: NavLink[]
}

export function UmmUserBar({
  avatarUrl,
  displayName,
  userId,
  navLinks,
}: UmmUserBarProps): React.ReactElement | null {
  if (!displayName) return null

  return (
    <div className="umm-userbar">
      {avatarUrl && (
        <div
          className="umm-userbar-avatar"
          style={{ backgroundImage: `url(${avatarUrl})` }}
        />
      )}
      <div className="umm-userbar-info">
        <a
          href={`/people/${userId}/`}
          className="umm-userbar-name"
          target="_blank"
          rel="noopener noreferrer"
        >
          {displayName}
        </a>
        {navLinks.length > 0 && (
          <div className="umm-userbar-nav">
            {navLinks.map((link) => (
              <a
                key={link.url}
                href={link.url}
                className="umm-userbar-navlink"
                target="_blank"
                rel="noopener noreferrer"
              >
                {link.label}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
