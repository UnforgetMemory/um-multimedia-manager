/**
 * Detail page data extraction and record loading.
 *
 * Thin orchestrator: re-exports from submodules and provides {@link
 * extractDetailData}, which is pure DOM extraction — record reads belong to
 * `record-loader.ts` and the page config.
 */

// Re-export all types
export type {
  RatingBar,
  MetaRow,
  CelebItem,
  AwardItem,
  PhotoItem,
  RecItem,
  ShortComment,
  BlockquoteItem,
  EditionItem,
  DetailData,
} from './types';

// Re-export core extraction helpers
export {
  extractCoreMetadata,
  extractPosterRating,
  extractRatingBars,
  extractBetterThan,
  extractMetaRows,
  extractSynopsis,
  extractAwards,
  extractRank,
} from './detail-extract';

// Re-export supplementary extraction helpers
export {
  extractCelebrities,
  extractPhotos,
  extractRecItemsDom,
  extractShortComments,
  extractAuthorBio,
  extractTOC,
  extractTrackItems,
  extractBlockquotes,
  extractEditions,
} from './extra-extract';

// Re-export record loader
export { loadRecord } from './record-loader';

import {
  extractCoreMetadata,
  extractPosterRating,
  extractRatingBars,
  extractBetterThan,
  extractMetaRows,
  extractSynopsis,
  extractAwards,
  extractRank,
} from './detail-extract';
import {
  extractCelebrities,
  extractPhotos,
  extractRecItemsDom,
  extractShortComments,
  extractAuthorBio,
  extractTOC,
  extractTrackItems,
  extractBlockquotes,
  extractEditions,
} from './extra-extract';
import type { DetailData } from './types';

/**
 * Parse the current Douban detail page DOM into DetailData.
 *
 * Reads identity (type/providerId) from URL and scrapes all sections; pure DOM
 * — no record read happens here, so a page repaint cannot be blocked on
 * IndexedDB. All HTML from the page is DOMPurify-sanitised before returning.
 * Returns null if no identity can be derived from the URL.
 */
export async function extractDetailData(): Promise<DetailData | null> {
  const meta = extractCoreMetadata();
  const { identity, isMusic, isBook, title, originalTitle, year, subtitle } = meta;
  if (!identity) return null;

  const { posterSrc, posterAlt, posterLink, ratingNum, ratingPeople, bigstarNum } =
    extractPosterRating();
  const ratingBars = extractRatingBars(isBook);
  const betterThan = extractBetterThan();
  const metaRows = extractMetaRows();
  const { synopsisHeadingKey, synopsisHtml } = extractSynopsis(isMusic, isBook);
  const { celebHeadingKey, celebItems, celebCount } = extractCelebrities(isMusic, isBook);
  const awardItems = extractAwards();
  const { rankNo, rankText, rankHref } = extractRank();
  const { photoItems, photoCount, trailerCount } = extractPhotos();
  const recItems = extractRecItemsDom();
  const shortComments = extractShortComments();
  const authorBioHtml = extractAuthorBio();
  const tocItems = extractTOC();
  const trackItems = extractTrackItems();
  const blockquoteItems = extractBlockquotes();
  const editionItems = extractEditions();

  return {
    identity,
    title,
    originalTitle,
    year,
    posterSrc,
    posterAlt,
    posterLink,
    ratingNum,
    ratingPeople,
    bigstarNum,
    ratingBars,
    betterThan,
    metaRows,
    synopsisHeadingKey,
    synopsisHtml,
    celebHeadingKey,
    celebItems,
    celebCount,
    awardItems,
    photoItems,
    photoCount,
    trailerCount,
    recItems,
    shortComments,
    rankNo,
    rankText,
    rankHref,
    isMusic,
    isBook,
    subtitle,
    authorBioHtml,
    tocItems,
    blockquoteItems,
    editionItems,
    record: null,
    trackItems,
  };
}
