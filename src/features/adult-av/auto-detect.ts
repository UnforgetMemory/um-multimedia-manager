/**
 * Shared auto-detect logic for jav_id format detection
 * Used by RatingTab and LinkedTab
 */

/** Regex for common jav_id formats: FC2-PPV-1234567, ABP-123, 259LUXU-1234-UC */
export const JAV_ID_REGEX = /^[A-Za-z0-9]+-[\w-]+(-[UCuc]{1,2})?$/i

/**
 * Auto-detect platform from input string
 * - URL match (douban.com, imdb.com, etc.) → always auto-detect
 * - jav_id format match → only auto-detect if current platform is jav_ids
 * - Plain ID → don't auto-detect, respect current platform selection
 */
export function autoDetectPlatform(
  input: string,
  currentPlatform: string,
  callbacks: {
    setPlatform: (platform: string) => void
    setDomain?: (domain: string) => void
  }
): boolean {
  // URL-based detection (always apply)
  if (input.includes('douban.com')) {
    callbacks.setPlatform('douban')
    callbacks.setDomain?.(input.includes('music.douban.com') ? 'music' : input.includes('book.douban.com') ? 'book' : 'movie')
    return true
  }
  if (input.includes('imdb.com') || /^tt\d+$/i.test(input)) {
    callbacks.setPlatform('imdb')
    callbacks.setDomain?.('movie')
    return true
  }
  if (input.includes('neodb.social')) {
    callbacks.setPlatform('neodb')
    callbacks.setDomain?.(input.includes('/tv/') ? 'tv' : input.includes('/album/') ? 'music' : 'movie')
    return true
  }
  if (input.includes('themoviedb.org')) {
    callbacks.setPlatform('tmdb')
    callbacks.setDomain?.(input.includes('/tv/') ? 'tv' : 'movie')
    return true
  }
  
  // jav_id format detection — only if current platform is already jav_ids
  if (currentPlatform === 'jav_ids' && JAV_ID_REGEX.test(input)) {
    callbacks.setPlatform('jav_ids')
    return true
  }
  
  return false
}
