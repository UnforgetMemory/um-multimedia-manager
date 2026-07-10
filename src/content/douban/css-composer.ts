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
const PAGE_CSS_PRESETS: Record<PageType['type'], { shared: string[]; page: string[] }> = {
  'homepage':         { shared: ['design-tokens', 'theme', 'breakpoints', 'page-layout', 'base'], page: ['homepage'] },
  'music-homepage':   { shared: ['design-tokens', 'theme', 'breakpoints', 'page-layout', 'base'], page: ['homepage', 'music-homepage'] },
  'book-homepage':    { shared: ['design-tokens', 'theme', 'breakpoints', 'page-layout', 'base'], page: ['homepage', 'book-homepage'] },
  'book-profile':     { shared: ['design-tokens', 'theme', 'breakpoints', 'page-layout', 'base'], page: ['book-profile'] },
  'detail':           { shared: ['design-tokens', 'theme', 'breakpoints', 'page-layout', 'base'], page: ['detail', 'interest'] },
  'search':           { shared: ['design-tokens', 'theme', 'page-layout', 'base'], page: ['search'] },
  'photos':           { shared: ['design-tokens', 'theme', 'breakpoints', 'page-layout', 'base'], page: ['photos'] },
  'trailer':          { shared: ['design-tokens', 'theme', 'breakpoints', 'page-layout', 'base'], page: ['trailer'] },
  'video':            { shared: ['design-tokens', 'theme', 'breakpoints', 'page-layout', 'base'], page: ['trailer'] },
  'celebrities':      { shared: ['design-tokens', 'theme', 'breakpoints', 'page-layout', 'base'], page: ['celebrities'] },
  'personage':        { shared: ['design-tokens', 'theme', 'breakpoints', 'page-layout', 'base'], page: ['personage'] },
  'user-profile':     { shared: ['design-tokens', 'theme', 'breakpoints', 'page-layout', 'base'], page: ['user-profile'] },
  'movie-profile':    { shared: ['design-tokens', 'theme', 'breakpoints', 'page-layout', 'base'], page: ['movie-profile'] },
  'doulists':         { shared: ['design-tokens', 'theme', 'breakpoints', 'page-layout', 'base', 'userbar', 'paginator'], page: ['doulists'] },
  'doulist-detail':   { shared: ['design-tokens', 'theme', 'breakpoints', 'page-layout', 'base'], page: ['doulist-detail'] },
  'user-media':       { shared: ['design-tokens', 'theme', 'breakpoints', 'page-layout', 'base', 'userbar', 'paginator'], page: ['user-media'] },
  'user-celebrities': { shared: ['design-tokens', 'theme', 'breakpoints', 'page-layout', 'base', 'userbar', 'paginator'], page: ['user-celebrities'] },
  'user-reviews':     { shared: ['design-tokens', 'theme', 'breakpoints', 'page-layout', 'base', 'userbar'], page: ['user-reviews'] },
  'book-reviews':     { shared: ['design-tokens', 'theme', 'breakpoints', 'page-layout', 'base', 'userbar'], page: ['book-reviews'] },
  'review-detail':    { shared: ['design-tokens', 'theme', 'breakpoints', 'page-layout', 'base'], page: ['review-detail'] },
  'book-review-detail': { shared: ['design-tokens', 'theme', 'breakpoints', 'page-layout', 'base'], page: ['book-review-detail'] },
  'book-collect':     { shared: ['design-tokens', 'theme', 'breakpoints', 'page-layout', 'base', 'userbar', 'paginator'], page: ['book-collect'] },
  'book-authors':     { shared: ['design-tokens', 'theme', 'breakpoints', 'page-layout', 'base', 'userbar', 'paginator'], page: ['book-authors'] },
  'genre':            { shared: ['design-tokens', 'theme', 'page-layout', 'base'], page: ['genre'] },
  'artists-overview': { shared: ['design-tokens', 'theme', 'page-layout', 'base'], page: ['artists-overview'] },
  'game-collect':     { shared: ['design-tokens', 'theme', 'breakpoints', 'page-layout', 'base', 'userbar', 'paginator'], page: ['game-collect'] },
  'game-detail':      { shared: ['design-tokens', 'theme', 'breakpoints', 'page-layout', 'base'], page: ['detail', 'interest', 'game-detail'] },
  'albums':           { shared: ['design-tokens', 'theme', 'breakpoints', 'page-layout', 'base'], page: ['albums'] },
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
