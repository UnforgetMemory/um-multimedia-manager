/**
 * Single source of truth for the Options tabs' URL/ID parsing chain
 * (RatingTab + LinkedTab previously carried diverged copies).
 *
 * Pure: no Vue state, no i18n, no store access. Failures carry an i18n key
 * (`errorKey`) so each caller localizes on its own. Lives in the options
 * entrypoint rather than `libraries/` because it depends on provider +
 * scenario helpers, which the layer guard forbids for libraries.
 */
import type { Domain, Provider } from '@/libraries/config';
import { doubanRecordType } from '@/scenario/douban/shared/subject-keys';
import { normalizeAvId } from '@/provider/adult-av/models';
import { JAV_ID_REGEX } from '@/provider/adult-av/auto-detect';

export type RecordProvider = Provider | 'jav_ids';

export interface ParseSuccess {
  valid: true;
  type: string;
  provider: RecordProvider;
  providerId: string;
  url: string;
}

export interface ParseFailure {
  valid: false;
  type: string;
  provider: RecordProvider;
  /** Echo of the raw input — never write this key to the database. */
  providerId: string;
  url: '';
  errorKey: string;
}

export type ParseResult = ParseSuccess | ParseFailure;

const YOUTUBE_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

/** Canonical watch URL; no trailing slash — it would land inside the `v` query value. */
function youtubeUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}

/**
 * Extract a video id from youtube.com / youtu.be URLs via URL parsing —
 * the old `/watch?v=`-anchored regex could never match /shorts/, /embed/
 * or short links. Returns null when no known youtube host is present,
 * the empty string when a youtube URL carries a malformed video id.
 */
function parseYouTubeVideoId(input: string): string | null {
  if (!/(youtube\.com|youtu\.be)\//i.test(input)) return null;
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    try {
      url = new URL(`https://${input}`);
    } catch {
      return '';
    }
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (host !== 'youtu.be' && host !== 'youtube.com' && host !== 'm.youtube.com') return null;
  const accept = (id: string): string => (YOUTUBE_ID_REGEX.test(id) ? id : '');
  if (host === 'youtu.be') return accept(url.pathname.slice(1).split('/')[0] ?? '');
  if (url.pathname === '/watch') return accept(url.searchParams.get('v') ?? '');
  const seg = url.pathname.match(/^\/(shorts|embed)\/([^/?#]+)/i);
  return accept(seg?.[2] ?? '');
}

function validateAndNormalizeProviderId(
  provider: RecordProvider,
  rawId: string,
): { valid: true; normalizedId: string } | { valid: false; errorKey: string } {
  const trimmed = rawId.trim();
  if (!trimmed) return { valid: false, errorKey: 'validation.idRequired' };
  if (provider === 'imdb') {
    if (/^tt\d+$/i.test(trimmed)) return { valid: true, normalizedId: trimmed.toLowerCase() };
    if (/^\d+$/.test(trimmed)) return { valid: true, normalizedId: `tt${trimmed}` };
    return { valid: false, errorKey: 'validation.imdbFormat' };
  }
  if (provider === 'douban') {
    if (/^\d+$/.test(trimmed)) return { valid: true, normalizedId: trimmed };
    return { valid: false, errorKey: 'validation.doubanFormat' };
  }
  if (provider === 'neodb') {
    if (/^[\w-]+$/.test(trimmed)) return { valid: true, normalizedId: trimmed };
    return { valid: false, errorKey: 'validation.neodbFormat' };
  }
  if (provider === 'tmdb') {
    if (/^\d+$/.test(trimmed)) return { valid: true, normalizedId: trimmed };
    return { valid: false, errorKey: 'validation.tmdbFormat' };
  }
  if (provider === 'jav_ids') {
    if (JAV_ID_REGEX.test(trimmed)) return { valid: true, normalizedId: normalizeAvId(trimmed) };
    return { valid: false, errorKey: 'validation.javFormat' };
  }
  if (provider === 'bilibili') {
    if (/^BV[a-zA-Z0-9]+$/.test(trimmed)) return { valid: true, normalizedId: trimmed };
    return { valid: false, errorKey: 'validation.bilibiliFormat' };
  }
  if (provider === 'youtube') {
    if (YOUTUBE_ID_REGEX.test(trimmed)) return { valid: true, normalizedId: trimmed };
    return { valid: false, errorKey: 'validation.youtubeFormat' };
  }
  if (provider === 'bangumi') {
    if (/^\d+$/.test(trimmed)) return { valid: true, normalizedId: trimmed };
    return { valid: false, errorKey: 'validation.bangumiFormat' };
  }
  return { valid: false, errorKey: 'validation.unknownPlatform' };
}

/**
 * Parse a user-entered URL or bare ID for the given platform selection.
 * A recognized URL always wins over the selected platform; a bare ID is
 * validated against it.
 */
export function parseRecordInput(
  rawInput: string,
  provider: RecordProvider,
  domain: Domain,
  javSource = 'local',
): ParseResult {
  const input = rawInput.trim();
  const fail = (errorKey: string): ParseFailure => ({
    valid: false,
    type: domain,
    provider,
    providerId: input,
    url: '',
    errorKey,
  });
  if (!input) return fail('validation.idRequired');

  // URL-based parsing
  const doubanMatch = input.match(/(movie|book|music)\.douban\.com\/subject\/(\d+)/i);
  if (doubanMatch) {
    // Classify from the captured subdomain only — a whole-input
    // `includes('book')` mislabels ?from=book-list links as books.
    const subdomain = doubanMatch[1]!.toLowerCase();
    const id = doubanMatch[2]!;
    return {
      valid: true,
      type: subdomain,
      provider: 'douban',
      providerId: id,
      url: `https://${subdomain}.douban.com/subject/${id}/`,
    };
  }
  const imdbMatch = input.match(/imdb\.com\/title\/(tt\d+)/i);
  if (imdbMatch) {
    const id = (imdbMatch[1] ?? '').toLowerCase();
    return {
      valid: true,
      type: 'movie',
      provider: 'imdb',
      providerId: id,
      url: `https://www.imdb.com/title/${id}/`,
    };
  }
  const neodbMatch = input.match(/neodb\.social\/(movie|tv|album)\/([\w-]+)/);
  if (neodbMatch) {
    const pathType = neodbMatch[1]!;
    const id = neodbMatch[2]!;
    return {
      valid: true,
      type: pathType === 'album' ? 'music' : pathType,
      provider: 'neodb',
      providerId: id,
      url: `https://neodb.social/${pathType}/${id}/`,
    };
  }
  const tmdbMovieMatch = input.match(/themoviedb\.org\/movie\/(\d+)/);
  if (tmdbMovieMatch) {
    const id = tmdbMovieMatch[1]!;
    return {
      valid: true,
      type: 'movie',
      provider: 'tmdb',
      providerId: id,
      url: `https://www.themoviedb.org/movie/${id}/`,
    };
  }
  const tmdbTvMatch = input.match(/themoviedb\.org\/tv\/(\d+)/);
  if (tmdbTvMatch) {
    const id = tmdbTvMatch[1]!;
    return {
      valid: true,
      type: 'tv',
      provider: 'tmdb',
      providerId: id,
      url: `https://www.themoviedb.org/tv/${id}/`,
    };
  }
  const bilibiliMatch = input.match(/bilibili\.com\/video\/(BV[a-zA-Z0-9]+)/i);
  if (bilibiliMatch) {
    const id = bilibiliMatch[1]!;
    return {
      valid: true,
      type: 'video',
      provider: 'bilibili',
      providerId: id,
      url: `https://www.bilibili.com/video/${id}/`,
    };
  }
  const ytId = parseYouTubeVideoId(input);
  if (ytId !== null) {
    if (!ytId) return fail('validation.youtubeFormat');
    return {
      valid: true,
      type: 'video',
      provider: 'youtube',
      providerId: ytId,
      url: youtubeUrl(ytId),
    };
  }
  const bangumiMatch = input.match(/(?:bgm\.tv|bangumi\.tv|chii\.in)\/subject\/(\d+)/i);
  if (bangumiMatch) {
    const id = bangumiMatch[1]!;
    return {
      valid: true,
      type: 'tv',
      provider: 'bangumi',
      providerId: id,
      url: `https://bgm.tv/subject/${id}/`,
    };
  }

  // JAV codes only parse under the jav_ids platform — the key embeds the source
  if (provider === 'jav_ids') {
    const validation = validateAndNormalizeProviderId(provider, input);
    if (!validation.valid) return fail(validation.errorKey);
    return {
      valid: true,
      type: 'jav_ids',
      provider: 'jav_ids',
      providerId: `${javSource}::${validation.normalizedId}`,
      url: '',
    };
  }

  // Bare ID: validated against the selected platform
  const validation = validateAndNormalizeProviderId(provider, input);
  if (!validation.valid) return fail(validation.errorKey);
  const nId = validation.normalizedId;
  let type: string = domain;
  let url = '';
  if (provider === 'bangumi') {
    // Bangumi subject URLs never encode media type; canonical type is always 'tv'
    // (matches Identity.fromUrl + LinkedTab) so saves land on `tv::<id>` keys.
    type = 'tv';
    url = `https://bgm.tv/subject/${nId}/`;
  } else if (provider === 'douban') {
    type = doubanRecordType(domain);
    url =
      type === 'music'
        ? `https://music.douban.com/subject/${nId}/`
        : type === 'book'
          ? `https://book.douban.com/subject/${nId}/`
          : type === 'game'
            ? `https://www.douban.com/game/${nId}/`
            : `https://movie.douban.com/subject/${nId}/`;
  } else if (provider === 'imdb') url = `https://www.imdb.com/title/${nId}/`;
  else if (provider === 'neodb') {
    const p = type === 'tv' ? 'tv' : type === 'music' ? 'album' : 'movie';
    url = `https://neodb.social/${p}/${nId}/`;
  } else if (provider === 'tmdb')
    url =
      type === 'tv'
        ? `https://www.themoviedb.org/tv/${nId}/`
        : `https://www.themoviedb.org/movie/${nId}/`;
  else if (provider === 'bilibili') url = `https://www.bilibili.com/video/${nId}/`;
  else if (provider === 'youtube') url = youtubeUrl(nId);
  return { valid: true, type, provider, providerId: nId, url };
}
