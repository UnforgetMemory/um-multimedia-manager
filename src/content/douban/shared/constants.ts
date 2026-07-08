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

/** Recognised physical/digital media format strings from Douban album pages. */
export const MEDIA_FORMATS = new Set([
  'CD', 'DVD', 'CD/DVD', '磁带', '数字(Digital)',
  '黑胶', 'LP', 'SACD', 'Blu-ray', 'VCD', 'LD', '流媒体', 'Digital',
])

/** Normalised display labels for media formats (shortens verbose Douban strings). */
export const FORMAT_LABELS: Record<string, string> = {
  '数字(Digital)': '数字',
  'Digital': '数字',
}

/** Maps each media format to a CSS chip colour class for visual distinction. */
export const FORMAT_COLORS: Record<string, string> = {
  'CD': 'umm-chip-cd',
  'DVD': 'umm-chip-dvd',
  'CD/DVD': 'umm-chip-cd-dvd',
  '磁带': 'umm-chip-cassette',
  '数字': 'umm-chip-digital',
  '黑胶': 'umm-chip-vinyl',
  'LP': 'umm-chip-lp',
  'SACD': 'umm-chip-sacd',
  'Blu-ray': 'umm-chip-bluray',
  'VCD': 'umm-chip-vcd',
  '流媒体': 'umm-chip-streaming',
}