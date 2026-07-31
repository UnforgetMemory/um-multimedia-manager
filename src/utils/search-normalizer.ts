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
 *
 * Strategy:
 * 1. Convert season/episode markers to Douban-supported "Season N" format
 *    (preserving the actual season number).
 * 2. Drop version-release tokens (PROPER/REPACK/TRUHD/DUAL/...).
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
  let s = raw
    .replace(/\./g, ' ')
    .replace(/[[\]()（）【】「」『』〈〉《》]/g, ' ')
    .replace(/[*#@!~`%^&+=|\\{}:;"'<>,?/]/g, ' ')
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
  s = s
    .replace(
      /\b(?:iNTERNAL|PROPER|REPACK|EXTENDED|UNRATED|REMASTERED|COMPLETE|RERIP|FIXED|LiMiTED|TRUHD|DUAL|MULTi|HYBRID)\b/gi,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim()

  // Strong release markers: cut everything from the first occurrence onward.
  // These tokens (resolution/source/codec) essentially never appear in a title,
  // so they safely delimit the end of the searchable title.
  const releaseCut = s.search(
    /\b(?:2160p|1080p|1080i|720p|576p|480p|4k|8k|WEB-DL|WEBRip|BluRay|BDRip|HDTV|HDTVRip|HDRip|REMUX|DVDRip|x264|x265|h264|h265|HEVC|AVC|AV1|10bit)\b/i,
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
