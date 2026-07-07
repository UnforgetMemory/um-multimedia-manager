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
  'homepage':         { shared: ['theme', 'common', 'breakpoints', 'page-layout', 'shared-components'], page: ['homepage'] },
  'music-homepage':   { shared: ['theme', 'common', 'breakpoints', 'page-layout', 'shared-components'], page: ['homepage', 'music-homepage'] },
  'detail':           { shared: ['theme', 'common', 'breakpoints', 'page-layout', 'shared-components'], page: ['detail', 'interest'] },
  'search':           { shared: ['theme', 'common', 'page-layout', 'shared-components'], page: ['search'] },
  'photos':           { shared: ['theme', 'common', 'breakpoints', 'page-layout', 'shared-components'], page: ['photos'] },
  'trailer':          { shared: ['theme', 'common', 'breakpoints', 'page-layout', 'shared-components'], page: ['trailer'] },
  'video':            { shared: ['theme', 'common', 'breakpoints', 'page-layout', 'shared-components'], page: ['trailer'] },
  'celebrities':      { shared: ['theme', 'common', 'breakpoints', 'page-layout', 'shared-components'], page: ['celebrities'] },
  'personage':        { shared: ['theme', 'common', 'breakpoints', 'page-layout', 'shared-components'], page: ['personage'] },
  'genre':            { shared: ['theme', 'common', 'page-layout', 'shared-components'], page: ['genre'] },
  'artists-overview': { shared: ['theme', 'common', 'page-layout', 'shared-components'], page: ['artists-overview'] },
  'albums':           { shared: ['theme', 'common', 'breakpoints', 'page-layout', 'shared-components'], page: ['albums'] },
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
