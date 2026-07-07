/**
 * Centralized aspect ratio constants for image containers.
 * Use these constants instead of hardcoded string literals
 * to ensure consistency and prevent typos.
 */
export const ASPECT_RATIO = {
  /** Movie/TV posters, album covers, celebrity avatars: 2:3 portrait */
  POSTER: '2/3',
  /** Square album art (music homepage): 1:1 */
  SQUARE: '1',
  /** Movie stills, trailers, videos: 16:9 landscape */
  WIDE: '16/9',
} as const