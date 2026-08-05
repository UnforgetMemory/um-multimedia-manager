import { test, expect } from '@playwright/test'
import { ASPECT_RATIO, MEDIA_FORMATS, FORMAT_LABELS, FORMAT_COLORS } from '@/content/douban/shared/media-formats'

/**
 * media-formats — shared media-format + aspect-ratio constants (rehomed from
 * the deleted shared/constants.ts).
 *
 * Locks the contract: every recognised MEDIA_FORMATS entry must have a chip
 * colour class after label normalisation (FORMAT_LABELS → FORMAT_COLORS), so
 * album pages never render a format chip without a colour.
 */
test.describe('ASPECT_RATIO', () => {
  test('poster 2:3 portrait (movie/tv/album covers, celeb avatars)', () => {
    expect(ASPECT_RATIO.POSTER).toBe('2/3')
  })

  test('square 1:1 (music homepage album art)', () => {
    expect(ASPECT_RATIO.SQUARE).toBe('1')
  })

  test('wide 16:9 landscape (stills, trailers)', () => {
    expect(ASPECT_RATIO.WIDE).toBe('16/9')
  })
})

test.describe('MEDIA_FORMATS', () => {
  test('recognises physical formats (CD/DVD/vinyl/SACD/Blu-ray/VCD/LD)', () => {
    for (const fmt of ['CD', 'DVD', 'CD/DVD', '磁带', '黑胶', 'LP', 'SACD', 'Blu-ray', 'VCD', 'LD']) {
      expect(MEDIA_FORMATS.has(fmt), `missing ${fmt}`).toBe(true)
    }
  })

  test('recognises digital formats (both CN and EN spellings)', () => {
    expect(MEDIA_FORMATS.has('数字(Digital)')).toBe(true)
    expect(MEDIA_FORMATS.has('Digital')).toBe(true)
    expect(MEDIA_FORMATS.has('流媒体')).toBe(true)
  })

  test('every format has a chip colour after label normalisation', () => {
    for (const fmt of MEDIA_FORMATS) {
      const label = FORMAT_LABELS[fmt] ?? fmt
      expect(FORMAT_COLORS[label], `no chip colour for ${fmt} → ${label}`).toBeTruthy()
    }
  })

  test('normalised display labels shorten verbose Douban strings', () => {
    expect(FORMAT_LABELS['数字(Digital)']).toBe('数字')
    expect(FORMAT_LABELS['Digital']).toBe('数字')
  })
})
