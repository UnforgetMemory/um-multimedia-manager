/**
 * Shared auto-detect logic for jav_id format detection
 * Used by RatingTab and LinkedTab
 *
 * Internal seam (ADR-026 req-9): the decision is a pure mapping
 * (`detectPlatform`, no side effects, directly unit-testable);
 * `autoDetectPlatform` keeps the callback application contract.
 */

/** Regex for common jav_id formats: FC2-PPV-1234567, ABP-123, 259LUXU-1234-UC */
export const JAV_ID_REGEX = /^[A-Za-z0-9]+-[\w-]+(-[UCuc]{1,2})?$/i;

/** Pure detection result: target platform + optional domain. */
export interface PlatformDetection {
  platform: string;
  domain?: string;
}

/**
 * Detect the target platform from an input string (pure, no I/O).
 * - URL match (douban.com, imdb.com, etc.) → always auto-detect
 * - jav_id format match → only auto-detect if current platform is jav_ids
 * - Plain ID → no match, respect current platform selection
 */
export function detectPlatform(input: string, currentPlatform: string): PlatformDetection | null {
  // URL-based detection (always apply)
  if (input.includes('douban.com')) {
    return {
      platform: 'douban',
      domain: input.includes('music.douban.com')
        ? 'music'
        : input.includes('book.douban.com')
          ? 'book'
          : 'movie',
    };
  }
  if (input.includes('imdb.com') || /^tt\d+$/i.test(input)) {
    return { platform: 'imdb', domain: 'movie' };
  }
  if (input.includes('neodb.social')) {
    return {
      platform: 'neodb',
      domain: input.includes('/tv/') ? 'tv' : input.includes('/album/') ? 'music' : 'movie',
    };
  }
  if (input.includes('themoviedb.org')) {
    return { platform: 'tmdb', domain: input.includes('/tv/') ? 'tv' : 'movie' };
  }
  if (input.includes('bilibili.com/video/') || /^BV[a-zA-Z0-9]+$/.test(input)) {
    return { platform: 'bilibili', domain: 'video' };
  }
  if (
    input.includes('youtube.com/watch?v=') ||
    input.includes('youtu.be/') ||
    /^[a-zA-Z0-9_-]{11}$/.test(input)
  ) {
    return { platform: 'youtube', domain: 'video' };
  }
  if (
    (input.includes('bgm.tv') || input.includes('bangumi.tv') || input.includes('chii.in')) &&
    input.includes('/subject/')
  ) {
    return { platform: 'bangumi', domain: 'tv' };
  }

  // jav_id format detection — only if current platform is already jav_ids
  if (currentPlatform === 'jav_ids' && JAV_ID_REGEX.test(input)) {
    return { platform: 'jav_ids' };
  }

  return null;
}

/**
 * Auto-detect platform from input string and apply it through callbacks.
 * Returns whether a detection matched (see `detectPlatform` for the rules).
 */
export function autoDetectPlatform(
  input: string,
  currentPlatform: string,
  callbacks: {
    setPlatform: (platform: string) => void;
    setDomain?: (domain: string) => void;
  },
): boolean {
  const detection = detectPlatform(input, currentPlatform);
  if (!detection) return false;
  callbacks.setPlatform(detection.platform);
  if (detection.domain !== undefined) {
    callbacks.setDomain?.(detection.domain);
  }
  return true;
}
