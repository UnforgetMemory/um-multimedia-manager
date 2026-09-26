import type { PageType } from './shared/url-detector'

/**
 * CSS composition utility for Shadow DOM injection.
 * Aggregates multiple ?raw CSS imports into one string with labelled sections,
 * then injected into the shadow host via innerHTML.
 * NOTE: @import is NOT resolved in ?raw CSS — must compose explicitly.
 */

/** A named CSS chunk for composition. */
export interface CssChunk {
  name: string
  css: string
}

/**
 * Concatenate named CSS chunks into a single string with labelled section headers.
 * Each chunk is wrapped with a /* === name === *\/ header for readability in devtools.
 */
export function composeStyles(...chunks: CssChunk[]): string {
  return chunks.map(c => `/* === ${c.name} === */\n${c.css}\n`).join('\n')
}

/** Each page type's CSS preset — maps to the CSS chunk names used in main.ts */
/**
 * Base shared chunks composed FIRST for every page, in order:
 * 1. static-tokens — Tier-1 palette (:root,:host), single source of raw values (ADR-018)
 * 2. design-tokens — Tier-2 semantic aliases (light + :host(.umm-theme--dark))
 * 3. theme        — legacy alias bridge (--umm-bg etc.)
 * 4+. layout/shared components
 */
const BASE_SHARED: string[] = ['static-tokens', 'design-tokens', 'theme', 'breakpoints', 'page-layout', 'base']

const PAGE_CSS_PRESETS: Record<PageType['type'], { shared: string[]; page: string[] }> = {
  'homepage':         { shared: BASE_SHARED, page: ['homepage'] },
  'music-homepage':   { shared: BASE_SHARED, page: ['homepage', 'music-homepage'] },
  'book-homepage':    { shared: BASE_SHARED, page: ['homepage', 'book-homepage'] },
  'book-profile':     { shared: [...BASE_SHARED, 'empty-state', 'statbar'], page: ['book-profile'] },
  'detail':           { shared: BASE_SHARED, page: ['detail', 'interest'] },
  'search':           { shared: [...BASE_SHARED, 'media-chips'], page: ['search'] },
  'photos':           { shared: BASE_SHARED, page: ['photos'] },
  'trailer':          { shared: BASE_SHARED, page: ['trailer'] },
  'video':            { shared: BASE_SHARED, page: ['trailer'] },
  'celebrities':      { shared: BASE_SHARED, page: ['celebrities'] },
  'personage':        { shared: BASE_SHARED, page: ['personage'] },
  'personage-creations': { shared: [...BASE_SHARED, 'paginator'], page: ['personage-creations'] },
  'user-profile':     { shared: [...BASE_SHARED, 'empty-state', 'statbar'], page: ['user-profile'] },
  'movie-profile':    { shared: [...BASE_SHARED, 'statbar'], page: ['movie-profile'] },
  'music-profile':    { shared: [...BASE_SHARED, 'statbar'], page: ['music-profile'] },
  'doulists':         { shared: [...BASE_SHARED, 'userbar', 'paginator'], page: ['doulists'] },
  'doulist-detail':   { shared: BASE_SHARED, page: ['doulist-detail'] },
  'user-media':       { shared: [...BASE_SHARED, 'userbar', 'paginator', 'titlebar'], page: ['user-media'] },
  'user-celebrities': { shared: [...BASE_SHARED, 'userbar', 'paginator', 'titlebar', 'empty-state'], page: ['user-celebrities'] },
  'user-reviews':     { shared: [...BASE_SHARED, 'userbar', 'paginator', 'titlebar', 'empty-state'], page: ['user-reviews'] },
  'book-reviews':     { shared: [...BASE_SHARED, 'userbar', 'paginator', 'titlebar', 'empty-state'], page: ['book-reviews'] },
  'review-detail':    { shared: BASE_SHARED, page: ['review-detail'] },
  'book-review-detail': { shared: [...BASE_SHARED, 'review-detail'], page: ['book-review-detail'] },
  'book-collect':     { shared: [...BASE_SHARED, 'userbar', 'paginator', 'titlebar'], page: ['book-collect'] },
  'book-authors':     { shared: [...BASE_SHARED, 'userbar', 'paginator', 'titlebar', 'empty-state'], page: ['book-authors'] },
  'genre':            { shared: BASE_SHARED, page: ['genre'] },
  'artists-overview': { shared: BASE_SHARED, page: ['artists-overview'] },
  'game-collect':     { shared: [...BASE_SHARED, 'userbar', 'paginator', 'titlebar'], page: ['game-collect'] },
  'game-detail':      { shared: BASE_SHARED, page: ['detail', 'interest', 'game-detail'] },
  'game-explore':     { shared: BASE_SHARED, page: ['game-explore'] },
  'albums':           { shared: [...BASE_SHARED, 'media-chips'], page: ['albums'] },
  'series':           { shared: BASE_SHARED, page: ['series'] },
  'music-collect':    { shared: [...BASE_SHARED, 'userbar', 'paginator', 'titlebar'], page: ['music-collect'] },
}

/**
 * Build a composed CSS string for a given page type and a CSS chunk map.
 * Selects the correct shared + page-specific chunks from the preset, plus any
 * extra chunks passed by the caller.
 */
export function composeStylesForPage(
  pageType: PageType['type'],
  cssMap: Record<string, string>,
  extra?: CssChunk[],
): string {
  const preset = PAGE_CSS_PRESETS[pageType]
  const chunks: CssChunk[] = []
  for (const name of preset.shared) {
    if (cssMap[name]) chunks.push({ name, css: cssMap[name] })
  }
  for (const name of preset.page) {
    if (cssMap[name]) chunks.push({ name, css: cssMap[name] })
  }
  if (extra) chunks.push(...extra)
  return composeStyles(...chunks)
}
