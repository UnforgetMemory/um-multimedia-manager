import { extractImdbIdFromText } from '@/content/douban/shared/imdb-extract'

/**
 * Search query normalizer for Douban search enhancement.
 * Shared between content enhancers and popup components.
 */

/**
 * Standardize search query for Douban.
 *
 * Handles PT release naming patterns:
 * - "The.Great.Escaper.2023.1080p.BluRay" → "The Great Escaper 2023"
 * - "A.Knight.of.the.Seven.Kingdoms.S01.1080p.WEB-DL.DDP5.1.x265.10bit-Yumi@FRDS"
 *   → "A Knight of the Seven Kingdoms Season 1"
 * - "记忆碎片[2000].Memento.1080p" → "记忆碎片 2000 Memento"
 * - "S03E1" / "S03.E01" / "S3E1" → "Season 3"
 * - "Season 01" / "Episode 01" → "Season 1"
 * - "Mean.Streets.1973.CC.2160p.UHD.BluRay.x265.10bit.DV.FLAC.1.0-ADE"
 *   → "Mean Streets 1973" (CC/Criterion/RESTORED/… special markers stripped)
 *
 * Strategy:
 * 1. Convert season/episode markers to Douban-supported "Season N" format
 *    (preserving the actual season number).
 * 2. Drop version-release tokens (PROPER/REPACK/TRUHD/DUAL/…) and special
 *    edition markers that appear before the resolution (CC/RESTORED/…).
 *    UNCUT/DC are excluded — they collide with real titles (Uncut Gems, AC/DC).
 * 3. Cut everything from the first strong release-marker (resolution, source,
 *    codec — tokens that essentially never appear in a real title) onward,
 *    unless the text after the marker contains CJK characters — in that case
 *    the marker is part of a Chinese search phrase (e.g. "4K修复版") and is
 *    preserved.
 *
 * The result is idempotent: normalizing an already-normalized query is a no-op,
 * which matters because the search results page feeds the query back into the
 * search input.
 */
export function normalizeSearchQuery(raw: string): string {
  // IMDb URL fast-path: extract the tt-id BEFORE any character substitution.
  // The URL contains '.'/'/'/':' which the substitution below would otherwise
  // shred into garbage tokens ("https www imdb com title tt22084616").
  // Douban's search understands tt-ids directly.
  const imdbId = extractImdbIdFromText(raw.trim())
  if (imdbId) return imdbId

  let s = raw
    .replace(/\./g, ' ')
    .replace(/[[\]()（）【】「」『』〈〉《》]/g, ' ')
    .replace(/[*#@!~`%^&+=|\\{}:;"'<>,?/]/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  // Convert season/episode markers to Douban-supported "Season N" format
  // Handles: S03E1, S3E1, S01.E01, S01 E01, Season 01, Episode 01
  // Lazy \s quantifiers avoid backtracking on crafted inputs.
  s = s
    .replace(/\bS(\d{1,2})(?:\.?\s*?E\d{1,2})?\b/gi, (_, season: string) => `Season ${parseInt(season)}`)
    .replace(/\b(?:Season|Episode)\s+?0+(\d{1,2})\b/gi, (_, n: string) => `Season ${parseInt(n)}`)
    .trim()

  // Drop version-release tokens that may appear before resolution markers
  // (TRUHD/DUAL/MULTi/HYBRID are audio/language flags that occur without a
  // resolution marker and are never part of a title.)
  // `V\d+` (V2/V3/…) are release version markers in PT filenames — strip them
  // as standalone tokens too (e.g. "Wrinkles.2011.V2.1080p" → "Wrinkles 2011").
  // `CC` (Criterion Collection), `RESTORED`, `THEATRICAL`, `DUBBED` are
  // special-edition markers that commonly precede the resolution marker
  // (e.g. "Mean.Streets.1973.CC.2160p") — stripping them as standalone tokens
  // keeps the year intact when it follows the marker.
  // NOTE: UNCUT/DC are deliberately NOT listed — "Uncut Gems" and "AC/DC" /
  // "DC League of Super-Pets" are real titles and the collision cost outweighs
  // the strip benefit.
  // The CJK negative lookahead mirrors the cut-list guard: a Latin token
  // followed by CJK is a Chinese search phrase (e.g. "CC字幕"), not release
  // metadata — keep it.
  s = s
    .replace(/\bCriterion\b(?:\s+Collection)?/gi, ' ')
    .replace(
      /\b(?:iNTERNAL|PROPER|REPACK|EXTENDED|UNRATED|REMASTERED|COMPLETE|RERIP|FIXED|LiMiTED|TRUHD|DUAL|MULTi|HYBRID|CC|RESTORED|THEATRICAL|DUBBED)\b(?!\s*[\u3400-\u9fff])/gi,
      ' ',
    )
    .replace(/\bV\d+\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  // Strong release markers: cut everything from the first occurrence onward.
  // These tokens (resolution/source/codec/audio) essentially never appear in a
  // title, so they safely delimit the end of the searchable title. WEB.DL's
  // dot matches the space that preprocessing already inserted after `-`.
  const releaseCut = s.search(
    /\b(?:2160p|1080p|1080i|720p|576p|480p|4k|8k|WEB.DL|WEBRip|BluRay|BDRip|HDTV|HDTVRip|HDRip|REMUX|DVDRip|UHD|DV|HDR10|HDR|IMAX|DTS|FLAC|DDP|AAC|AC3|Atmos|TrueHD|x264|x265|h264|h265|HEVC|AVC|AV1|10bit)\b/i,
  )
  if (releaseCut !== -1) {
    const tail = s.slice(releaseCut)
    // CJK text right after a resolution token means the token is part of a
    // Chinese search phrase (e.g. "4K修复版"), not release metadata — keep it.
    if (!/[\u3400-\u9fff]/.test(tail)) {
      return s.slice(0, releaseCut).trim()
    }
  }

  return s
}

/**
 * Live-typing helper for the search input: collapse runs of 2+ ASCII spaces
 * into a single space so at most ONE trailing space survives while typing.
 *
 * Deliberately does NOT trim — left/right trimming happens on search trigger
 * via {@link normalizeSearchQuery}. This lets the user end their query with a
 * single space (e.g. "Mean Streets ") without it being stripped mid-typing.
 */
export function collapseInputSpaces(raw: string): string {
  return raw.replace(/ {2,}/g, ' ')
}
